/* Front-end "server" for sign-in. No database yet: everything lives in memory (the same `db` the screens use)
   and resets when the page is refreshed. It answers the same routes as authApi.js, so when the real Node server
   exists you replace THIS file with real fetch() calls and nothing else changes.
   The server-side checks run here too (validate.js), exactly as the real server will run them.
   Passwords are plain text only because this is a mock. Hash them (bcrypt) on the real server. */
import { validateRegistration, validateContact, validatePasswordChange, vPassword, vAllergy, vNote, vWeight, normEmail, normPhone, clean } from "./validate.js";
import { uid, addLog, plus } from "./lib.jsx";

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
  if (role && u.role !== role) throw fail("You don’t have access to that.");
  return u;
};
const safe = u => { const { password, ...rest } = u; return rest; };

const routes = {
  "POST /api/auth/login": async ({ identifier, password }) => {
    const u = findUser(store.get(), identifier);
    if (!u || u.password !== password) throw fail("Incorrect username/email or password.");
    session = u.id;
    return { user: safe(u) };
  },
  "POST /api/auth/logout": async () => { session = null; return { ok: true }; },
  "POST /api/auth/register": async d => {
    const db = store.get(), errs = validateRegistration({ ...d, confirm: d.password });
    if (Object.keys(errs).length) throw fail("Please fix the highlighted fields.", errs);
    const email = normEmail(d.email), username = d.username.trim();
    const taken = {};
    if (db.users.some(u => u.username === username)) taken.username = "That username is taken. Try another";
    if (db.owners.some(o => o.email.toLowerCase() === email)) taken.email = "An account with this email already exists. Try logging in";
    if (Object.keys(taken).length) throw fail("Please fix the highlighted fields.", taken);
    const owner = { id: "o" + uid(), name: clean(d.name), email, phone: d.phone, address: clean(d.address) };
    const user = { id: "u" + uid(), name: owner.name, username, password: d.password, role: "owner", ownerId: owner.id };
    store.set(p => ({ ...p, owners: [...p.owners, owner], users: [...p.users, user], log: addLog(p, { name: "System" }, `New pet owner registered: ${owner.name}`) }));
    session = user.id;
    return { user: safe(user) };
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