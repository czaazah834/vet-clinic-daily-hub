/* Validation rules shared by the browser (live, as you type) and the Node server (the final check).
   Every function returns an object of { fieldName: "message" }. An empty object means valid.
   Plain JS with no imports, so it runs in both places. */

export const NAME_RE = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'\-]*$/;
export const PHONE_RE = /^(09|\+639)\d{9}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const USER_RE = /^[a-z0-9_]{3,20}$/;
export const CODE_RE = /^\d{6}$/;
export const hasLetter = s => /[A-Za-zÀ-ÿ]/.test(s);

/* Password rules. Each entry is [test, label]; the register and change-password screens show the same list. */
export const PW_RULES = [
  [p => p.length >= 8, "At least 8 characters"],
  [p => /[A-Za-z]/.test(p), "A letter"],
  [p => /\d/.test(p), "A number"],
  [p => /[^A-Za-z0-9\s]/.test(p), "A symbol (! @ # $ % & * ? …)"],
  [p => /^\S*$/.test(p), "No spaces"],
];
const COMMON = ["password", "12345678", "qwerty", "letmein", "pawcare", "iloveyou", "admin123", "welcome1"];
export const pwStrength = p => PW_RULES.every(([t]) => t(p)) ? 1 + (/[a-z]/.test(p) && /[A-Z]/.test(p)) + (p.length >= 12) + ((p.match(/[^A-Za-z0-9]/g) || []).length >= 2) : 0;

/* ---- single-field checks (return "" when fine) ---- */
export const clean = s => String(s ?? "").trim().replace(/\s{2,}/g, " ");
export const normPhone = s => String(s ?? "").replace(/\s|-/g, "").replace(/^\+63/, "0");
export const normEmail = s => String(s ?? "").trim().toLowerCase();

export function vName(v) {
  const s = clean(v);
  if (!s) return "Enter your full name";
  if (s.length < 2) return "Use at least 2 characters";
  if (s.length > 60) return "Keep it under 60 characters";
  if (!NAME_RE.test(s)) return "Letters, spaces, . ' - only, and start with a letter";
  return "";
}
export function vEmail(v) {
  const s = String(v ?? "").trim();
  if (!s) return "Enter your email address";
  if (s.length > 100) return "Keep it under 100 characters";
  if (!EMAIL_RE.test(s)) return "Enter a valid email address, like name@example.com";
  return "";
}
export function vPhone(v) {
  const s = String(v ?? "").trim();
  if (!s) return "Enter your mobile number";
  if (!PHONE_RE.test(s)) return "Use 09XXXXXXXXX or +639XXXXXXXXX";
  return "";
}
export function vAddress(v) {
  const s = clean(v);
  if (!s) return "Enter your address";
  if (s.length < 5) return "Use at least 5 characters";
  if (s.length > 120) return "Keep it under 120 characters";
  if (!hasLetter(s)) return "Include the street, barangay or city, not only numbers";
  return "";
}
export function vUsername(v) {
  const s = String(v ?? "").trim();
  if (!s) return "Choose a username";
  if (!USER_RE.test(s)) return "3–20 characters: lowercase letters, numbers or _";
  return "";
}
export function vPassword(v, { username = "", name = "" } = {}) {
  const p = String(v ?? "");
  if (!p) return "Enter a password";
  if (p.length > 72) return "Keep it under 72 characters";
  const miss = PW_RULES.filter(([t]) => !t(p));
  if (miss.length) return `Needs: ${miss.map(m => m[1].toLowerCase()).join(", ")}`;
  const low = p.toLowerCase();
  if (COMMON.some(c => low.includes(c))) return "That password is too common. Pick something less guessable";
  if (username && username.length >= 3 && low.includes(username.toLowerCase())) return "Your password can’t contain your username";
  return "";
}

/* ---- whole-form checks ---- */
const put = (e, k, m) => { if (m) e[k] = m; return e; };

export function validateRegistration(d) {
  const e = {};
  put(e, "name", vName(d.name)); put(e, "email", vEmail(d.email)); put(e, "phone", vPhone(d.phone)); put(e, "address", vAddress(d.address));
  put(e, "username", vUsername(d.username)); put(e, "password", vPassword(d.password, { username: d.username }));
  if (!d.confirm) e.confirm = "Retype your password"; else if (d.confirm !== d.password) e.confirm = "Passwords don’t match";
  if (!d.agree) e.agree = "Please accept the privacy notice to continue";
  return e;
}
export function validateLogin(d) {
  const e = {};
  if (!String(d.identifier ?? "").trim()) e.identifier = "Enter your username or email";
  if (!d.password) e.password = "Enter your password";
  return e;
}
export function validateCode(d) {
  return put({}, "code", !d.code ? "Enter the 6-digit code" : !CODE_RE.test(String(d.code).trim()) ? "The code is 6 digits" : "");
}
export function validateReset(d) {
  const e = validateCode(d);
  if (!String(d.identifier ?? "").trim()) e.identifier = "Enter your username or email";
  put(e, "password", vPassword(d.password, { username: d.identifier }));
  if (!d.confirm) e.confirm = "Retype your new password"; else if (d.confirm !== d.password) e.confirm = "Passwords don’t match";
  return e;
}
export function validateContact(d) {
  return put(put(put({}, "email", vEmail(d.email)), "phone", vPhone(d.phone)), "address", vAddress(d.address));
}
export function validatePasswordChange(d, username = "") {
  const e = {};
  if (!d.cur) e.cur = "Enter your current password";
  put(e, "next", vPassword(d.next, { username }));
  if (!e.next && d.next === d.cur) e.next = "New password must be different from the current one";
  if (!d.conf) e.conf = "Retype the new password"; else if (d.conf !== d.next) e.conf = "Passwords don’t match";
  return e;
}
/* First-visit request from an owner who has no pet on file yet. */
export const SPECIES = ["Dog", "Cat", "Bird", "Rabbit", "Other"];
export function validateFirstVisit(d, { today, last }) {
  const e = {}, n = clean(d.petName);
  if (!n) e.petName = "Enter your pet’s name"; else if (n.length > 40) e.petName = "Keep it under 40 characters"; else if (!NAME_RE.test(n)) e.petName = "Letters only, and start with a letter";
  if (!SPECIES.includes(d.species)) e.species = "Choose the kind of animal";
  if (!d.date) e.date = "Pick a preferred date"; else if (isNaN(new Date(d.date + "T00:00:00"))) e.date = "Enter a valid date";
  else if (d.date < today) e.date = "Date can’t be in the past"; else if (d.date > last) e.date = `Pick a date up to ${last}`;
  if (!["Morning", "Afternoon"].includes(d.part)) e.part = "Choose morning or afternoon";
  const nt = clean(d.note); if (nt.length > 200) e.note = "Keep it under 200 characters"; else if (nt && !hasLetter(nt)) e.note = "Write a few words, not only numbers or symbols";
  return e;
}

/* Pet profile fields an owner may change. */
export const MAX_ALLERGIES = 10, MAX_NOTE = 300;
export function vAllergy(t, list) {
  const s = clean(t);
  if (!s) return "Enter an allergy";
  if (s.length < 2) return "At least 2 characters";
  if (s.length > 40) return "Keep it under 40 characters";
  if (!hasLetter(s)) return "Use a name, for example Chicken or Pollen";
  if (list.some(x => x.toLowerCase() === s.toLowerCase())) return `${s} is already on the list`;
  if (list.length >= MAX_ALLERGIES) return `You can list up to ${MAX_ALLERGIES} allergies`;
  return "";
}
export function vNote(t) {
  const s = String(t ?? "").trim();
  if (s.length > MAX_NOTE) return `Keep it under ${MAX_NOTE} characters`;
  if (s && !hasLetter(s)) return "Write a few words, not only numbers or symbols";
  return "";
}
export function vWeight(d, { today, birth, existing }) {
  const e = {};
  if (!d.date) e.date = "Pick the date it was weighed"; else if (d.date > today) e.date = "Date can’t be in the future";
  else if (birth && d.date < birth) e.date = "Your pet wasn’t born yet on that date"; else if (existing.some(w => w.date === d.date)) e.date = "There is already a weight for this date";
  const kg = String(d.kg ?? "");
  if (!kg) e.kg = "Enter the weight in kg"; else if (!/^(\d{1,3}(\.\d{1,2})?|\.\d{1,2})$/.test(kg)) e.kg = "Use numbers only, like 14.5"; else if (+kg < 0.1 || +kg > 120) e.kg = "Weight must be between 0.1 and 120 kg";
  return e;
}

/* ---- staff-side record checks (the server runs these on every change) ---- */
export function validateOwnerRecord(d) {
  return put(put(put(put({}, "name", vName(d.name)), "email", vEmail(d.email)), "phone", vPhone(d.phone)), "address", vAddress(d.address));
}