// Initial arrivals must use their reserved clinic day; ongoing intake can cross midnight.
export function checkInDateError(visit, clinicDate) {
  if (visit?.status !== 'Checked-in' && visit?.date !== clinicDate) {
    return `Check-in is only available on the scheduled day (${visit?.date || 'date missing'}). Today in Manila is ${clinicDate}. Reschedule the appointment first if the day is incorrect.`;
  }
  return null;
}

// Both the browser and the locked database row use this intake-edit baseline.
export function intakeVisitSnapshot(visit) {
  if (!visit) return null;
  return {id:visit.id,petId:visit.petId ?? visit.pet_id,vetId:visit.vetId ?? visit.vet_id,
    date:visit.date,time:visit.time,reason:visit.reason,status:visit.status,
    intakeVitals:visit.intakeVitals ?? visit.intake_vitals ?? null};
}
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])) : value;
export const sameIntakeVisit = (a,b) => JSON.stringify(ordered(intakeVisitSnapshot(a))) === JSON.stringify(ordered(intakeVisitSnapshot(b)));

export function savedIntakeVisit(response, expected) {
  const visit = intakeVisitSnapshot(response?.appointment);
  const vitals = visit?.intakeVitals;
  if (!response?.success || !visit?.id || visit.id !== expected.id || visit.petId !== expected.petId || visit.status !== 'Checked-in'
      || !Number.isFinite(vitals?.weight) || !Number.isFinite(vitals?.temp) || !visit.date) {
    throw new Error('The server did not confirm the saved intake. Refresh clinic records before continuing.');
  }
  const bookingKind = response.appointment.bookingKind ?? response.appointment.booking_kind;
  return {...visit,...(bookingKind ? {bookingKind} : {})};
}
