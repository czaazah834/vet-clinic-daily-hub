import { TODAY, plus } from "../../lib.jsx";
import { nowHM, fmt12, pad } from "./ui.jsx";

/* Booking by service (owner side only).
   Each service has its own length, so the time list only shows start times where the whole visit fits:
   inside clinic hours, not on top of another visit for that vet, and not in the past.
   To change a service, edit this table. Nothing else needs to change. */
export const DAY_START = "08:00", DAY_END = "17:00", STEP = 30;   // clinic hours and how often a visit can start
export const MAX_DAYS = 90, LAST = plus(MAX_DAYS);
const BUSY = ["Cancelled", "No-show"];
const LEGACY_DUR = 30;                                            // visits booked without a service (e.g. by staff) are treated as 30 min

export const SERVICES = {
  vaccination: { label: "Vaccination", icon: "💉", dur: 30, blurb: "Shots and deworming", pick: "Which vaccine or treatment?", hint: "Not sure? Choose “Not sure” and the vet will advise", prefix: "Vaccination – ",
    options: ["Anti-rabies", "5-in-1", "6-in-1", "8-in-1", "Kennel cough", "Feline 4-in-1", "Deworming", "Not sure, ask the vet", "Other"] },
  checkup: { label: "Check-up", icon: "🩺", dur: 60, blurb: "Exam and consultation", pick: "Reason for the check-up", hint: "Choose the closest match", prefix: "",
    options: ["Annual check-up", "Skin or ear problem", "Limping or injury", "Vomiting or diarrhea", "Not eating or drinking", "Dental check", "Follow-up visit", "Other"] },
};

/* Philippine holidays: the clinic is closed, so these dates can't be booked.
   Source: Proclamation No. 1006 (s. 2025) for 2026, plus the fixed-date holidays that repeat every year.
   Each year, add that year's one-off dates (Chinese New Year, Eid, extra "bridge" days) to HOLIDAYS_BY_YEAR. */
const FIXED_HOLIDAYS = {
  "01-01": "New Year’s Day", "04-09": "Araw ng Kagitingan", "05-01": "Labor Day", "06-12": "Independence Day",
  "08-21": "Ninoy Aquino Day", "11-01": "All Saints’ Day", "11-30": "Bonifacio Day", "12-08": "Feast of the Immaculate Conception",
  "12-25": "Christmas Day", "12-30": "Rizal Day", "12-31": "New Year’s Eve",
};
const HOLIDAYS_BY_YEAR = {
  2026: { "02-17": "Chinese New Year", "03-20": "Eid’l Fitr", "11-02": "All Souls’ Day", "12-24": "Christmas Eve" },
};
/* Holy Week and National Heroes Day move every year, so they are worked out instead of listed. */
const ymdOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
function easter(y) {   // Gregorian Easter Sunday (Anonymous / Meeus algorithm)
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, g = Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mo - 1, day);
}
const shiftDay = (dt, n) => { const x = new Date(dt); x.setDate(x.getDate() + n); return ymdOf(x.getFullYear(), x.getMonth() + 1, x.getDate()); };
function movable(y) {
  const E = easter(y), out = { [shiftDay(E, -3)]: "Maundy Thursday", [shiftDay(E, -2)]: "Good Friday", [shiftDay(E, -1)]: "Black Saturday" };
  const last = new Date(y, 7, 31); while (last.getDay() !== 1) last.setDate(last.getDate() - 1);   // last Monday of August
  out[ymdOf(y, 8, last.getDate())] = "National Heroes Day";
  return out;
}
/* Name of the holiday on a "YYYY-MM-DD" date, or "" when the clinic is open that day. */
export function holidayName(date) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const y = Number(date.slice(0, 4)), md = date.slice(5);
  return FIXED_HOLIDAYS[md] || (HOLIDAYS_BY_YEAR[y] || {})[md] || movable(y)[date] || "";
}

const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const toHM = n => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
export const addMin = (t, n) => toHM(toMin(t) + n);
export const durText = n => { const h = Math.floor(n / 60), m = n % 60; return [h ? `${h} hr${h > 1 ? "s" : ""}` : "", m ? `${m} min` : ""].filter(Boolean).join(" "); };
export const niceDay = d => new Date(d + "T00:00:00").toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });

/* Older visits (and staff bookings) have no `service`, so work it out from the reason text. */
export const inferService = r => {
  if (!r) return "";
  if (/vaccin|rabies|booster|deworm|5-in-1|6-in-1|8-in-1|kennel|feline|\bshot/i.test(r)) return "vaccination";
  return "checkup";
};
export const serviceOf = a => a.service && SERVICES[a.service] ? a.service : inferService(a.reason);
export const durOf = a => (SERVICES[a.service] || { dur: LEGACY_DUR }).dur;

/* The saved reason stays readable for staff: "Vaccination – Anti-rabies", "Annual check-up". */
export const makeReason = (service, sel, other) => {
  const S = SERVICES[service], d = sel === "Other" ? other : sel;
  if (sel === "Deworming") return "Deworming";
  if (sel === "Not sure, ask the vet") return "Vaccination";
  return S.prefix + d;
};
export const splitReason = (service, reason) => {
  const S = SERVICES[service]; if (!S || !reason) return ["", ""];
  if (service === "vaccination" && reason === "Deworming") return ["Deworming", ""];
  if (service === "vaccination" && reason === "Vaccination") return ["Not sure, ask the vet", ""];
  const rest = S.prefix && reason.startsWith(S.prefix) ? reason.slice(S.prefix.length) : reason;
  return S.options.includes(rest) && rest !== "Other" ? [rest, ""] : ["Other", rest];
};

/* Start times (as "HH:MM") that fit this service for this vet on this date. */
export function openSlots(db, { service, vetId, date }, editing) {
  const S = SERVICES[service]; if (!S || !vetId || !date || holidayName(date)) return [];
  const busy = db.appts.filter(a => (!editing || a.id !== editing.id) && !BUSY.includes(a.status) && a.vetId === vetId && a.date === date).map(a => [toMin(a.time), toMin(a.time) + durOf(a)]);
  const out = [], end = toMin(DAY_END);
  for (let m = toMin(DAY_START); m + S.dur <= end; m += STEP) {
    const t = toHM(m);
    if (date === TODAY && t <= nowHM()) continue;
    if (busy.some(([a, b]) => m < b && a < m + S.dur)) continue;
    out.push(t);
  }
  return out;
}
/* When editing, the visit's own time stays pickable as long as vet, date and service are unchanged. */
export function allowedTimes(db, v, editing) {
  const list = openSlots(db, v, editing);
  if (editing && editing.vetId === v.vetId && editing.date === v.date && serviceOf(editing) === v.service && !list.includes(editing.time)) return [...list, editing.time].sort();
  return list;
}
/* First later day (within the booking window) that has an opening, so a full day isn't a dead end. */
export function nextOpenDay(db, v, editing) {
  for (let i = 1; i <= MAX_DAYS; i++) { const d = plus(i); if (d > v.date && d <= LAST && openSlots(db, { ...v, date: d }, editing).length) return d; }
  return null;
}

export function ServicePicker({ value, onChange, error }) {
  return (
    <div className="fld">
      <label id="svc-l">What is the visit for?<i> *</i></label>
      <div className="ow-svcs" role="radiogroup" aria-labelledby="svc-l">
        {Object.entries(SERVICES).map(([k, s]) => <button type="button" key={k} role="radio" aria-checked={value === k} className={`ow-svc${value === k ? " on" : ""}`} onClick={() => onChange(k)}>
          <span className="ic" aria-hidden="true">{s.icon}</span><b>{s.label}</b><small>{s.blurb}</small><small>{durText(s.dur)}</small>
        </button>)}
      </div>
      <span className={error ? "err" : "ow-hint"} aria-live="polite">{error || "Pick a service first. The times below change to fit it"}</span>
    </div>
  );
}

/* Only start times that fit are shown, so there is nothing to pick wrong. */
export function SlotPicker({ times, value, onChange, error, hint, dur, suggest, onSuggest }) {
  return (
    <div className="fld">
      <label id="time-l">Time<i> *</i></label>
      {times.length
        ? <div className="ow-slots" role="radiogroup" aria-labelledby="time-l">{times.map(t => <button type="button" key={t} role="radio" aria-checked={value === t} className={`ow-slot${value === t ? " on" : ""}`} onClick={() => onChange(t)}>{fmt12(t)}{dur > STEP && <small>to {fmt12(addMin(t, dur))}</small>}</button>)}</div>
        : <div className="ow-slotempty">{hint}{suggest && <> <button type="button" className="ow-link" onClick={onSuggest}>Jump to {niceDay(suggest)}</button></>}</div>}
      <span className={error ? "err" : "ow-hint"} aria-live="polite">{error || (times.length ? hint : "")}</span>
    </div>
  );
}
