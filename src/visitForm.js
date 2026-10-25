import {VACCINE_CHOICES,vaccineIdFromReason} from './vaccineBooking.js';
import { serviceOf } from './booking.js';
import { VACCINE_SERVICE } from './clinicalWorkflow.js';

export function visitFormType(appointment) {
  const service = serviceOf(appointment);
  if (service === 'deworming' || service === 'vaccination' && /deworm/i.test(appointment.reason || '')) return 'deworming';
  if (service === 'vaccination') return 'vaccination';
  if (service === 'grooming' || !appointment.service && /groom|sanitary/i.test(appointment.reason || '')) return 'grooming';
  return 'consultation';
}
export const visitFormTitle = type => ({vaccination:'Vaccination record',deworming:'Deworming record',grooming:'Grooming record',consultation:'SOAP Consultation'}[type]);
export function serviceMatchesVisit(service, type) {
  const preventive = Object.values(VACCINE_SERVICE).includes(service.id);
  if (type === 'vaccination') return preventive && service.id !== VACCINE_SERVICE.Deworming;
  if (type === 'deworming') return service.id === VACCINE_SERVICE.Deworming;
  if (type === 'grooming') return service.id === 'srv_groom';
  return !preventive && service.id !== 'srv_groom';
}
export function intakeSummary(vitals) {
  return `Temp: ${vitals?.temp != null ? `${vitals.temp}°C` : 'not measured'}${vitals?.tempAnalysis?.label ? ` (${vitals.tempAnalysis.label})` : ''}, Weight: ${vitals?.weight != null ? `${vitals.weight} kg` : 'not measured'}${vitals?.weightAnalysis?.label ? ` (${vitals.weightAnalysis.label})` : ''}.`;
}
// Keep the durable clinical record format used by history, checkout and PDFs.
// Hidden fields from an older draft must not add unrelated care or charges.
export function visitClinicalFields(form, appointment) {
  const type = visitFormType(appointment), consultation = type === 'consultation';
  const summary = intakeSummary(appointment.intakeVitals);
  const notes = (form.objective || '').trim();
  return {...form,
    symptoms:consultation ? form.symptoms : `Reason for visit: ${appointment.reason || visitFormTitle(type)}`,
    objective:notes.startsWith(summary) ? notes : [summary,notes].filter(Boolean).join('\n'),
    giveVaccine:['vaccination','deworming'].includes(type) && form.giveVaccine,
    scheduleFollowUp:consultation && form.scheduleFollowUp,
    prescription:consultation ? form.prescription : '',
  };
}

export function initialVaccineForVisit(appointment) {
  if (visitFormType(appointment)==='deworming') return 'Deworming';
  const choice=VACCINE_CHOICES.find(v=>v.id===vaccineIdFromReason(appointment.reason));
  if (!choice || choice.id==='vet-review') return '';
  return choice.id==='bordetella' ? 'Kennel cough' : choice.name;
}
