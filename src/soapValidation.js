// Match the consultation endpoint's SOAP, date and weight limits before sending.
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export function validateSoapFields(form, today) {
  const errors = {};
  for (const [field, label] of [['symptoms','Subjective history'], ['objective','Objective examination'], ['diagnosis','Assessment / Diagnosis'], ['treatment','Plan / Treatment']]) {
    if (!String(form[field] || '').trim()) errors[field] = `${label} is required.`;
    else if (form[field].length > 10000) errors[field] = `${label} cannot exceed 10,000 characters.`;
  }
  if (!validDate(form.date) || form.date > today) errors.date = 'Enter a valid consultation date that is not in the future.';
  if (form.weight !== '' && form.weight != null && (!Number.isFinite(Number(form.weight)) || Number(form.weight) <= 0 || Number(form.weight) > 120)) {
    errors.weight = 'Enter a weight greater than 0 and no more than 120 kg, or leave it blank.';
  }
  if (String(form.prescription || '').length > 3000) errors.prescription = 'Prescription notes cannot exceed 3,000 characters.';
  if (form.scheduleFollowUp) {
    if (!['Follow-up required','Recheck required'].includes(form.careStatus)) errors.careStatus = 'Choose a supported follow-up status.';
    if (!validDate(form.followUpDate) || form.followUpDate < today) errors.followUpDate = 'Follow-up date must be a real date, today or in the future.';
    if (!String(form.followUpReason || '').trim() || form.followUpReason.length > 2000) errors.followUpReason = 'Enter follow-up instructions of no more than 2,000 characters.';
    const note = `\nFollow-up requested for ${form.followUpDate}: ${String(form.followUpReason || '').trim()}. Reception to confirm scheduling.`;
    if (String(form.treatment || '').trim().length + note.length > 10000) errors.treatment = 'Plan and appended follow-up instructions cannot exceed 10,000 characters.';
  }
  return errors;
}
