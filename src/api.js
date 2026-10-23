/* Front-end "server" for sign-in. No database yet: everything lives in memory (the same `db` the screens use)
   and resets when the page is refreshed. It answers the same routes as authApi.js, so when the real Node server
   exists you replace THIS file with real fetch() calls and nothing else changes.
   The server-side checks run here too (validate.js), exactly as the real server will run them.
   Passwords are plain text only because this is a mock. Hash them (bcrypt) on the real server. */
import { validateRegistration, validateContact, validatePasswordChange, vPassword, vAllergy, vNote, vWeight, normEmail, normPhone, clean } from "./validate.js";
import { uid, addLog, plus } from "./lib.jsx";
import { outbox } from "./devOutbox.js";

let store = { get: () => ({ users: [], owners: [] }), set: () => {} };
export const bindStore = (get, set) => { store = { get, set }; };   // App.jsx connects its db here

const wait = ms => new Promise(r => setTimeout(r, ms));
const fail = (message, fields) => Object.assign(new Error(message), fields ? { fields } : {});
let session = null;                            // id of the signed-in user (the real server uses a cookie)
const codes = new Map();                       // userId -> { code, exp, tries }
const CODE_MINUTES = 10, MAX_TRIES = 5;
const ownerOf = (db, u) => (db.owners || []).find(o => o.id === u.ownerId);
const findUser = (db, ident) => {              // by username or by the owner's email
  const k = String(ident || "").trim().toLowerCase();
  return k && db.users.find(u => u.username === k || (ownerOf(db, u) || {}).email?.toLowerCase() === k);
};
const authed = (role) => {                     // every private route starts here
  const u = store.get().users.find(x => x.id === session);
  if (!u) throw Object.assign(fail("Your session ended. Please log in again."), { expired: true });
  if (u.emailVerified === false || u.mobileVerified === false) throw fail("Verify your email and mobile number first.");
  if (role && u.role !== role) throw fail("You don’t have access to that.");
  return u;
};
const safe = u => { const { password, ...rest } = u; return rest; };

/* ---------------------------------------------------------------------------------------------
   Sign-in security. Follows the reference flow in login_registration/server.js:
   register -> email link (24 h) -> mobile code (OTP) -> log in, and a 3-strike account lock
   whose unlock link only works after a 2-minute cooling period.
   State lives in memory here; the real server keeps it in users / verification_tokens tables.
   Accounts without an emailVerified / mobileVerified flag (staff, seeded and admin-made accounts) count as verified.
   --------------------------------------------------------------------------------------------- */
const LOCK_AFTER = 3, COOL_MS = 2 * 60000, LINK_MS = 24 * 36e5;                       // 3 wrong passwords lock; unlock link works 2 min after first click; links last 24 h
const OTP_MS = 5 * 60000, OTP_MAX = 3, OTP_LOCK_MS = 15 * 60000, OTP_GAP_MS = 60000;   // 6-digit code lasts 5 min, 3 wrong tries = 15 min lock, resend after 60 s
const PEND_MS = 30 * 60000;                                                           // after the email link: 30 min to enter the mobile code
const G = "Incorrect username/email or password.";
const sec = new Map();      // userId -> { fails, locked, until }  (until = end of the cooling timer; null until the unlock link is first clicked)
const tokens = new Map();   // raw token -> { userId, type: "verify" | "unlock", exp, at }
const ghosts = new Map();   // identifier that matches no account -> { n, exp }  (fake counter so nobody can tell which accounts exist)
const otps = new Map();     // userId -> { code, exp, at, tries }
const hits = { reg: [], login: [], resend: [] };
let pending = null;         // { userId, exp }: set when the email link is clicked; accepted ONLY by the OTP routes (like the "pend" cookie)

const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, "0")).join("");
const secOf = id => { if (!sec.has(id)) sec.set(id, { fails: 0, locked: false, until: null }); return sec.get(id); };
const limited = (key, max, ms) => { const now = Date.now(), a = (hits[key] = hits[key].filter(t => now - t < ms)); if (a.length >= max) return true; a.push(now); return false; };   // per-IP limits (one "IP" in the mock)
const emailOf = (db, u) => (ownerOf(db, u) || {}).email || "";
const firstName = u => String(u.name || "there").split(" ")[0];
const maskPhone = p => String(p || "").replace(/.(?=.{4})/g, "•");
const mail = (to, subject, body, link) => outbox.push({ kind: "email", to, subject, body, link });
const sms = (to, body) => outbox.push({ kind: "sms", to, subject: "SMS", body });
const setUser = (id, patch) => store.set(p => ({ ...p, users: p.users.map(x => x.id === id ? { ...x, ...patch } : x) }));

function ghostFail(k) {
  const now = Date.now(), g = ghosts.get(k), n = g && g.exp > now ? g.n + 1 : 1;
  ghosts.set(k, { n, exp: now + LINK_MS });
  if (ghosts.size > 5000) ghosts.delete(ghosts.keys().next().value);
  return n;
}
const attemptMsg = n => n >= LOCK_AFTER
  ? "Your account is locked. We sent an unlock link to your email (it works after a 2-minute wait). Check your inbox and spam folder. Clinic staff: ask the administrator to unlock your account."
  : `${G} ${LOCK_AFTER - n} attempt${LOCK_AFTER - n === 1 ? "" : "s"} left before your account is locked.`;

function sendVerify(db, u) {                    // new link replaces any older one
  for (const [k, t] of tokens) if (t.userId === u.id && t.type === "verify") tokens.delete(k);
  const raw = rnd(), to = emailOf(db, u);
  tokens.set(raw, { userId: u.id, type: "verify", exp: Date.now() + LINK_MS, at: Date.now() });
  mail(to, "Action required: verify your email address for PawCare",
    `Dear ${firstName(u)},\n\nThank you for registering with PawCare. To complete your registration, please verify your email address with the secure link below.\n\nIf you did not create this account, please ignore this message. The link expires in 24 hours.\n\nThe PawCare Security Team`,
    { type: "verify", token: raw, label: "Verify my email address" });
}
function sendUnlock(db, u) {                    // new link = timer not started until it is clicked
  for (const [k, t] of tokens) if (t.userId === u.id && t.type === "unlock") tokens.delete(k);
  secOf(u.id).until = null;
  const to = emailOf(db, u); if (!to) return;   // staff accounts have no email on file
  const raw = rnd();
  tokens.set(raw, { userId: u.id, type: "unlock", exp: Date.now() + LINK_MS, at: Date.now() });
  mail(to, "Security alert: your PawCare account was locked",
    `Dear ${firstName(u)},\n\nThere were ${LOCK_AFTER} failed sign-in attempts on your account, so we locked it.\nFor your protection the unlock link works only after a 2-minute cooling period.\n\nIf this wasn't you, change your password after unlocking.\n\nThe PawCare Security Team`,
    { type: "unlock", token: raw, label: "Unlock my account" });
}
/* The OTP routes accept the short-lived pending pass (email link clicked) or a normal signed-in session. */
function otpUser() {
  const db = store.get();
  if (pending && pending.exp > Date.now()) { const u = db.users.find(x => x.id === pending.userId); if (u) return u; }
  const u = db.users.find(x => x.id === session);
  if (!u) throw Object.assign(fail("Your session ended. Please log in again."), { expired: true });
  return u;
}

const routes = {
  /* Login: generic errors, 3-strike lock, unlock email with a 2-minute cooling period (same rules as the reference server). */
  "POST /api/auth/login": async ({ identifier, password }) => {
    const id = String(identifier || "").trim().toLowerCase(), pw = String(password || "");
    if (!id || !pw || pw.length > 128) throw fail(G);
    if (limited("login", 30, 15 * 60000)) throw fail(G);                  // 30 tries per 15 minutes, same generic answer
    const db = store.get(), u = findUser(db, id);
    if (!u) throw fail(attemptMsg(ghostFail(id)));                         // unknown account behaves EXACTLY like a real one (same counter, same messages)
    const s = secOf(u.id);
    if (s.locked) {                                                        // a locked account never checks the password
      const fresh = [...tokens.values()].some(t => t.userId === u.id && t.type === "unlock" && t.exp > Date.now() && Date.now() - t.at < COOL_MS);
      if (!fresh) sendUnlock(db, u);                                       // re-send at most once per 2 minutes
      throw fail(attemptMsg(LOCK_AFTER));
    }
    if (u.password !== password) {
      s.fails += 1;
      if (s.fails >= LOCK_AFTER) { s.locked = true; s.until = null; sendUnlock(db, u); store.set(p => ({ ...p, log: addLog(p, { name: "System" }, `Account locked after ${LOCK_AFTER} failed log-ins: ${u.username}`) })); }
      throw fail(attemptMsg(s.fails));
    }
    /* Only someone who knows the password learns the account is unverified (no email enumeration). */
    if (u.emailVerified === false) throw Object.assign(fail("Please verify your email address first (check your inbox)."), { unverified: true });
    s.fails = 0;
    session = u.id;
    return { user: safe(u), needsOtp: u.mobileVerified === false };      // mobile not verified yet: the screen asks for the SMS code before opening the portal
  },
  "POST /api/auth/logout": async () => { session = null; return { ok: true }; },
  /* Register: 5 attempts per IP per hour -> validation -> unverified account + 24 h email link. Nobody is signed in until email AND mobile are verified. */
  "POST /api/auth/register": async d => {
    if (limited("reg", 5, 36e5)) throw Object.assign(fail("Registration limit reached: maximum 5 attempts per IP address per hour. Try again in an hour."), { limit: true });
    const db = store.get(), errs = validateRegistration({ ...d, confirm: d.password });
    if (Object.keys(errs).length) throw fail("Please fix the highlighted fields.", errs);
    const email = normEmail(d.email), username = d.username.trim();
    const taken = {};
    if (db.users.some(u => u.username === username)) taken.username = "That username is taken. Try another";
    if (db.owners.some(o => o.email.toLowerCase() === email)) taken.email = "An account with this email already exists. Try logging in";
    if (Object.keys(taken).length) throw fail("Please fix the highlighted fields.", taken);
    const owner = { id: "o" + uid(), name: clean(d.name), email, phone: normPhone(d.phone), address: clean(d.address) };
    const user = { id: "u" + uid(), name: owner.name, username, password: d.password, role: "owner", ownerId: owner.id, emailVerified: false, mobileVerified: false };
    store.set(p => ({ ...p, owners: [...p.owners, owner], users: [...p.users, user], log: addLog(p, { name: "System" }, `New pet owner registered (awaiting verification): ${owner.name}`) }));
    sendVerify({ owners: [owner] }, user);
    return { ok: true, email };
  },
  /* Lost or expired verification link -> a new 24 h link. Same answer whether or not the account exists. */
  "POST /api/auth/resend-verification": async ({ identifier }) => {
    if (limited("resend", 5, 36e5)) throw fail("Too many requests. Try again in an hour.");
    const db = store.get(), u = findUser(db, identifier);
    if (u && u.emailVerified === false) sendVerify(db, u);
    return { ok: true };
  },
  /* The email link. Marks the email verified and gives a 30-minute pass that opens ONLY the mobile-code step. */
  "GET /api/auth/verify-email": async ({ token }) => {
    const t = tokens.get(String(token || ""));
    if (!t || t.type !== "verify" || t.exp <= Date.now()) return { status: "invalid" };
    setUser(t.userId, { emailVerified: true });
    tokens.delete(String(token));
    pending = { userId: t.userId, exp: Date.now() + PEND_MS };
    return { status: "ok" };
  },
  /* The unlock link. First click starts the 2-minute cooling timer; the account opens only after it ends. */
  "GET /api/auth/unlock": async ({ token }) => {
    const k = String(token || ""), t = tokens.get(k);
    if (!t || t.type !== "unlock" || t.exp <= Date.now()) return { status: "invalid" };
    const s = secOf(t.userId);
    if (!s.until) { s.until = Date.now() + COOL_MS; return { status: "wait", seconds: COOL_MS / 1000 }; }
    const left = s.until - Date.now();
    if (left > 0) return { status: "wait", seconds: Math.ceil(left / 1000) };
    s.fails = 0; s.locked = false; s.until = null; tokens.delete(k);
    return { status: "ok" };
  },
  /* Mobile code: 6 digits, 5 minutes, 3 wrong tries = locked 15 minutes from when the code was sent, resend only after 60 s. */
  "GET /api/auth/otp/info": async () => {
    const u = otpUser(), o = ownerOf(store.get(), u);
    return { mobileVerified: u.mobileVerified !== false, phone: maskPhone(o && o.phone) };
  },
  "POST /api/auth/otp/resend": async () => {
    const db = store.get(), u = otpUser();
    if (u.emailVerified === false) throw fail("Verify your email first.");
    if (u.mobileVerified !== false) return { ok: true, done: true };
    const last = otps.get(u.id), age = last ? Date.now() - last.at : Infinity;
    if (last && last.tries >= OTP_MAX && age < OTP_LOCK_MS) throw fail(`Too many wrong codes. Try again in ${Math.ceil((OTP_LOCK_MS - age) / 60000)} minute(s).`);
    if (last && age < OTP_GAP_MS) throw fail("Please wait 60 seconds before requesting another code.");
    const code = String(100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900000), o = ownerOf(db, u);
    otps.set(u.id, { code, exp: Date.now() + OTP_MS, at: Date.now(), tries: 0 });
    sms(o ? o.phone : "", `PawCare: your code is ${code}. Valid for 5 minutes. Do not share it.`);
    return { ok: true };
  },
  "POST /api/auth/otp/verify": async ({ code }) => {
    const u = otpUser(), c = String(code ?? ""), t = otps.get(u.id);
    if (!t || t.exp <= Date.now()) throw fail("Code expired. Request a new one.");
    if (t.tries >= OTP_MAX) throw fail("Too many attempts. Locked for 15 minutes from when the code was sent.");
    t.tries += 1;                                                           // count first, then compare
    if (!/^\d{6}$/.test(c) || c !== t.code) throw fail(t.tries >= OTP_MAX ? "Too many attempts. Locked for 15 minutes from when the code was sent." : `Incorrect code. ${OTP_MAX - t.tries} attempt(s) left.`);
    setUser(u.id, { mobileVerified: true });
    otps.delete(u.id); pending = null;
    return { ok: true, user: session === u.id ? safe({ ...u, mobileVerified: true }) : null };   // came from the email link (not logged in): no user, the screen sends them to Log in
  },
  "GET /api/auth/available": async (_, q) => {
    const db = store.get(), v = String(q.value || "").trim().toLowerCase();
    return { available: q.field === "email" ? !db.owners.some(o => o.email.toLowerCase() === v) : !db.users.some(u => u.username === v) };
  },
  "POST /api/auth/forgot": async ({ identifier }) => {
    const u = findUser(store.get(), identifier);
    if (!u) return { ok: true };               // same answer either way, so nobody can probe which accounts exist
    const code = String(Math.floor(100000 + Math.random() * 900000));
    codes.set(u.id, { code, exp: Date.now() + CODE_MINUTES * 60000, tries: 0 });
    return { ok: true, devCode: code };        // no email service yet: the code is returned so you can test. The real server emails it instead.
  },
  "POST /api/auth/reset": async ({ identifier, code, password }) => {
    const db = store.get(), u = findUser(db, identifier), c = u && codes.get(u.id);
    const bad = () => fail("That code is wrong or has expired. Ask for a new one.", { code: "That code is wrong or has expired" });
    if (!c || Date.now() > c.exp) throw bad();
    if (String(code).trim() !== c.code) { if (++c.tries >= MAX_TRIES) codes.delete(u.id); throw bad(); }
    const pw = vPassword(password, { username: u.username });
    if (pw) throw fail(pw, { password: pw });
    store.set(p => ({ ...p, users: p.users.map(x => x.id === u.id ? { ...x, password } : x), log: addLog(p, { name: "System" }, `${u.name} reset their password`) }));
    codes.delete(u.id);
    return { ok: true };
  },
};

/* ---- signed-in owner: own contact details and own password only ---- */
routes["POST /api/owner/contact"] = async d => {
  const u = authed("owner"), db = store.get(), o = ownerOf(db, u);
  if (!o) throw fail("Your owner record couldn’t be found. Please contact the clinic.");
  const errs = validateContact(d), email = normEmail(d.email);
  if (!errs.email && db.owners.some(x => x.id !== o.id && x.email.toLowerCase() === email)) errs.email = "Another account already uses this email";
  if (Object.keys(errs).length) throw fail("Please fix the highlighted fields.", errs);
  const next = { ...o, email, phone: normPhone(d.phone), address: clean(d.address) };
  store.set(p => ({ ...p, owners: p.owners.map(x => x.id === o.id ? next : x), log: addLog(p, u, "Owner updated own contact details") }));
  return { owner: next };
};
routes["POST /api/owner/password"] = async d => {
  const u = authed("owner");
  if (u.password !== d.cur) throw fail("Current password is incorrect.", { cur: "Current password is incorrect" });
  const errs = validatePasswordChange(d, u.username);
  if (Object.keys(errs).length) throw fail("Please fix the highlighted fields.", errs);
  store.set(p => ({ ...p, users: p.users.map(x => x.id === u.id ? { ...x, password: d.next } : x), log: addLog(p, u, "Owner changed own password") }));
  return { ok: true };
};

/* ---- the signed-in owner's own pets: picture, allergies, weights, care notes ---- */
const ownPet = (u, id) => {
  const p = store.get().pets.find(x => x.id === id && x.ownerId === u.ownerId);
  if (!p) throw fail("That pet isn’t on your account.");
  return p;
};
const savePet = (p, u, changes, msg) => {
  const next = { ...p, ...changes };
  store.set(d => ({ ...d, pets: d.pets.map(x => x.id === p.id ? next : x), log: addLog(d, u, `${msg} for ${p.name}`) }));
  return { pet: next };
};
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
routes["POST /api/owner/pets/:id/photo"] = async ({ photo }, _, { id }) => {
  const u = authed("owner"), p = ownPet(u, id);
  if (photo !== "" && !(typeof photo === "string" && photo.length <= 300000 && PHOTO_RE.test(photo))) throw fail("That picture can’t be used. Use a JPG, PNG or WEBP.");
  return savePet(p, u, { photo }, photo ? "Owner updated picture" : "Owner removed picture");
};
routes["POST /api/owner/pets/:id/allergies"] = async ({ add, remove }, _, { id }) => {
  const u = authed("owner"), p = ownPet(u, id), list = p.allergies || [];
  if (remove !== undefined) {
    if (!list.includes(remove)) throw fail("That allergy isn’t on the list.");
    return savePet(p, u, { allergies: list.filter(a => a !== remove) }, `Owner removed allergy "${remove}"`);
  }
  const t = clean(add), m = vAllergy(t, list);
  if (m) throw fail(m);
  return savePet(p, u, { allergies: [...list, t] }, `Owner added allergy "${t}"`);
};
const byDate = a => [...a].sort((x, y) => x.date.localeCompare(y.date));
routes["POST /api/owner/pets/:id/weights"] = async ({ date, kg, remove }, _, { id }) => {
  const u = authed("owner"), p = ownPet(u, id), list = p.weights || [];
  let next;
  if (remove) {                                  // owners can only remove their own entries, never the clinic's
    const w = list.find(x => x.date === remove);
    if (!w) throw fail("That weight entry no longer exists.");
    if (w.by !== "owner") throw fail("Weights recorded by the clinic can’t be removed.");
    next = list.filter(x => x !== w);
  } else {
    const e = vWeight({ date, kg }, { today: plus(0), birth: p.birth, existing: list }), m = e.date || e.kg;
    if (m) throw fail(m, e);
    next = [...list, { date, kg: +kg, by: "owner" }];
  }
  next = byDate(next);
  return savePet(p, u, { weights: next, weight: next.length ? next[next.length - 1].kg : p.weight }, remove ? "Owner removed a weight entry" : `Owner added weight ${kg} kg`);
};
routes["POST /api/owner/pets/:id/notes"] = async ({ notes }, _, { id }) => {
  const u = authed("owner"), p = ownPet(u, id), m = vNote(notes);
  if (m) throw fail(m);
  return savePet(p, u, { notes: String(notes || "").trim() }, "Owner updated care notes");
};

/* Finds the route for a path like /api/owner/pets/p1/allergies (":id" parts are filled in as params). */
function find(method, route) {
  for (const k of Object.keys(routes)) {
    const [m, pat] = k.split(" "); if (m !== method) continue;
    const names = [], g = new RegExp("^" + pat.replace(/:([a-z]+)/g, (_, n) => { names.push(n); return "([^/]+)"; }) + "$").exec(route);
    if (g) return [routes[k], Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(g[i + 1])]))];
  }
  return [];
}
async function call(method, path, body) {
  await wait(250);                              // feels like a real round trip
  const [route, qs] = path.split("?"), q = Object.fromEntries(new URLSearchParams(qs || ""));
  const [fn, params] = find(method, route);
  if (!fn) throw fail("Not found");
  return fn(body || q, q, params || {});
}
export const api = { get: p => call("GET", p), post: (p, b) => call("POST", p, b) };