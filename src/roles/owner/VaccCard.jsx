import { useState, useEffect } from "react";
import { Badge, VETS, scope, petName, dueState, TODAY } from "../../lib.jsx";
import { auth, OFFLINE_MSG } from "../../authApi.js";
import { setPrefill, Avatar, PhotoUpload, pick, petAge, Icon, Modal } from "./ui.jsx";
import MedProfile from "./MedProfile.jsx";

/* ---------- clinic details printed on the card: EDIT THESE ---------- */
/* Clinic details shown at the top of a printed vaccination card.
   EDIT THESE to your real clinic. Empty lines are simply left out of the printout. */
const CLINIC = {
  name: "PawCare Veterinary Clinic",
  address: "",   // e.g. "123 Sample St., Barangay Example, City"
  phone: "",     // e.g. "0917 000 0000"
  email: "",     // e.g. "hello@yourclinic.ph"
};

/* ---------- extra vaccine record fields ---------- *//* Extra details a complete vaccine record should carry. All optional on old records, so nothing breaks.
     vetId / vetName   who gave the shot (vetLicense: their license number)
     brand, batch      product name and lot number
     doseNo, doseOf    "dose 2 of 3"
     validUntil        last day the vaccine counts (important for rabies: 1-year or 3-year)
   Plain JS, no React: the vet form and the Node server can reuse validateVaccExtras later. */

const LETTER = /[A-Za-zÀ-ÿ]/;
const BATCH_RE = /^[A-Za-z0-9][A-Za-z0-9\-\/ ]*$/;

const doseLabel = v => v.doseNo ? (v.doseOf ? `Dose ${v.doseNo} of ${v.doseOf}` : `Dose ${v.doseNo}`) : "";

/* What is still missing on a record, so the card can tell the owner to ask the clinic. */
const completeness = v => {
  const miss = [];
  if (!v.vetId && !v.vetName) miss.push("vet");
  if (!String(v.batch || "").trim()) miss.push("batch");
  return miss;
};

/* x = { vetId, brand, batch, doseNo, doseOf, validUntil }, ctx = { given: "YYYY-MM-DD", vetIds: [...] }. Returns { field: message }. */
function validateVaccExtras(x, ctx = {}) {
  const e = {};
  if (!x.vetId) e.vetId = "Choose the veterinarian who gave the vaccine";
  else if (ctx.vetIds && !ctx.vetIds.includes(x.vetId)) e.vetId = "Pick a veterinarian from the list";

  const br = (x.brand || "").trim();
  if (br && (br.length > 40 || !LETTER.test(br))) e.brand = br.length > 40 ? "Keep the brand under 40 characters" : "Use the product name, not only numbers";

  const b = (x.batch || "").trim();
  if (!b) e.batch = "Enter the batch or lot number from the vial";
  else if (b.length < 3 || b.length > 30) e.batch = "Batch number must be 3 to 30 characters";
  else if (!BATCH_RE.test(b)) e.batch = "Use letters, numbers, - and / only";

  const n = x.doseNo === "" || x.doseNo == null ? null : Number(x.doseNo), m = x.doseOf === "" || x.doseOf == null ? null : Number(x.doseOf);
  if (n !== null && (!Number.isInteger(n) || n < 1 || n > 10)) e.doseNo = "Dose number must be a whole number from 1 to 10";
  if (m !== null && (!Number.isInteger(m) || m < 1 || m > 10)) e.doseOf = "Total doses must be a whole number from 1 to 10";
  if (n !== null && m !== null && !e.doseNo && !e.doseOf && n > m) e.doseNo = "Dose number can’t be more than the total";
  if (m !== null && n === null) e.doseNo = "Enter which dose this is";

  if (x.validUntil) {
    if (isNaN(new Date(x.validUntil + "T00:00:00"))) e.validUntil = "Enter a valid date";
    else if (ctx.given && x.validUntil < ctx.given) e.validUntil = "Valid-until can’t be before the date given";
    else if (ctx.given) { const max = new Date(ctx.given + "T00:00:00"); max.setFullYear(max.getFullYear() + 5); if (new Date(x.validUntil + "T00:00:00") > max) e.validUntil = "That is more than 5 years after the shot. Check the year"; }
  }
  return e;
}


const stateOf = v => v.done ? "Completed" : dueState(v.nextDue) || "No next dose";
const daysTo = d => Math.round((new Date(d + "T00:00:00") - new Date(TODAY + "T00:00:00")) / 864e5);
const fmtDate = d => d ? new Date(d + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—";
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
/* "in 5 days", "Today", "12 days overdue" */
const rel = d => { const n = daysTo(d); return n === 0 ? "Today" : n > 0 ? `in ${plural(n, "day")}` : `${plural(-n, "day")} overdue`; };
const vetOf = v => { const n = v.vetName || (VETS.find(x => x[0] === v.vetId) || [])[1]; return n ? `${/^dr\.?\s/i.test(n) ? "" : "Dr. "}${n}${v.vetLicense ? ` · Lic. ${v.vetLicense}` : ""}` : ""; };
const tone = s => s === "Overdue" ? "er" : s === "Due soon" ? "wa" : "";

export function OwnerVacc({ db, setDb, me, go, say }) {
  const pets = scope(db, me, "pets");
  const [sel, setSel] = useState(() => (pick.petId && pets.some(p => p.id === pick.petId) ? pick.petId : pets[0] ? pets[0].id : ""));
  const [det, setDet] = useState(null), [st, setSt] = useState(""), [q, setQ] = useState(""), [tab, setTab] = useState("vacc"), [pic, setPic] = useState(false);
  useEffect(() => { pick.petId = null; }, []);
  const all = scope(db, me, "vacc").slice().sort((a, b) => b.date.localeCompare(a.date));
  const over = all.filter(v => stateOf(v) === "Overdue"), soon = all.filter(v => stateOf(v) === "Due soon");
  const p = pets.find(x => x.id === sel), o = db.owners.find(x => x.id === me.ownerId) || {};
  const mine = all.filter(v => v.petId === sel);
  const count = s => mine.filter(v => stateOf(v) === s).length;
  const next = mine.filter(v => !v.done && v.nextDue).sort((a, b) => a.nextDue.localeCompare(b.nextDue))[0];
  let list = mine;
  if (st) list = list.filter(v => stateOf(v) === st);
  if (q.trim()) list = list.filter(v => [v.vaccine, v.notes].join(" ").toLowerCase().includes(q.trim().toLowerCase()));
  const filtered = !!(st || q.trim());
  const incomplete = mine.filter(v => !v.done && completeness(v).length).length;
  const book = v => { setPrefill({ petId: v.petId, reason: v.vaccine === "Deworming" ? "Deworming" : "Vaccination" }); go("appts"); };
  const savePhoto = async photo => {   // the server checks the pet is yours and the picture is valid
    try {
      const r = await auth.petPhoto(sel, photo);
      setDb(d => ({ ...d, pets: d.pets.map(x => x.id === r.pet.id ? r.pet : x) }));
      say(photo ? "Picture saved" : "Picture removed");
    } catch (x) { say(x.offline ? OFFLINE_MSG : x.message || "We couldn’t save the picture. Please try again."); }
  };
  const badge = id => { const l = all.filter(v => v.petId === id), a = l.filter(v => stateOf(v) === "Overdue").length, b = l.filter(v => stateOf(v) === "Due soon").length; return a ? <span className="badge er">{a} overdue</span> : b ? <span className="badge">{b} due soon</span> : l.length ? <span className="badge ok">Up to date</span> : <small>No records</small>; };
  if (!pets.length) return <div className="empty"><div><Icon n="syringe" size={34} /></div>No pets on your account yet. Add your pet from the My Pets page and the clinic will link it to you.</div>;
  const nextState = next ? stateOf(next) : "";
  return (<>
    {over.length > 0 && <div className="ow-banner"><span><b>{over.length} overdue:</b> {over.map(v => `${petName(db, v.petId)} (${v.vaccine})`).join(", ")}</span><button className="btn sm" onClick={() => book(over[0])}>Book a visit</button></div>}
    {soon.length > 0 && <div className="ow-banner wa"><span><b>{soon.length} due within 14 days:</b> {soon.map(v => `${petName(db, v.petId)} (${v.vaccine})`).join(", ")}</span><button className="btn sm" onClick={() => book(soon[0])}>Book a visit</button></div>}
    <div className="ow-split">
      <div className="ow-petlist" role="listbox" aria-label="Choose a pet">{pets.map(x => <button key={x.id} role="option" aria-selected={x.id === sel} className={`ow-sq${x.id === sel ? " on" : ""}`} onClick={() => { setSel(x.id); setSt(""); setQ(""); setPic(false); }}>
        <Avatar src={x.photo} fallback={<Icon n="paw" size={28} />} size={56} /><b>{x.name}</b><small>{x.species}</small>{badge(x.id)}</button>)}</div>
      {p && <section className="ow-vc" aria-label={`${p.name}’s vaccination card`}>
        <div className="vc-only-print vc-letter">
          <div className="vc-lh"><b>{CLINIC.name}</b>{[CLINIC.address, CLINIC.phone, CLINIC.email].filter(Boolean).map(x => <span key={x}>{x}</span>)}</div>
          <h2>Pet Vaccination Card</h2>
          <dl className="vc-id">{[["Pet", p.name], ["Kind", p.species], ["Breed", p.breed], ["Sex", p.sex], ["Birth date", p.birth ? fmtDate(p.birth) : ""], ["Weight", p.weight != null ? `${p.weight} kg` : ""], ["Color", p.color], ["Spayed / neutered", p.neutered], ["Microchip / tag", p.microchip], ["Allergies", (p.allergies || []).join(", ")], ["Owner", o.name || me.name], ["Phone", o.phone], ["Address", o.address]].filter(([, x]) => x).map(([k, x]) => <div key={k}><dt>{k}</dt><dd>{x}</dd></div>)}</dl>
        </div>
        <div className="ow-vch">
          <div className="vc-ava">
            <Avatar src={p.photo} fallback={<Icon n="paw" size={32} />} size={72} />
            <button type="button" className="vc-cam vc-noprint" onClick={() => setPic(x => !x)} aria-expanded={pic} aria-label={`Change ${p.name}’s picture`} title="Change picture"><Icon n="camera" size={14} /></button>
          </div>
          <div>
            <h3>{p.name}</h3>
            <p>{p.breed || p.species} · {p.sex} · {p.weight} kg{p.birth ? ` · ${petAge(p.birth)}` : ""}</p>
            <p>Owner: {o.name || me.name}</p>
            {(p.allergies || []).length > 0 && <p className="vc-allergy"><Icon n="alert" size={14} /> Allergic to {p.allergies.join(", ")}</p>}
          </div>
          <button className="btn gold sm vc-noprint vc-print" onClick={() => window.print()}><Icon n="print" size={15} /> Print card</button>
        </div>
        {pic && <div className="vc-pic vc-noprint"><PhotoUpload src={p.photo} fallback={<Icon n="paw" size={30} />} size={56} label="Add picture" onSave={savePhoto} onRemove={() => savePhoto("")} /></div>}
        <div className="vc-sum" aria-label="Vaccine summary">
          <div className={`vc-next ${tone(nextState)}`}>
            <small>Next dose</small>
            {next ? <><b>{next.vaccine}</b><span>{fmtDate(next.nextDue)} · <i className={tone(nextState)}>{rel(next.nextDue)}</i></span>
              {tone(nextState) && <button className="btn sm vc-noprint" onClick={() => book(next)}>Book a visit</button>}</>
              : <><b>None scheduled</b><span>{mine.length ? "No dose is waiting right now" : "Records appear after the clinic vaccinates"}</span></>}
          </div>
          <div className="vc-t"><b>{mine.length}</b><span>Records</span></div>
          <div className={`vc-t${count("On track") ? " ok" : ""}`}><b>{count("On track")}</b><span>On track</span></div>
          <div className={`vc-t${count("Due soon") ? " wa" : ""}`}><b>{count("Due soon")}</b><span>Due soon</span></div>
          <div className={`vc-t${count("Overdue") ? " er" : ""}`}><b>{count("Overdue")}</b><span>Overdue</span></div>
        </div>
        <div className="ow-tabs vc-noprint" role="tablist" aria-label={`${p.name} sections`}>
          <button role="tab" aria-selected={tab === "vacc"} className={tab === "vacc" ? "on" : ""} onClick={() => setTab("vacc")}>Vaccinations</button>
          <button role="tab" aria-selected={tab === "med"} className={tab === "med" ? "on" : ""} onClick={() => setTab("med")}>Medical profile</button>
        </div>
        <div className="ow-vcb">
          {tab === "med" ? <MedProfile key={p.id} p={p} db={db} setDb={setDb} me={me} say={say} /> : <>
            {incomplete > 0 && <p className="ow-note vc-noprint">{incomplete} record{incomplete > 1 ? "s don’t" : " doesn’t"} list the veterinarian or batch number yet. Ask the clinic to complete {incomplete > 1 ? "them" : "it"} before you use this card as proof of vaccination.</p>}
            <div className="vc-bar vc-noprint">
              <div><label className="ow-lbl" htmlFor="vc-st">Status</label><select id="vc-st" value={st} onChange={e => setSt(e.target.value)}><option value="">Any status</option>{["Overdue", "Due soon", "On track", "Completed"].map(s => <option key={s}>{s}</option>)}</select></div>
              <div><label className="ow-lbl" htmlFor="vc-q">Search</label><div className="vc-search"><Icon n="search" size={16} /><input id="vc-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Vaccine name or notes" /></div></div>
              {filtered && <button className="btn ghost sm" onClick={() => { setSt(""); setQ(""); }}>Clear filters</button>}
            </div>
            <p className="vc-count" aria-live="polite">{filtered ? `${list.length} of ${mine.length} records` : `${plural(mine.length, "record")}`}</p>
            {list.length > 0 && <p className="ow-hint vc-noprint">Double-click a record to see its details. On a phone, tap it.</p>}
            {list.length ? <div className="tw"><table className="vc-tbl"><thead><tr><th>Vaccine</th><th>Date given</th><th>Next dose</th><th>Status</th><th>Notes</th><th /></tr></thead><tbody>{list.map(v => {
              const s = stateOf(v), t = tone(s);
              return <tr key={v.id} className={`vc-r ${t}`} tabIndex={0} style={{ cursor: "pointer" }} title="Double-click to see details" onDoubleClick={() => setDet(v)} onClick={() => { if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) setDet(v); }} onMouseDown={e => { if (e.detail > 1) e.preventDefault(); }} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDet(v); } }}>
                <td data-label="Vaccine"><span>{v.vaccine}{doseLabel(v) && <em className="vc-dose">{doseLabel(v)}</em>}{(v.brand || v.batch) && <small className="vc-rel">{[v.brand, v.batch && `Lot ${v.batch}`].filter(Boolean).join(" · ")}</small>}</span></td>
                <td data-label="Date given"><span>{fmtDate(v.date)}{vetOf(v) && <small className="vc-rel">{vetOf(v)}</small>}</span></td>
                <td data-label="Next dose"><span>{v.nextDue ? fmtDate(v.nextDue) : "—"}{v.nextDue && !v.done && <small className={`vc-rel ${t}`}>{rel(v.nextDue)}</small>}{v.validUntil && v.validUntil !== v.nextDue && <small className="vc-rel">Valid until {fmtDate(v.validUntil)}</small>}</span></td>
                <td data-label="Status"><span>{s === "No next dose" ? "—" : <Badge v={s} />}{v.done && <small className="vc-rel">Replaced by a newer dose</small>}</span></td>
                <td data-label="Notes">{v.notes || "—"}</td>
                <td className="act vc-noprint">{(s === "Overdue" || s === "Due soon") && <button className="btn sm" onClick={e => { e.stopPropagation(); book(v); }}>Book</button>}</td>
              </tr>;
            })}</tbody></table></div> : <div className="empty sm">{mine.length ? "No records match these filters." : `No vaccine records for ${p.name} yet. They appear here after the clinic vaccinates.`}</div>}
          </>}
          {tab === "vacc" && <div className="vc-only-print vc-sign"><div><span /><small>Veterinarian’s signature and license no.</small></div><div><span /><small>Clinic stamp</small></div><p>Printed on {fmtDate(TODAY)}</p></div>}
        </div>
      </section>}
    </div>
    {det && <Modal title={`${det.vaccine}${doseLabel(det) ? ` · ${doseLabel(det)}` : ""}`} onClose={() => setDet(null)}>
      <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
        <p style={{ margin: "0 0 12px" }}>{stateOf(det) === "No next dose" ? null : <Badge v={stateOf(det)} />}{det.done && <small className="vc-rel">Replaced by a newer dose</small>}</p>
        <dl style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, margin: 0 }}>
          {[["Pet", petName(db, det.petId)], ["Date given", fmtDate(det.date)], ["Given by", vetOf(det)], ["Brand", det.brand], ["Batch / lot", det.batch], ["Next dose", det.nextDue ? `${fmtDate(det.nextDue)}${!det.done ? ` · ${rel(det.nextDue)}` : ""}` : ""], ["Valid until", det.validUntil ? fmtDate(det.validUntil) : ""], ["Notes", det.notes]].filter(([, x]) => x).map(([k, x]) =>
            <div key={k}><dt style={{ fontSize: 12.5, fontWeight: 700, color: "var(--mu)" }}>{k}</dt><dd style={{ margin: "2px 0 0", overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{x}</dd></div>)}
        </dl>
        {completeness(det).length > 0 && <p className="ow-note" style={{ marginTop: 12 }}>The {completeness(det).join(" and ")} {completeness(det).length > 1 ? "aren’t" : "isn’t"} recorded yet. Ask the clinic to complete this record.</p>}
      </div>
      <div className="row end" style={{ marginTop: 14 }}>
        {(stateOf(det) === "Overdue" || stateOf(det) === "Due soon") && <button className="btn ghost" onClick={() => { const v = det; setDet(null); book(v); }}>Book a visit</button>}
        <button className="btn" onClick={() => setDet(null)}>Close</button>
      </div>
    </Modal>}
  </>);
}