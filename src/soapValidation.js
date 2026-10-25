import {boosterDate} from './clinicalWorkflow.js';
// Match the consultation endpoint's SOAP, date and weight limits before sending.
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export function validateSoapFields(form, today, birth) {
  const errors = {};
  for (const [field, label] of [['symptoms','Subjective history'], ['objective','Objective examination'], ['diagnosis','Assessment / Diagnosis'], ['treatment','Plan / Treatment']]) {
    if (!String(form[field] || '').trim()) errors[field] = `${label} is required.`;
    else if (form[field].length > 10000) errors[field] = `${label} cannot exceed 10,000 characters.`;
  }
  if (!validDate(form.date) || form.date > today) errors.date = 'Enter a valid consultation date that is not in the future.';
  if (birth && validDate(form.date) && form.date < birth) errors.date = 'The consultation date cannot be before the patient’s birth.';
  if (form.weight !== '' && form.weight != null && (!Number.isFinite(Number(form.weight)) || Number(form.weight) <= 0 || Number(form.weight) > 120)) {
    errors.weight = 'Enter a weight greater than 0 and no more than 120 kg, or leave it blank.';
  }
  if (String(form.prescription || '').length > 3000) errors.prescription = 'Prescription notes cannot exceed 3,000 characters.';
  if (form.giveVaccine) {
    if (!form.vaccine) errors.vaccine='Please select the administered biological / vaccine.';
    if (!Number.isInteger(Number(form.doseNo)) || Number(form.doseNo)<1 || Number(form.doseNo)>20) errors.doseNo='Enter the administered dose number (1–20).';
    if (!Number.isInteger(Number(form.doseOf)) || Number(form.doseOf)<1 || Number(form.doseOf)>20 || Number(form.doseOf)<Number(form.doseNo)) errors.doseOf='Total planned doses must be 1–20 and at least the administered dose number.';
    if (!boosterDate(form.date,form.intervalDays)) errors.intervalDays='Enter a whole booster interval from 1 to 3,650 days and a valid administration date.';
    if (!form.scheduleApproved) errors.scheduleApproved='Approve the booster interval for this patient.';
    if (!String(form.brand || '').trim()) errors.brand='Vaccine manufacturer brand name is required.';
    if (!String(form.batch || '').trim()) errors.batch='Lot / Batch number is required for official certification.';
  }
  if (form.scheduleFollowUp) {
    if (!['Follow-up required','Recheck required'].includes(form.careStatus)) errors.careStatus = 'Choose a supported follow-up status.';
    if (!validDate(form.followUpDate) || form.followUpDate < today) errors.followUpDate = 'Follow-up date must be a real date, today or in the future.';
    if (!String(form.followUpReason || '').trim() || form.followUpReason.length > 2000) errors.followUpReason = 'Enter follow-up instructions of no more than 2,000 characters.';
    const note = `\nFollow-up requested for ${form.followUpDate}: ${String(form.followUpReason || '').trim()}. Reception to confirm scheduling.`;
    if (String(form.treatment || '').trim().length + note.length > 10000) errors.treatment = 'Plan and appended follow-up instructions cannot exceed 10,000 characters.';
  }
  return errors;
}
