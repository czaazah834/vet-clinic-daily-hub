/* Every sign-in network call lives here, so the pages never build URLs themselves.
   If your server uses different paths or field names, change them in this one file.
   Assumed contract (matches what App.jsx already uses for /api/auth/me and /api/auth/logout):
     POST /api/auth/login     { identifier, password }                 -> { user }
     POST /api/auth/register  { name, email, phone, address, username, password, agree } -> { user }
     POST /api/auth/forgot    { identifier }                           -> { ok: true }   (same answer whether or not the account exists)
     POST /api/auth/reset     { identifier, code, password }           -> { ok: true }
     GET  /api/auth/available?field=username|email&value=...           -> { available: true|false }   (optional)
   Errors: the thrown error carries `message`, `offline` (server unreachable) and, for field problems, `fields` = { fieldName: "message" }. */
import { api } from "./api.js";

export const auth = {
  login: (identifier, password) => api.post("/api/auth/login", { identifier, password }),
  register: d => api.post("/api/auth/register", d),
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