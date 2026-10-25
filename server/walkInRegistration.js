import {walkInVisitErrors} from '../src/walkInRegistration.js';
import {addressError} from '../src/externalHistory.js';
import { validatePetRegistration, registrationError } from './petRegistration.js';

export function validateWalkInRegistration(body) {
  const text = (key, max, required = false) => {
    const value = body[key] ?? '';
    if (typeof value !== 'string' || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value) || (required && !value.trim())) throw registrationError(`Check the ${key} field.`);
    return value.trim();
  };
  const ownerName = text('ownerName',60,true);
  if (ownerName.length < 2 || !/^[A-Za-zÀ-ÿ.'\- ]+$/.test(ownerName) || !/[A-Za-zÀ-ÿ]/.test(ownerName)) throw registrationError('Enter the owner’s full name.');
  const phone = text('phone',30,true).replace(/[\s-]/g,'');
  if (!/^(09|\+639)\d{9}$/.test(phone)) throw registrationError('Enter a valid Philippine mobile number.');
  const email = text('email',255);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw registrationError('Enter a valid email address or leave it blank.');
  const patient = validatePetRegistration({...body,name:body.petName});
  if (typeof body.addToQueue !== 'boolean') throw registrationError('Choose whether to add the patient to today’s arrivals.');
  const visitError=Object.values(walkInVisitErrors(body)).find(Boolean);
  if(visitError) throw registrationError(visitError);
  const address=text('address',150), invalidAddress=addressError(address);
  if(invalidAddress) throw registrationError(invalidAddress);
  return {ownerName,phone,email,address,patient};
}
