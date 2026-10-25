import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

export function consentErrors(form, required = true) {
  if (!required && !form.consentConfirmed) return {};
  return {
    consentConfirmed:form.consentConfirmed === true ? '' : 'Confirm that consent was received from the owner or authorized representative.',
    consentName:typeof form.consentName!=='string' || !form.consentName.trim() || form.consentName.length>150 ? 'Enter the consenting person’s name (up to 150 characters).' : '',
    consentMethod:['In person','Phone','Written'].includes(form.consentMethod) ? '' : 'Choose how consent was received.',
    emergencyName:typeof form.emergencyName!=='string' || !form.emergencyName.trim() || form.emergencyName.length>150 ? 'Enter an emergency contact name (up to 150 characters).' : '',
    emergencyPhone:typeof form.emergencyPhone==='string' && form.emergencyPhone.length<=40 && parsePhoneNumberFromString(form.emergencyPhone,'PH')?.isValid() ? '' : 'Enter a valid emergency phone number, including its area or country code.',
    emergencyRelationship:typeof form.emergencyRelationship!=='string' || !form.emergencyRelationship.trim() || form.emergencyRelationship.length>100 ? 'Enter the contact’s relationship to the owner (up to 100 characters).' : '',
  };
}
