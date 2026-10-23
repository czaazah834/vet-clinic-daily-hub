/* Front-end server for sign-in, authentication, geo and owner APIs.
   Follows the reference architecture and flow from login_registration:
   - Register -> email link (24 h) -> mobile code (OTP, 5 min) -> log in
   - 3-strike account lock with unlock link and 2-minute cooling period
   - Rate limits (5 reg/hour/IP, 30 login/15min/IP)
   - Geo & validation APIs matching reference server (geo.js, zipmatch.js, domains.js)
   - Title Case enforced on server as well as browser
*/
import {
  validate,
  tc,
  TCF,
  validateContact,
  validatePasswordChange,
  vPassword,
  vAllergy,
  vNote,
  vWeight,
  normEmail,
  normPhone,
  clean,
} from "./validate.js";
import {
  countryInfo,
  checkMobile,
  checkEmail,
  checkAddress,
  searchCountries,
  searchStates,
  searchCities,
  getZips,
} from "./geo.js";
import { uid, addLog, plus } from "./utils.js";
import { outbox } from "./devOutbox.js";

let store = { get: () => ({ users: [], owners: [] }), set: () => {} };
export const bindStore = (get, set) => {
  store = { get, set };
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (message, fields) =>
  Object.assign(new Error(message), fields ? { fields, errors: fields } : {});
let session = null;
const codes = new Map();
const CODE_MINUTES = 10,
  MAX_TRIES = 5;

const ownerOf = (db, u) => (db.owners || []).find((o) => o.id === u.ownerId);
export const findUser = (db, ident) => {
  const k = String(ident || "").trim().toLowerCase();
  return (
    k &&
    db.users.find(
      (u) =>
        u.email?.toLowerCase() === k ||
        u.username?.toLowerCase() === k ||
        (ownerOf(db, u) || {}).email?.toLowerCase() === k
    )
  );
};

const authed = (role) => {
  const u = store.get().users.find((x) => x.id === session);
  if (!u)
    throw Object.assign(fail("Your session ended. Please log in again."), {
      expired: true,
    });
  if (u.emailVerified === false || u.mobileVerified === false)
    throw fail("Verify your email and mobile number first.");
  if (role && u.role !== role) throw fail("You don’t have access to that.");
  return u;
};
const safe = (u) => {
  const { password, ...rest } = u;
  return rest;
};

const LOCK_AFTER = 3,
  COOL_MS = 2 * 60000,
  LINK_MS = 24 * 36e5;
const OTP_MS = 5 * 60000,
  OTP_MAX = 3,
  OTP_LOCK_MS = 15 * 60000,
  OTP_GAP_MS = 60000;
const PEND_MS = 30 * 60000;
const G = "Invalid email or password.";
const sec = new Map();
const tokens = new Map();
const ghosts = new Map();
const otps = new Map();
const hits = { reg: [], login: [], resend: [] };
let pending = null;

const rnd = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
const secOf = (id) => {
  if (!sec.has(id)) sec.set(id, { fails: 0, locked: false, until: null });
  return sec.get(id);
};
const limited = (key, max, ms) => {
  const now = Date.now(),
    a = (hits[key] = hits[key].filter((t) => now - t < ms));
  if (a.length >= max) return true;
  a.push(now);
  return false;
};
const emailOf = (db, u) => u.email || (ownerOf(db, u) || {}).email || "";
const firstName = (u) => String(u.first_name || u.name || "there").split(" ")[0];
const maskPhone = (p) => {
  const s = String(p || "").replace(/\s+/g, "");
  return s.length < 7 ? "•••••" : `${s.slice(0, 3)} ••• ••• ••${s.slice(-2)}`;
};
const mail = (to, subject, body, link) =>
  outbox.push({ kind: "email", to, subject, body, link });
const sms = (to, body) =>
  outbox.push({ kind: "sms", to, subject: "SMS", body });
const setUser = (id, patch) =>
  store.set((p) => ({
    ...p,
    users: p.users.map((x) => (x.id === id ? { ...x, ...patch } : x)),
  }));

function ghostFail(k) {
  const now = Date.now(),
    g = ghosts.get(k),
    n = g && g.exp > now ? g.n + 1 : 1;
  ghosts.set(k, { n, exp: now + LINK_MS });
  if (ghosts.size > 5000) ghosts.delete(ghosts.keys().next().value);
  return n;
}
const attemptMsg = (n) =>
  n >= LOCK_AFTER
    ? "Your account is locked. We sent an unlock link to your email (it works after a 2-minute wait). Check your inbox and spam folder."
    : `${G} ${LOCK_AFTER - n} attempt${
        LOCK_AFTER - n === 1 ? "" : "s"
      } left before your account is locked.`;

function sendVerify(db, u) {
  for (const [k, t] of tokens)
    if (t.userId === u.id && t.type === "verify") tokens.delete(k);
  const raw = rnd(),
    to = emailOf(db, u);
  tokens.set(raw, {
    userId: u.id,
    type: "verify",
    exp: Date.now() + LINK_MS,
    at: Date.now(),
  });
  mail(
    to,
    "Action Required: Verify your email address for PawCare",
    `Dear ${firstName(
      u
    )},\n\nThank you for registering with PawCare. We are thrilled to welcome you to our community.\n\nTo ensure the security of your account and complete your registration, please verify your email address by clicking the secure link below:\n\nIf you did not initiate this request, please disregard this message. This link will expire in 24 hours for your protection.\n\nWarm regards,\nThe PawCare Security Team`,
    { type: "verify", token: raw, label: "Verify My Email Address" }
  );
}

function sendUnlock(db, u) {
  for (const [k, t] of tokens)
    if (t.userId === u.id && t.type === "unlock") tokens.delete(k);
  secOf(u.id).until = null;
  const to = emailOf(db, u);
  if (!to) return;
  const raw = rnd();
  tokens.set(raw, {
    userId: u.id,
    type: "unlock",
    exp: Date.now() + LINK_MS,
    at: Date.now(),
  });
  mail(
    to,
    "Security alert: your PawCare account was locked",
    `Dear ${firstName(
      u
    )},\n\nThere were ${LOCK_AFTER} failed sign-in attempts on your account, so we locked it.\nFor your protection the unlock link works only after a 2-minute cooling period.\n\nIf this wasn't you, change your password after unlocking.\n\nThe PawCare Security Team`,
    { type: "unlock", token: raw, label: "Unlock My Account" }
  );
}

function otpUser() {
  const db = store.get();
  if (pending && pending.exp > Date.now()) {
    const u = db.users.find((x) => x.id === pending.userId);
    if (u) return u;
  }
  const u = db.users.find((x) => x.id === session);
  if (!u)
    throw Object.assign(fail("Your session ended. Please log in again."), {
      expired: true,
    });
  return u;
}

const handleRegister = async (b) => {
  if (limited("reg", 5, 36e5)) {
    throw Object.assign(
      fail(
        "Registration limit reached. To prevent bot spam, each IP address can make at most 5 registration attempts per hour. Please try again later, or log in if you already have an account."
      ),
      { limit: true }
    );
  }
  const db = store.get();
  const { e, em, mob, c } = validate(b);
  const s = (k) => {
    const v = String(b[k] ?? "").trim();
    return TCF.includes(k) ? tc(v) : v;
  };

  if (
    !e.email &&
    (db.users.some(
      (u) =>
        u.email?.toLowerCase() === em ||
        (ownerOf(db, u) || {}).email?.toLowerCase() === em
    ) ||
      db.owners.some((o) => o.email?.toLowerCase() === em))
  ) {
    e.email = "This email is already registered.";
  }

  if (!e.email) {
    const ce = await checkEmail(em);
    if (!ce.ok) e.email = ce.error;
  }

  if (!e.state && !e.city && !e.zip_code && c) {
    const a = await checkAddress({
      country: s("country"),
      state: s("state"),
      city: s("city"),
      zip: s("zip_code"),
    });
    Object.assign(e, a.errors);
  }

  if (Object.keys(e).length) {
    throw Object.assign(fail("Please fix the highlighted fields.", e), {
      errors: e,
    });
  }

  const owner = {
    id: "o" + uid(),
    name: `${s("first_name")} ${s("last_name")}`.trim(),
    first_name: s("first_name"),
    last_name: s("last_name"),
    middle_initial: s("middle_initial") || null,
    birthday: s("birthday"),
    email: em,
    phone: c.prefix + mob,
    mobile: c.prefix + mob,
    house_street: s("house_street"),
    country: c.name,
    state: s("state"),
    city: s("city"),
    zip_code: s("zip_code").toUpperCase(),
    address: `${s("house_street")}, ${s("city")}, ${s("state")} ${s(
      "zip_code"
    ).toUpperCase()}, ${c.name}`,
  };

  const user = {
    id: "u" + uid(),
    name: owner.name,
    first_name: owner.first_name,
    last_name: owner.last_name,
    middle_initial: owner.middle_initial,
    birthday: owner.birthday,
    email: em,
    username: em,
    password: b.password,
    role: "owner",
    ownerId: owner.id,
    emailVerified: false,
    mobileVerified: false,
    created_at: new Date().toISOString(),
  };

  store.set((p) => ({
    ...p,
    owners: [...p.owners, owner],
    users: [...p.users, user],
    log: addLog(
      p,
      { name: "System" },
      `New pet owner registered (awaiting verification): ${owner.name}`
    ),
  }));

  sendVerify({ owners: [owner] }, user);
  return { ok: true, email: em };
};

const handleLogin = async (body) => {
  const em = String(body?.email ?? body?.identifier ?? "")
    .trim()
    .toLowerCase();
  const pw = String(body?.password ?? "");
  if (!em || !pw || pw.length > 128) throw fail(G);
  if (limited("login", 30, 15 * 60000)) throw fail(G);

  const db = store.get(),
    u = findUser(db, em);
  if (!u) throw fail(attemptMsg(ghostFail(em)));

  const s = secOf(u.id);
  if (s.locked) {
    const fresh = [...tokens.values()].some(
      (t) =>
        t.userId === u.id &&
        t.type === "unlock" &&
        t.exp > Date.now() &&
        Date.now() - t.at < COOL_MS
    );
    if (!fresh) sendUnlock(db, u);
    throw fail(attemptMsg(LOCK_AFTER));
  }

  if (u.password !== pw) {
    s.fails += 1;
    if (s.fails >= LOCK_AFTER) {
      s.locked = true;
      s.until = null;
      sendUnlock(db, u);
      store.set((p) => ({
        ...p,
        log: addLog(
          p,
          { name: "System" },
          `Account locked after ${LOCK_AFTER} failed log-ins: ${u.email || u.username}`
        ),
      }));
    }
    throw fail(attemptMsg(s.fails));
  }

  if (u.emailVerified === false) {
    throw Object.assign(
      fail("Please verify your email address first (check your inbox)."),
      { unverified: true }
    );
  }

  s.fails = 0;
  session = u.id;
  return {
    ok: true,
    user: safe(u),
    needsOtp: u.mobileVerified === false,
  };
};

const handleResend = async (body) => {
  if (limited("resend", 5, 36e5))
    throw fail("Too many requests. Try again in an hour.");
  const em = String(body?.email ?? body?.identifier ?? "")
    .trim()
    .toLowerCase();
  const db = store.get(),
    u = findUser(db, em);
  if (u && u.emailVerified === false) sendVerify(db, u);
  return { ok: true };
};

const handleVerifyEmail = async ({ token }) => {
  const t = tokens.get(String(token || ""));
  if (!t || t.type !== "verify" || t.exp <= Date.now())
    return { status: "invalid" };
  setUser(t.userId, { emailVerified: true });
  tokens.delete(String(token));
  pending = { userId: t.userId, exp: Date.now() + PEND_MS };
  return { status: "ok" };
};

const handleUnlock = async ({ token }) => {
  const k = String(token || ""),
    t = tokens.get(k);
  if (!t || t.type !== "unlock" || t.exp <= Date.now())
    return { status: "invalid" };
  const s = secOf(t.userId);
  if (!s.until) {
    s.until = Date.now() + COOL_MS;
    return { status: "wait", seconds: COOL_MS / 1000 };
  }
  const left = s.until - Date.now();
  if (left > 0) return { status: "wait", seconds: Math.ceil(left / 1000) };
  s.fails = 0;
  s.locked = false;
  s.until = null;
  tokens.delete(k);
  return { status: "ok" };
};

const handleOtpInfo = async () => {
  const u = otpUser(),
    o = ownerOf(store.get(), u);
  return {
    mobileVerified: u.mobileVerified !== false,
    phone: maskPhone(o && (o.phone || o.mobile)),
  };
};

const handleOtpResend = async () => {
  const db = store.get(),
    u = otpUser();
  if (u.emailVerified === false) throw fail("Verify your email first.");
  if (u.mobileVerified !== false) return { ok: true, done: true };
  const last = otps.get(u.id),
    age = last ? Date.now() - last.at : Infinity;
  if (last && last.tries >= OTP_MAX && age < OTP_LOCK_MS)
    throw fail(
      `Too many wrong codes. Try again in ${Math.ceil(
        (OTP_LOCK_MS - age) / 60000
      )} minute(s).`
    );
  if (last && age < OTP_GAP_MS)
    throw fail("Please wait 60 seconds before requesting another code.");
  const code = String(
      100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)
    ),
    o = ownerOf(db, u);
  otps.set(u.id, {
    code,
    exp: Date.now() + OTP_MS,
    at: Date.now(),
    tries: 0,
  });
  sms(
    o ? o.phone || o.mobile : "",
    `PawCare: your code is ${code}. Valid for 5 minutes. Do not share it.`
  );
  return { ok: true };
};

const handleOtpVerify = async ({ code }) => {
  const u = otpUser(),
    c = String(code ?? ""),
    t = otps.get(u.id);
  if (!t || t.exp <= Date.now())
    throw fail("Code expired. Request a new one.");
  if (t.tries >= OTP_MAX)
    throw fail(
      "Too many attempts. Locked for 15 minutes from when the code was sent."
    );
  t.tries += 1;
  if (!/^\d{6}$/.test(c) || c !== t.code)
    throw fail(
      t.tries >= OTP_MAX
        ? "Too many attempts. Locked for 15 minutes from when the code was sent."
        : `Incorrect code. ${OTP_MAX - t.tries} attempt(s) left.`
    );
  setUser(u.id, { mobileVerified: true });
  otps.delete(u.id);
  pending = null;
  return {
    ok: true,
    user: session === u.id ? safe({ ...u, mobileVerified: true }) : null,
  };
};

const routes = {
  // Registration
  "POST /api/register": handleRegister,
  "POST /api/auth/register": handleRegister,

  // Login
  "POST /api/login": handleLogin,
  "POST /api/auth/login": handleLogin,

  // Resend verification
  "POST /api/resend-verification": handleResend,
  "POST /api/auth/resend-verification": handleResend,

  // Verify email
  "GET /verify-email": handleVerifyEmail,
  "GET /api/auth/verify-email": handleVerifyEmail,

  // Unlock
  "GET /unlock": handleUnlock,
  "GET /api/auth/unlock": handleUnlock,

  // OTP
  "GET /api/otp/info": handleOtpInfo,
  "GET /api/auth/otp/info": handleOtpInfo,
  "POST /api/otp/resend": handleOtpResend,
  "POST /api/auth/otp/resend": handleOtpResend,
  "POST /api/otp/verify": handleOtpVerify,
  "POST /api/auth/otp/verify": handleOtpVerify,

  // Logout
  "POST /api/logout": async () => {
    session = null;
    return { ok: true };
  },
  "POST /api/auth/logout": async () => {
    session = null;
    return { ok: true };
  },

  // Current session
  "GET /api/me": async () => {
    const u = authed();
    const o = ownerOf(store.get(), u) || {};
    return {
      first_name: u.first_name || (u.name || "").split(" ")[0],
      last_name: u.last_name || (u.name || "").split(" ").slice(1).join(" "),
      middle_initial: u.middle_initial || null,
      email: u.email,
      birthday: u.birthday || null,
      mobile_number: o.phone || o.mobile || "",
      mobile_verified: u.mobileVerified !== false,
      email_verified: u.emailVerified !== false,
      role: u.role,
      house_street: o.house_street || "",
      country: o.country || "",
      state: o.state || "",
      city: o.city || "",
      zip_code: o.zip_code || "",
    };
  },

  // CSRF token
  "GET /api/csrf": async () => ({ csrf: "pc-" + rnd().slice(0, 16) }),

  // Geo APIs
  "GET /api/geo/countries": async (_, q) => searchCountries(q.q),
  "GET /api/geo/countries/:code": async (_, __, params) =>
    countryInfo(params.code) || { error: "Unknown country." },
  "GET /api/geo/states": async (_, q) => searchStates(q.country, q.q),
  "GET /api/geo/cities": async (_, q) =>
    searchCities(q.country, q.state, q.q),
  "GET /api/geo/zips": async (_, q) => getZips(q.country, q.state, q.city),
  "POST /api/geo/validate": async (b) => checkAddress(b || {}),

  // Live checks
  "POST /api/check/mobile": async (b) => checkMobile(b?.country, b?.mobile),
  "POST /api/check/email": async (b) => {
    const r = await checkEmail(b?.email);
    const db = store.get();
    if (
      r.ok &&
      (db.users.some(
        (u) =>
          u.email?.toLowerCase() === r.email ||
          (ownerOf(db, u) || {}).email?.toLowerCase() === r.email
      ) ||
        db.owners.some((o) => o.email?.toLowerCase() === r.email))
    ) {
      return {
        ok: false,
        domain: r.domain,
        error: "This email is already registered.",
      };
    }
    return r;
  },

  // Availability query
  "GET /api/auth/available": async (_, q) => {
    const db = store.get(),
      v = String(q.value || "")
        .trim()
        .toLowerCase();
    return {
      available:
        q.field === "email"
          ? !db.owners.some((o) => o.email.toLowerCase() === v) &&
            !db.users.some((u) => u.email?.toLowerCase() === v)
          : !db.users.some((u) => u.username?.toLowerCase() === v),
    };
  },

  // Password reset
  "POST /api/auth/forgot": async ({ identifier }) => {
    const u = findUser(store.get(), identifier);
    if (!u) return { ok: true };
    const code = String(Math.floor(100000 + Math.random() * 900000));
    codes.set(u.id, {
      code,
      exp: Date.now() + CODE_MINUTES * 60000,
      tries: 0,
    });
    mail(
      emailOf(store.get(), u),
      "PawCare password reset code",
      `Your password reset code is ${code}. It expires in 10 minutes.`
    );
    return { ok: true, devCode: code };
  },
  "POST /api/auth/reset": async ({ identifier, code, password }) => {
    const db = store.get(),
      u = findUser(db, identifier),
      c = u && codes.get(u.id);
    const bad = () =>
      fail("That code is wrong or has expired. Ask for a new one.", {
        code: "That code is wrong or has expired",
      });
    if (!c || Date.now() > c.exp) throw bad();
    if (String(code).trim() !== c.code) {
      if (++c.tries >= MAX_TRIES) codes.delete(u.id);
      throw bad();
    }
    const pw = vPassword(password, { username: u.username });
    if (pw) throw fail(pw, { password: pw });
    store.set((p) => ({
      ...p,
      users: p.users.map((x) => (x.id === u.id ? { ...x, password } : x)),
      log: addLog(p, { name: "System" }, `${u.name} reset their password`),
    }));
    codes.delete(u.id);
    return { ok: true };
  },
};

/* Signed-in owner endpoints */
routes["POST /api/owner/contact"] = async (d) => {
  const u = authed("owner"),
    db = store.get(),
    o = ownerOf(db, u);
  if (!o)
    throw fail(
      "Your owner record couldn’t be found. Please contact the clinic."
    );
  const errs = validateContact(d),
    email = normEmail(d.email);
  if (
    !errs.email &&
    db.owners.some(
      (x) => x.id !== o.id && x.email.toLowerCase() === email
    )
  )
    errs.email = "Another account already uses this email";
  if (Object.keys(errs).length)
    throw fail("Please fix the highlighted fields.", errs);
  const next = {
    ...o,
    email,
    phone: normPhone(d.phone),
    address: clean(d.address),
  };
  store.set((p) => ({
    ...p,
    owners: p.owners.map((x) => (x.id === o.id ? next : x)),
    log: addLog(p, u, "Owner updated own contact details"),
  }));
  return { owner: next };
};

routes["POST /api/owner/password"] = async (d) => {
  const u = authed("owner");
  if (u.password !== d.cur)
    throw fail("Current password is incorrect.", {
      cur: "Current password is incorrect",
    });
  const errs = validatePasswordChange(d, u.username);
  if (Object.keys(errs).length)
    throw fail("Please fix the highlighted fields.", errs);
  store.set((p) => ({
    ...p,
    users: p.users.map((x) =>
      x.id === u.id ? { ...x, password: d.next } : x
    ),
    log: addLog(p, u, "Owner changed own password"),
  }));
  return { ok: true };
};

const ownPet = (u, id) => {
  const p = store
    .get()
    .pets.find((x) => x.id === id && x.ownerId === u.ownerId);
  if (!p) throw fail("That pet isn’t on your account.");
  return p;
};
const savePet = (p, u, changes, msg) => {
  const next = { ...p, ...changes };
  store.set((d) => ({
    ...d,
    pets: d.pets.map((x) => (x.id === p.id ? next : x)),
    log: addLog(d, u, `${msg} for ${p.name}`),
  }));
  return { pet: next };
};
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

routes["POST /api/owner/pets/:id/photo"] = async (
  { photo },
  _,
  { id }
) => {
  const u = authed("owner"),
    p = ownPet(u, id);
  if (
    photo !== "" &&
    !(
      typeof photo === "string" &&
      photo.length <= 300000 &&
      PHOTO_RE.test(photo)
    )
  )
    throw fail("That picture can’t be used. Use a JPG, PNG or WEBP.");
  return savePet(
    p,
    u,
    { photo },
    photo ? "Owner updated picture" : "Owner removed picture"
  );
};

routes["POST /api/owner/pets/:id/allergies"] = async (
  { add, remove },
  _,
  { id }
) => {
  const u = authed("owner"),
    p = ownPet(u, id),
    list = p.allergies || [];
  if (remove !== undefined) {
    if (!list.includes(remove)) throw fail("That allergy isn’t on the list.");
    return savePet(
      p,
      u,
      { allergies: list.filter((a) => a !== remove) },
      `Owner removed allergy "${remove}"`
    );
  }
  const t = clean(add),
    m = vAllergy(t, list);
  if (m) throw fail(m);
  return savePet(
    p,
    u,
    { allergies: [...list, t] },
    `Owner added allergy "${t}"`
  );
};

const byDate = (a) => [...a].sort((x, y) => x.date.localeCompare(y.date));
routes["POST /api/owner/pets/:id/weights"] = async (
  { date, kg, remove },
  _,
  { id }
) => {
  const u = authed("owner"),
    p = ownPet(u, id),
    list = p.weights || [];
  let next;
  if (remove) {
    const w = list.find((x) => x.date === remove);
    if (!w) throw fail("That weight entry no longer exists.");
    if (w.by !== "owner")
      throw fail("Weights recorded by the clinic can’t be removed.");
    next = list.filter((x) => x !== w);
  } else {
    const e = vWeight(
        { date, kg },
        { today: plus(0), birth: p.birth, existing: list }
      ),
      m = e.date || e.kg;
    if (m) throw fail(m, e);
    next = [...list, { date, kg: +kg, by: "owner" }];
  }
  next = byDate(next);
  return savePet(
    p,
    u,
    { weights: next, weight: next.length ? next[next.length - 1].kg : p.weight },
    remove ? "Owner removed a weight entry" : `Owner added weight ${kg} kg`
  );
};

routes["POST /api/owner/pets/:id/notes"] = async (
  { notes },
  _,
  { id }
) => {
  const u = authed("owner"),
    p = ownPet(u, id),
    m = vNote(notes);
  if (m) throw fail(m);
  return savePet(
    p,
    u,
    { notes: String(notes || "").trim() },
    "Owner updated care notes"
  );
};

function findRoute(method, route) {
  for (const k of Object.keys(routes)) {
    const [m, pat] = k.split(" ");
    if (m !== method) continue;
    const names = [],
      g = new RegExp(
        "^" +
          pat.replace(/:([a-z]+)/g, (_, n) => {
            names.push(n);
            return "([^/]+)";
          }) +
          "$"
      ).exec(route);
    if (g)
      return [
        routes[k],
        Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(g[i + 1])])),
      ];
  }
  return [];
}

async function call(method, path, body) {
  // If path is an API endpoint, try real network fetch first:
  if (path.startsWith("/api/")) {
    try {
      const headers = { "Content-Type": "application/json" };
      try {
        const storedTok = (typeof sessionStorage !== "undefined" && sessionStorage.getItem("pawcare_token")) ||
                          (typeof localStorage !== "undefined" && localStorage.getItem("pawcare_token"));
        if (storedTok) {
          headers["Authorization"] = `Bearer ${storedTok}`;
        }
      } catch (_) {}

      const fetchOpts = {
        method,
        headers,
        credentials: "include"
      };
      if (body && method !== "GET") {
        fetchOpts.body = JSON.stringify(body);
      }
      const res = await fetch(path, fetchOpts);
      const isJson = res.headers.get("content-type")?.includes("application/json");
      const data = isJson ? await res.json() : await res.text();

      if (res.ok) {
        if (data?.token && typeof sessionStorage !== "undefined") {
          try { sessionStorage.setItem("pawcare_token", data.token); } catch (_) {}
        }
        return data.data !== undefined ? data.data : data;
      }
      // If endpoint 404 or backend unreachable / proxy error (>= 500), fallback to in-memory
      if (res.status === 404 || res.status >= 500) {
        // Fallback to in-memory below
      } else {
        const err = new Error(data?.error || `Request failed with status ${res.status}`);
        if (data?.errors) err.fields = data.errors;
        if (data?.remainingCooldown) err.remainingCooldown = data.remainingCooldown;
        if (data?.limit) err.limit = true;
        if (data?.lockout) err.lockout = true;
        err.isApiError = true;
        throw err;
      }
    } catch (networkOrApiErr) {
      if (networkOrApiErr.isApiError || networkOrApiErr.fields || networkOrApiErr.remainingCooldown || networkOrApiErr.lockout) {
        throw networkOrApiErr;
      }
      // Server offline / not responding on this endpoint: fallback to in-memory below
    }
  }

  await wait(180);
  const [route, qs] = path.split("?"),
    q = Object.fromEntries(new URLSearchParams(qs || ""));
  const [fn, params] = findRoute(method, route);
  if (!fn) throw fail("Not found: " + route);
  return fn(body || q, q, params || {});
}

// Function callable as api(path, body) -> { ok, d }
// OR as api.get(path), api.post(path, body)
function apiCall(p, b) {
  const method = b !== undefined ? "POST" : "GET";
  const cleanPath = p.startsWith("/") ? p : "/api/" + p;
  return call(method, cleanPath, b)
    .then((d) => ({ ok: true, d }))
    .catch((err) => ({
      ok: false,
      d: {
        error: err.message,
        errors: err.fields || err.errors || {},
        limit: !!err.limit,
      },
    }));
}

export const api = Object.assign(apiCall, {
  get: (p) => call("GET", p.startsWith("/") ? p : "/api/" + p),
  post: (p, b) => call("POST", p.startsWith("/") ? p : "/api/" + p, b),
});

export async function initCsrf() {
  return "pc-csrf";
}
