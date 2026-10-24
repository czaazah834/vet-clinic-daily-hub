import { Country } from 'country-state-city';
import { countryInfo, checkMobile, checkEmail, checkAddress } from './geo.js';
import { clinicClock, validDate } from './scheduling.js';
import { validatePasswordComplexity } from './security.js';

// Accept the public form's names and its historical camelCase API aliases.
export async function validateOwnerRegistration(body = {}) {
  const text = value => typeof value === 'string' ? value.trim() : '';
  const firstName = text(body.first_name ?? body.firstName);
  const lastName = text(body.last_name ?? body.lastName);
  const middleInitial = text(body.middle_initial ?? body.middleInitial).replace(/\.$/, '').toUpperCase();
  let birthday = text(body.birthday);
  const usDate = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(birthday);
  if (usDate) birthday = `${usDate[3]}-${usDate[1]}-${usDate[2]}`;
  const address = body.address && typeof body.address === 'object' ? body.address : {};
  const houseStreet = text(body.house_street ?? address.houseStreet ?? (typeof body.address === 'string' ? body.address : ''));
  const countryValue = text(body.country ?? address.country);
  const country = countryInfo(countryValue) || countryInfo(Country.getAllCountries().find(c => c.name.toLowerCase() === countryValue.toLowerCase())?.isoCode);
  const state = text(body.state ?? address.state), city = text(body.city ?? address.city);
  const zipCode = text(body.zip_code ?? address.zipCode).toUpperCase();
  const email = text(body.email).toLowerCase();
  const errors = {};
  for (const [key, value] of [['first_name', firstName], ['last_name', lastName]]) {
    if (!/^(?=.*\p{L})[\p{L}\p{M}'’ -]{2,50}$/u.test(value)) errors[key] = 'Use 2–50 letters, spaces, hyphens or apostrophes.';
  }
  if ((body.middle_initial != null && typeof body.middle_initial !== 'string') || (body.middleInitial != null && typeof body.middleInitial !== 'string') || (middleInitial && !/^\p{L}$/u.test(middleInitial))) errors.middle_initial = 'Use one middle initial.';
  const today = clinicClock().date;
  const age = Number(today.slice(0,4)) - Number(birthday.slice(0,4)) - (today.slice(5) < birthday.slice(5) ? 1 : 0);
  if (!validDate(birthday) || birthday < '1900-01-01' || birthday > today || age < 13) errors.birthday = 'Enter a real birthday from 1900 onwards; you must be at least 13.';
  const passwordError = validatePasswordComplexity(typeof body.password === 'string' ? body.password : '');
  if (passwordError) errors.password = passwordError;
  if (typeof body.confirm_password !== 'string' || body.confirm_password !== body.password) errors.confirm_password = 'Passwords do not match.';
  if (!/^[\p{L}0-9 .,#'’/\-]{3,255}$/u.test(houseStreet)) errors.house_street = 'Enter a valid house number and street.';
  if (!country) errors.country = 'Select a country.';
  for (const [key,value] of [['state',state],['city',city]]) if (!/^[\p{L}\p{M}0-9 .,'’()/&-]{2,100}$/u.test(value)) errors[key] = 'Enter a valid place (2–100 characters).';
  if (zipCode.length > 20 || !zipCode) errors.zip_code = 'Enter a valid ZIP/postal code.';
  const emailCheck = await checkEmail(email);
  if (!emailCheck.ok) errors.email = emailCheck.error;
  const mobile = checkMobile(country?.code, text(body.mobile ?? body.mobileNumber ?? body.phone));
  if (!mobile.ok) errors.mobile = mobile.error;
  if (country && !errors.state && !errors.city && !errors.zip_code) Object.assign(errors, (await checkAddress({country:country.code,state,city,zip:zipCode})).errors);
  return { errors, firstName, lastName, middleInitial:middleInitial || null, birthday, houseStreet, country:country?.name, state, city, zipCode, email, mobile:mobile.e164 };
}
