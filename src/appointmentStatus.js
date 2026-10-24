import { clinicRequest } from './clinicApi.js';
import { intakeVisitSnapshot, sameIntakeVisit } from './intakeVisit.js';

// Share the lock across calendar, dashboard and card actions using the same store.
const pending = new WeakMap();
export async function changeAppointmentStatus(setDb, id, status, onError = () => {}, expected, request = clinicRequest, details = {}) {
  let visits = pending.get(setDb);
  if (!visits) { visits = new Set(); pending.set(setDb, visits); }
  if (visits.has(id)) return false;
  visits.add(id);
  try {
    const response = await request('PATCH', `/api/appointments/${id}/status`, {
      ...details, status, ...(expected ? {expectedVisit:intakeVisitSnapshot(expected)} : {})
    });
    const saved = intakeVisitSnapshot(response?.appointment);
    if (!response?.success || saved?.id !== id || saved.status !== status || (expected && saved.petId !== expected.petId)) {
      throw new Error('The server did not confirm the appointment change. Refresh clinic records before retrying.');
    }
    const fields = Object.fromEntries(Object.entries(saved).filter(([,value]) => value !== undefined));
    setDb(previous => ({...previous,appts:previous.appts.map(visit => {
      if (visit.id !== id || (expected && !sameIntakeVisit(visit,expected))) return visit;
      return {...visit,...fields,...(status === 'Cancelled' ? {cancelReason:response.appointment.cancelReason ?? response.appointment.cancel_reason} : {})};
    })}));
    return true;
  } catch (error) {
    onError(error.message);
    return false;
  } finally {
    visits.delete(id);
    if (!visits.size) pending.delete(setDb);
  }
}
