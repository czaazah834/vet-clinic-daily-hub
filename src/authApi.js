/* Every sign-in network call lives here, so the pages never build URLs themselves.
   If your server uses different paths or field names, change them in this one file.
   Contract (the flow follows login_registration/server.js; see docs/AUTH-FLOW.md):
     POST /api/auth/login               { identifier, password }          -> { user, needsOtp }      (needsOtp = mobile not verified yet)
                                                                            errors carry `unverified: true` when the password was right but the email is not verified
     POST /api/auth/register            { name, email, phone, address, username, password, agree } -> { ok, email }   (NOT signed in; a verification email is sent)
                                                                            a 5-per-hour-per-IP rejection carries `limit: true`
     POST /api/auth/resend-verification { identifier }                    -> { ok: true }            (same answer whether or not the account exists)
     GET  /api/auth/verify-email?token= -> { status: "ok" | "invalid" }   (email link; "ok" also opens the mobile-code step for 30 minutes)
     GET  /api/auth/unlock?token=       -> { status: "wait", seconds } | { status: "ok" } | { status: "invalid" }
     GET  /api/auth/otp/info            -> { mobileVerified, phone }       (phone is masked)
     POST /api/auth/otp/resend          -> { ok }                          (429-style error if called again within 60 s or while locked)
     POST /api/auth/otp/verify          { code }                           -> { ok, user }            (user is null when the person came from the email link and still has to log in)
     POST /api/auth/forgot              { identifier }                     -> { ok: true }
     POST /api/auth/reset               { identifier, code, password }     -> { ok: true }
     GET  /api/auth/available?field=username|email&value=...               -> { available: true|false }   (optional)
   Emails link back to the app as  <site>/?verify=TOKEN  and  <site>/?unlock=TOKEN  (App.jsx reads them on load).
   Errors: the thrown error carries `message`, `offline` (server unreachable) and, for field problems, `fields` = { fieldName: "message" }. */
import { api } from "./api.js";

export const auth = {
  login: (identifier, password) => api.post("/api/auth/login", { identifier, password }),
  register: d => api.post("/api/auth/register", d),
  resendVerification: identifier => api.post("/api/auth/resend-verification", { identifier }),
  verifyEmail: token => api.get(`/api/auth/verify-email?token=${encodeURIComponent(token)}`),
  unlock: token => api.get(`/api/auth/unlock?token=${encodeURIComponent(token)}`),
  otpInfo: () => api.get("/api/auth/otp/info"),
  otpSend: () => api.post("/api/auth/otp/resend"),
  otpVerify: code => api.post("/api/auth/otp/verify", { code }),
  forgot: identifier => api.post("/api/auth/forgot", { identifier }),
  reset: d => api.post("/api/auth/reset", d),
  changePassword: d => api.post("/api/owner/password", d),   // { cur, next, conf }
  updateContact: d => api.post("/api/owner/contact", d),     // { email, phone, address } -> { owner }
  petPhoto: (id, photo) => api.post(`/api/owner/pets/${id}/photo`, { photo }),          // photo = data URL, or "" to remove
  petAllergy: (id, d) => api.post(`/api/owner/pets/${id}/allergies`, d),                 // { add: "Chicken" } or { remove: "Chicken" }
  petWeight: (id, d) => api.post(`/api/owner/pets/${id}/weights`, d),                    // { date, kg } or { remove: date }
  petNotes: (id, notes) => api.post(`/api/owner/pets/${id}/notes`, { notes }),
  logout: () => api.post("/api/auth/logout"),
  available: (field, value) => api.get(`/api/auth/available?field=${field}&value=${encodeURIComponent(value)}`),
};
export const OFFLINE_MSG = "We can’t reach the clinic server. Please try again in a moment.";