import { useState, useEffect } from "react";
import { Badge, I, ICON, VETS, TODAY, scope, petName, uid, addLog, dueState } from "../../lib.jsx";
import ApptDetails from "./ApptDetails.jsx";
import { useLive, Field, Suggest, Modal, addNote, prefill, fmt12, ymdLocal } from "./ui.jsx";
import { SERVICES, MAX_DAYS, LAST, ServicePicker, SlotPicker, allowedTimes, nextOpenDay, inferService, serviceOf, holidayName, durOf, durText, addMin, makeReason, splitReason } from "./services.jsx";

const isTouch = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
const OPEN = ["Scheduled", "Confirmed"], BUSY = ["Cancelled", "No-show"];
const NOTE_IDEAS = ["My pet is nervous around other animals.", "Please call me before the visit.", "My pet hasn’t eaten today.", "My pet is on medication.", "Bringing vaccine card."];
const CANCEL_WHY = ["Schedule conflict", "My pet is feeling better", "Booked by mistake", "Need a different date", "Other"];
const STATUS_NOTE = { Scheduled: "Waiting for the clinic to confirm", Confirmed: "Confirmed. Please arrive 10 minutes early", "Checked-in": "You’re checked in. The vet will call you in", "In consultation": "The vet is seeing your pet now", Completed: "Done. See Visit History for notes", Cancelled: "This visit was cancelled", "No-show": "Marked as missed" };
const mkRules = (db, me, editing) => v => {
  const e = {}, mine = scope(db, me, "pets").map(p => p.id), S = SERVICES[v.service];
  if (!v.service) e.service = "Choose a service"; else if (!S) e.service = "Pick a service from the list";
  if (!v.petId) e.petId = "Choose which pet is visiting"; else if (!mine.includes(v.petId)) e.petId = "Pick one of your own pets";
  if (!v.vetId) e.vetId = "Choose a veterinarian"; else if (!VETS.some(x => x[0] === v.vetId)) e.vetId = "Pick a veterinarian from the list";
  const sameDay = editing && editing.date === v.date;
  if (!v.date) e.date = "Choose a date";
  else if (isNaN(new Date(v.date + "T00:00:00"))) e.date = "Enter a valid date";
  else if (v.date < TODAY && !sameDay) e.date = "Date can’t be in the past";
  else if (v.date > LAST) e.date = `You can book up to ${MAX_DAYS} days ahead (until ${LAST})`;
  else if (holidayName(v.date) && !sameDay) e.date = `The clinic is closed on ${holidayName(v.date)} (holiday). Please pick another day`;
  const others = db.appts.filter(a => (!editing || a.id !== editing.id) && !BUSY.includes(a.status));
  if (!v.time) e.time = !v.service ? "Choose a service first" : v.date && v.vetId ? "Choose a time" : "Choose a veterinarian and date first";
  else if (S && !allowedTimes(db, v, editing).includes(v.time)) e.time = `That time isn’t open for ${S.label.toLowerCase()} (${durText(S.dur)}). Pick one of the open times`;
  if (!e.petId && v.date && !e.date) { const x = others.find(a => a.petId === v.petId && a.date === v.date); if (x) e.date = `${petName(db, v.petId)} already has a visit that day at ${fmt12(x.time)}`; }
  if (S) {
    if (!v.reasonSel) e.reasonSel = "Choose one";
    else if (!S.options.includes(v.reasonSel)) e.reasonSel = "Pick one from the list";
    else if (v.reasonSel === "Other") { const r = v.reasonOther.trim(); if (!r) e.reasonOther = "Please describe it"; else if (r.length < 3) e.reasonOther = "Use at least 3 characters"; else if (r.length > 200) e.reasonOther = "Keep it under 200 characters"; else if (!/[A-Za-zÀ-ÿ]/.test(r)) e.reasonOther = "Describe it in words, not only numbers or symbols"; }
  }
  const nt = (v.notes || "").trim(); if (nt.length > 200) e.notes = "Keep notes under 200 characters"; else if (nt && !/[A-Za-zÀ-ÿ]/.test(nt)) e.notes = "Write a few words, not only numbers or symbols";
  return e;
};

function BookForm({ db, setDb, me, say, editing, start, onClose }) {
  const pets = scope(db, me, "pets"), owner = db.owners.find(o => o.id === me.ownerId) || {};
  const prev = editing ? serviceOf(editing) : "", svc0 = editing ? prev : start && start.reason ? inferService(start.reason) : "";
  const [rs, ro] = editing ? splitReason(prev, editing.reason) : start && start.reason === "Deworming" ? ["Deworming", ""] : ["", ""];
  const f = useLive({ service: svc0, petId: editing ? editing.petId : (start && start.petId) || (pets.length === 1 ? pets[0].id : ""), vetId: editing ? editing.vetId : "", date: editing ? editing.date : (start && start.date) || "", time: editing ? editing.time : "", reasonSel: rs, reasonOther: ro, notes: editing ? editing.notes || "" : "" }, mkRules(db, me, editing));
  const { v } = f, S = SERVICES[v.service];
  const times = allowedTimes(db, v, editing), vetName = (VETS.find(x => x[0] === v.vetId) || [])[1];
  const ready = S && v.vetId && v.date;
  const nextDay = ready && !times.length ? nextOpenDay(db, v, editing) : null;
  const timeHint = !S ? "Choose a service first" : !ready ? "Choose a veterinarian and date to see open times" : times.length ? `${times.length} open time${times.length > 1 ? "s" : ""} for ${S.label.toLowerCase()} (${durText(S.dur)}) with ${vetName}` : holidayName(v.date) ? `Closed for ${holidayName(v.date)}.` : `No open times for ${S.label.toLowerCase()} (${durText(S.dur)}) that day.`;
  const moved = editing && editing.status === "Confirmed" && (editing.date !== v.date || editing.time !== v.time || editing.vetId !== v.vetId || prev !== v.service);
  const submit = e => {
    e.preventDefault(); f.submit(); if (!f.valid) return;
    if (!scope(db, me, "pets").some(p => p.id === v.petId)) { say("You can only book for your own pets"); return onClose(); }
    if (editing) { const cur = db.appts.find(a => a.id === editing.id); if (!cur || !OPEN.includes(cur.status)) { say("This visit can no longer be changed"); return onClose(); } }
    const reason = makeReason(v.service, v.reasonSel, v.reasonOther.trim()), notes = (v.notes || "").trim();
    const apptId = uid();
    setDb(p => {
      const data = { petId: v.petId, vetId: v.vetId, date: v.date, time: v.time, service: v.service, reason, notes };
      return { ...p, appts: editing ? p.appts.map(a => a.id === editing.id ? { ...a, ...data, status: moved ? "Scheduled" : a.status } : a) : [...p.appts, { id: apptId, ...data, status: "Scheduled" }], log: addLog(p, me, `${editing ? "Rescheduled/updated" : "Booked"} ${S.label.toLowerCase()} visit for ${petName(p, v.petId)} on ${v.date} ${v.time}`) };
    });
    // Sync to PostgreSQL backend
    api.post("/api/appointments", {
      id: apptId,
      petId: v.petId,
      vetId: v.vetId,
      date: v.date,
      time: v.time,
      reason,
      actorName: me.name,
      actorRole: "owner"
    }).catch(() => {});
    say(editing ? (moved ? "Updated. The clinic will re-confirm your new time" : "Appointment updated") : "Booked! The clinic will confirm your visit"); onClose();
  };
  return (
    <Modal title={editing ? "Edit appointment" : "Book a visit"} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        {!pets.length && <p className="ow-note">You have no pets on your account yet. Please ask the clinic front desk to register your pet first.</p>}
        {moved && <p className="ow-note">Changing the service, date, time or veterinarian sends this visit back to “Scheduled” so the clinic can re-confirm it.</p>}
        <ServicePicker value={v.service} onChange={x => { if (x === v.service) return; f.set("service", x); f.quiet({ time: "", reasonSel: "", reasonOther: "" }); }} error={f.show("service")} />
        <Field id="petId" label="Pet" req type="select" value={v.petId} onChange={x => f.set("petId", x)} onBlur={() => f.blur("petId")} options={pets.map(p => [p.id, `${p.name} (${p.species})`])} error={f.show("petId")} valid={f.ok("petId")} hint="Which pet is coming in?" />
        <Field id="vetId" label="Veterinarian" req type="select" value={v.vetId} onChange={x => f.patch({ vetId: x, time: "" })} onBlur={() => f.blur("vetId")} options={VETS} error={f.show("vetId")} valid={f.ok("vetId")} hint="Times below update for the vet you pick" />
        <Field id="date" label="Date" req type="date" min={TODAY} maxDate={LAST} value={v.date} onChange={x => f.patch({ date: x, time: "" })} onBlur={() => f.blur("date")} error={f.show("date")} valid={f.ok("date")} hint={holidayName(v.date) ? `${holidayName(v.date)} is a holiday. The clinic is closed` : `Pick a day within the next ${MAX_DAYS} days (closed on Philippine holidays)`} />
        <SlotPicker times={times} value={v.time} onChange={x => f.set("time", x)} error={f.show("time")} hint={timeHint} dur={S ? S.dur : 30} suggest={nextDay} onSuggest={() => f.patch({ date: nextDay, time: "" })} />
        {S && v.time && times.includes(v.time) && <p className="ow-note info">{S.label}: {fmt12(v.time)} to {fmt12(addMin(v.time, S.dur))} with {vetName}</p>}
        {S && <Field id="reasonSel" label={S.pick} req type="select" value={v.reasonSel} onChange={x => f.set("reasonSel", x)} onBlur={() => f.blur("reasonSel")} options={S.options.map(r => [r, r])} error={f.show("reasonSel")} valid={f.ok("reasonSel")} hint={S.hint} />}
        {S && v.reasonSel === "Other" && <Field id="reasonOther" label="Describe it" req type="textarea" rows={2} max={200} value={v.reasonOther} onChange={x => f.set("reasonOther", x)} onBlur={() => f.blur("reasonOther")} error={f.show("reasonOther")} valid={f.ok("reasonOther")} hint={v.service === "vaccination" ? "Example: leptospirosis shot" : "Example: limping on the left back leg since yesterday"} />}
        <Field id="notes" label="Note for the clinic (optional)" type="textarea" rows={2} max={200} value={v.notes} onChange={x => f.set("notes", x)} onBlur={() => f.blur("notes")} error={f.show("notes")} hint="Symptoms, behavior or anything the clinic should know" />
        <Suggest items={NOTE_IDEAS} onPick={s => f.set("notes", addNote(v.notes, s, 200))} />
        <p className="ow-hint" style={{ marginTop: 10 }}>The clinic will reach you at {owner.phone || "your number on file"}. You can update it in My Profile.</p>
        {f.submitted && !f.valid && <p className="err" role="alert">Please fix {f.count} field{f.count > 1 ? "s" : ""} above.</p>}
        <div className="row end"><button type="button" className="btn ghost" onClick={onClose}>Close</button><button className="btn" disabled={!pets.length}>{editing ? "Save changes" : "Book visit"}</button></div>
      </form>
    </Modal>
  );
}

function CancelDialog({ a, db, setDb, me, say, onClose }) {
  const f = useLive({ why: "", other: "" }, v => { const e = {}; if (!v.why) e.why = "Please tell us why"; else if (v.why === "Other") { const o = v.other.trim(); if (o.length < 3) e.other = "Add a short reason (3+ characters)"; else if (o.length > 120) e.other = "Keep it under 120 characters"; else if (!/[A-Za-zÀ-ÿ]/.test(o)) e.other = "Use words, not only numbers or symbols"; } return e; });
  const go = e => {
    e.preventDefault(); f.submit(); if (!f.valid) return;
    const cur = db.appts.find(x => x.id === a.id), mine = scope(db, me, "pets").some(p => p.id === a.petId);
    if (!cur || !mine || !OPEN.includes(cur.status)) { say("This visit can no longer be cancelled"); return onClose(); }
    const why = f.v.why === "Other" ? f.v.other.trim() : f.v.why;
    setDb(p => ({ ...p, appts: p.appts.map(x => x.id === a.id ? { ...x, status: "Cancelled", cancelReason: why } : x), log: addLog(p, me, `${petName(p, a.petId)}: ${a.status} → Cancelled (${why})`) }));
    api.patch(`/api/appointments/${a.id}/status`, { status: "Cancelled", cancelReason: why, actorName: me.name, actorRole: "owner" }).catch(() => {});
    say("Appointment cancelled"); onClose();
  };
  return (
    <Modal title="Cancel this visit?" onClose={onClose}>
      <form onSubmit={go} noValidate>
        <p>{petName(db, a.petId)} · {a.date} at {fmt12(a.time)}</p>
        <Field id="why" label="Reason for cancelling" req type="select" value={f.v.why} onChange={x => f.set("why", x)} onBlur={() => f.blur("why")} options={CANCEL_WHY.map(r => [r, r])} error={f.show("why")} valid={f.ok("why")} hint="This helps the clinic plan its day" />
        {f.v.why === "Other" && <Field id="other" label="Tell us more" req type="textarea" rows={2} max={120} value={f.v.other} onChange={x => f.set("other", x)} onBlur={() => f.blur("other")} error={f.show("other")} valid={f.ok("other")} hint="A few words is enough" />}
        <div className="row end"><button type="button" className="btn ghost" onClick={onClose}>Keep visit</button><button className="btn danger">Cancel visit</button></div>
      </form>
    </Modal>
  );
}

/* ---------- Calendar beside the list: visits, vaccines given and vaccines due ---------- */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const KIND = { visit: ["Visit", "k-visit"], done: ["Past visit", "k-done"], given: ["Vaccine given", "k-given"], due: ["Vaccine due", "k-due"], over: ["Overdue vaccine", "k-over"] };

/* { "YYYY-MM-DD": [event, ...] } for the calendar dots and the vaccine notes under the list. */
function buildEvents(db, me, pet, svc, q) {
  const ev = {}, add = (d, x) => { if (d) (ev[d] = ev[d] || []).push(x); }, needle = q.trim().toLowerCase();
  scope(db, me, "appts").filter(a => a.status !== "Cancelled" && (!pet || a.petId === pet) && (!svc || serviceOf(a) === svc)).forEach(a => {
    const vet = (VETS.find(v => v[0] === a.vetId) || [])[1] || "", text = `${petName(db, a.petId)}: ${a.reason}`;
    if (needle && ![text, vet, a.status, a.date].join(" ").toLowerCase().includes(needle)) return;
    add(a.date, { kind: ["Completed", "No-show"].includes(a.status) || a.date < TODAY ? "done" : "visit", text, appt: a });
  });
  if (!svc) scope(db, me, "vacc").filter(v => !pet || v.petId === pet).forEach(v => {
    const nm = petName(db, v.petId);
    if (needle && !`${nm} ${v.vaccine}`.toLowerCase().includes(needle)) return;
    add(v.date, { kind: "given", text: `${nm}: ${v.vaccine} given`, sub: v.notes || "", vacc: v });
    if (!v.done && v.nextDue) add(v.nextDue, { kind: dueState(v.nextDue) === "Overdue" ? "over" : "due", text: `${nm}: ${v.vaccine} due`, sub: dueState(v.nextDue), vacc: v });
  });
  return ev;
}

/* Small month grid. Click a day to filter the list to it, click it again to clear. */
function MiniCalendar({ ev, day, setDay }) {
  const t = new Date(), [cur, setCur] = useState({ y: t.getFullYear(), m: t.getMonth() });
  const first = new Date(cur.y, cur.m, 1), cells = Array.from({ length: 42 }, (_, i) => new Date(cur.y, cur.m, 1 - first.getDay() + i));
  const move = n => { const d = new Date(cur.y, cur.m + n, 1); setCur({ y: d.getFullYear(), m: d.getMonth() }); };
  return (
    <div className="ow-cal">
      <div className="ow-calhd">
        <button className="btn ghost sm" onClick={() => move(-1)} aria-label="Previous month">‹</button>
        <h2 aria-live="polite">{MONTHS[cur.m]} {cur.y}</h2>
        <button className="btn ghost sm" onClick={() => { setCur({ y: t.getFullYear(), m: t.getMonth() }); setDay(TODAY); }}>Today</button>
        <button className="btn ghost sm" onClick={() => move(1)} aria-label="Next month">›</button>
      </div>
      <div className="ow-grid" role="grid" aria-label="Calendar">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} className="ow-dow">{d}</div>)}
        {cells.map(d => {
          const k = ymdLocal(d), items = ev[k] || [], out = d.getMonth() !== cur.m, past = k < TODAY, hol = holidayName(k);
          return <button key={k} className={`ow-day${out ? " out" : ""}${past ? " past" : ""}${hol ? " hol" : ""}${k === TODAY ? " today" : ""}${k === day ? " sel" : ""}`} aria-pressed={k === day}
            onClick={() => { setDay(k === day ? "" : k); if (out) setCur({ y: d.getFullYear(), m: d.getMonth() }); }}
            aria-label={`${d.toDateString()}, ${items.length} event(s)${hol ? `, ${hol}, clinic closed` : ""}`} title={hol || undefined}>
            <b>{d.getDate()}</b>
            <div className="ow-evs">{items.slice(0, 4).map((x, i) => <div key={i} className={`ow-ev ${KIND[x.kind][1]}`} title={x.text}><i className="ow-dot" /><span>{x.text}</span></div>)}</div>
          </button>;
        })}
      </div>
      <div className="ow-legend">{Object.values(KIND).map(([l, c]) => <span key={l} className={`ow-ev ${c}`}><i className="ow-dot" />{l}</span>)}<span className="ow-holkey"><i />Holiday (closed)</span></div>
    </div>
  );
}

export default function OwnerAppts({ db, setDb, me, say }) {
  const [modal, setModal] = useState(() => prefill.data ? { book: true, start: prefill.data } : null), [q, setQ] = useState(""), [view, setView] = useState("upcoming"), [pet, setPet] = useState(""), [svc, setSvc] = useState(""), [day, setDay] = useState("");
  useEffect(() => { prefill.data = null; }, []);
  const pets = scope(db, me, "pets");
  let list = scope(db, me, "appts").slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const live = a => OPEN.includes(a.status) || ["Checked-in", "In consultation"].includes(a.status);
  if (day) list = list.filter(a => a.date === day && a.status !== "Cancelled");
  else if (view === "upcoming") list = list.filter(a => live(a) && a.date >= TODAY);
  else if (view === "past") list = list.filter(a => a.status === "Completed" || a.status === "No-show" || (live(a) && a.date < TODAY)).reverse();
  else if (view === "cancelled") list = list.filter(a => a.status === "Cancelled");
  if (pet) list = list.filter(a => a.petId === pet);
  if (svc) list = list.filter(a => serviceOf(a) === svc);
  if (q.trim()) list = list.filter(a => [petName(db, a.petId), a.reason, (SERVICES[serviceOf(a)] || {}).label, a.status, a.date, (VETS.find(v => v[0] === a.vetId) || [])[1]].join(" ").toLowerCase().includes(q.trim().toLowerCase()));
  const ev = buildEvents(db, me, pet, svc, q), hol = day ? holidayName(day) : "", dayVacc = day ? (ev[day] || []).filter(x => x.vacc) : [];
  const dayNice = day ? new Date(day + "T00:00:00").toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";
  const waiting = scope(db, me, "appts").filter(a => a.status === "Scheduled" && a.date >= TODAY).length;
  return (<>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 14 }}>
      <div style={{ flex: "2 1 240px", minWidth: 0 }}>
        <label className="ow-lbl" htmlFor="ap-q">Search</label>
        <input id="ap-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Pet, service, vet, date or status" style={{ width: "100%" }} />
      </div>
      <div style={{ flex: "1 1 150px", minWidth: 0 }}>
        <label className="ow-lbl" htmlFor="ap-view">Show</label>
        <select id="ap-view" value={view} onChange={e => setView(e.target.value)} disabled={!!day} title={day ? "Clear the selected day to change this" : ""} style={{ width: "100%" }}><option value="upcoming">Upcoming visits</option><option value="past">Past visits</option><option value="cancelled">Cancelled</option><option value="all">All visits</option></select>
      </div>
      <div style={{ flex: "1 1 150px", minWidth: 0 }}>
        <label className="ow-lbl" htmlFor="ap-pet">Pet</label>
        <select id="ap-pet" value={pet} onChange={e => setPet(e.target.value)} style={{ width: "100%" }}><option value="">All my pets</option>{pets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </div>
      <div style={{ flex: "1 1 150px", minWidth: 0 }}>
        <label className="ow-lbl" htmlFor="ap-svc">Service</label>
        <select id="ap-svc" value={svc} onChange={e => setSvc(e.target.value)} style={{ width: "100%" }}><option value="">All services</option>{Object.entries(SERVICES).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}</select>
      </div>
      <button className="btn" onClick={() => setModal({ book: true })} disabled={!pets.length} title={pets.length ? "" : "Add your pet first from My Pets"}>+ Book a visit</button>
    </div>
    {waiting > 0 && <div className="ow-banner wa"><span>{waiting} visit(s) waiting for the clinic to confirm. You can still edit or cancel them.</span></div>}
    
    <style>{`.ap-split{display:grid;grid-template-columns:minmax(300px,400px) minmax(0,1fr);gap:16px;align-items:start}
@media(max-width:980px){.ap-split{grid-template-columns:1fr}}
.ap-split .ow-cal{padding:12px}.ap-split .ow-day{min-height:50px;align-items:center;padding:4px}
.ap-split .ow-day .ow-hol,.ap-split .ow-ev span,.ap-split .ow-more{display:none}
.ap-split .ow-evs{display:flex;flex-wrap:wrap;gap:2px;justify-content:center}`}</style>
    
    <div className="ap-split">
      <MiniCalendar ev={ev} day={day} setDay={setDay} />
      <div style={{ minWidth: 0 }}>
        {!pets.length && (
          <div className="ow-note info" style={{ marginBottom: 12 }}>
            💡 <b>Notice:</b> You haven’t added a pet yet. Please go to <b>My Pets</b> to add your pet, or you can view the clinic calendar and schedules below.
          </div>
        )}
        {day && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0, flex: "1 1 auto" }}>{dayNice}{day === TODAY ? " (today)" : ""}</h3>
          {day >= TODAY && !hol && <button className="btn sm" disabled={!pets.length} onClick={() => setModal({ book: true, start: { petId: pet || "", reason: "", date: day } })}>+ Book on this day</button>}
          <button className="btn ghost sm" onClick={() => setDay("")}>Show all</button>
        </div>}
        {hol && <p className="ow-note">Holiday: {hol}. The clinic is closed, so visits can’t be booked on this day.</p>}
        {list.length > 0 && <p className="ow-hint">Click any visit to view full clinical details. Open visits can be rescheduled or cancelled.</p>}
        {(list.length ? <div className="tw"><table><thead><tr><th>Date</th><th>Time</th><th>Pet</th><th>Veterinarian</th><th>Reason</th><th>Status</th><th /></tr></thead><tbody>{list.map(a => {
          const p = db.pets.find(x => x.id === a.petId) || {}, open = OPEN.includes(a.status) && a.date >= TODAY;
          return <tr key={a.id} className="vh-r" tabIndex={0} style={{ cursor: "pointer" }} title="Click to see details" onClick={() => setModal({ view: a })} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setModal({ view: a }); } }}><td>{a.date}</td><td>{fmt12(a.time)}{a.service && SERVICES[a.service] && <small className="ow-sub">to {fmt12(addMin(a.time, durOf(a)))}</small>}</td><td><span className="who"><span className="av"><I e={ICON[p.species]} size={16} /></span>{p.name}</span></td><td>{(VETS.find(v => v[0] === a.vetId) || [])[1] || "—"}</td>
            <td>{a.reason}{a.service && SERVICES[a.service] && <small className="ow-sub">{SERVICES[a.service].label} · {durText(durOf(a))}</small>}{a.notes && <small className="ow-sub">Note: {a.notes}</small>}{a.cancelReason && <small className="ow-sub">Cancelled: {a.cancelReason}</small>}</td>
            <td><Badge v={a.status} /><small className="ow-sub">{STATUS_NOTE[a.status]}</small></td>
            <td className="act">{open && <><button className="btn ghost sm" onClick={e => { e.stopPropagation(); setModal({ book: true, editing: a }); }}>Edit</button> <button className="btn danger sm" onClick={e => { e.stopPropagation(); setModal({ cancel: a }); }}>Cancel</button></>}</td></tr>;
        })}</tbody></table></div> : <div className="empty"><div><I e="📅" size={34} /></div>{day ? "No visits on this day." : "No visits to show here."}</div>)}
        {dayVacc.length > 0 && <div className="ow-dayp" style={{ marginTop: 12 }}><h3>Vaccines on this day</h3>{dayVacc.map((x, i) => <div className="ow-evrow" key={i}><span className={`ow-ev ${KIND[x.kind][1]}`}><i className="ow-dot" />{KIND[x.kind][0]}</span><div><b>{x.text}</b>{x.sub && <small>{x.sub}</small>}</div>{(x.kind === "due" || x.kind === "over") && <button className="btn sm" disabled={!pets.length} onClick={() => setModal({ book: true, start: { petId: x.vacc.petId, reason: x.vacc.vaccine === "Deworming" ? "Deworming" : "Vaccination" } })}>Book a visit</button>}</div>)}</div>}
      </div>
    </div>
    {modal && modal.book && <BookForm db={db} setDb={setDb} me={me} say={say} editing={modal.editing} start={modal.start} onClose={() => setModal(null)} />}
    {modal && modal.view && <ApptDetails a={modal.view} db={db} note={STATUS_NOTE[modal.view.status]} onClose={() => setModal(null)} onEdit={() => setModal({ book: true, editing: modal.view })} onCancel={() => setModal({ cancel: modal.view })} />}
    {modal && modal.cancel && <CancelDialog a={modal.cancel} db={db} setDb={setDb} me={me} say={say} onClose={() => setModal(null)} />}
  </>);
}