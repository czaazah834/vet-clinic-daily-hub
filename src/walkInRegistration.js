import { today, plus } from './booking.js';

export const walkInBirthWindow = () => { const date = today(); return {today:date,yesterday:plus(-1),oldest:`${Number(date.slice(0,4))-40}${date.slice(4)}`}; };
export function validWalkInBirth(value) {
  const {today:date,oldest} = walkInBirthWindow();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value && value < date && value >= oldest;
}
export function savedWalkInRegistration(data, expected) {
  if (!data?.success || !data.owner?.id || !data.pet?.id || !data.pet.vaccinationCardId) throw new Error('The server did not confirm registration. Refresh clinic records before continuing.');
  if (expected?.vaccineId !== undefined && (!data.appointment?.id || data.appointment.petId !== data.pet.id || data.appointment.vetId !== expected.vetId || data.appointment.reason !== expected.reason || data.appointment.service !== 'vaccination' || data.appointment.status !== 'Scheduled')) throw new Error('The server did not confirm the requested vaccination arrival. Refresh clinic records before continuing.');
  return {owner:data.owner,pet:data.pet,appointment:data.appointment || null,
    vacc:(data.vaccs || []).map(v => ({id:v.id,petId:v.pet_id,cardId:v.card_id,
      vaccine:v.vaccine,brand:v.brand || '',batch:v.batch || '',date:v.date || '',nextDue:v.next_due || null,
      doseNo:v.dose_no,doseOf:v.dose_of,done:Boolean(v.done),automated:Boolean(v.automated),
      vetId:v.vet_id || '',recordedBy:v.recorded_by || '',protocolType:v.protocol_type || '',notes:v.notes || ''}))};
}
