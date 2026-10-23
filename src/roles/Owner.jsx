import { useState } from "react";
import { I, Hero, ICON, Badge, dueState, scope, TODAY, petName } from "../lib.jsx";
import OwnerAppts from "./owner/Appts.jsx";
import { OwnerVacc } from "./owner/VaccCard.jsx";
import { OwnerVisits } from "./owner/Visits.jsx";
import OwnerHeader from "./owner/Header.jsx";
import { PetFormModal, PetProfileModal, RequestList, myRequests, addBlock } from "./owner/Pets.jsx";
import { setPrefill, petAge, fmt12, Avatar, pick, Icon } from "./owner/ui.jsx";
import "./owner/owner.css";

const LIVE = ["Scheduled", "Confirmed", "Checked-in", "In consultation"];
function Dash({ db, setDb, me, go, say }) {
  const [modal, setModal] = useState(null);   // { form, editing } or { profile }
  const pets = scope(db, me, "pets"), A = scope(db, me, "appts"), V = scope(db, me, "vacc"), reqs = myRequests(db, me);
  const blocked = addBlock(db, me);
  const book = (petId, reason) => { setPrefill(petId ? { petId, reason } : null); go("appts"); };
  const over = V.filter(v => !v.done && v.nextDue && v.nextDue < TODAY);
  const addBtn = <button className="btn gold" disabled={!!blocked} title={blocked} onClick={() => setModal({ form: true })}><Icon n="plus" size={16} /> Add my pet</button>;
  return (<>
    <Hero title={`Hi ${me.name.split(" ")[0]}!`} text="Here’s how your pets are doing." emoji="🐶🐱">
      <div className="row">
        {pets.length ? <button className="btn gold" onClick={() => book()}>Book a visit</button> : null}
        {pets.length ? <button className="btn ghost" disabled={!!blocked} title={blocked} onClick={() => setModal({ form: true })}><Icon n="plus" size={16} /> Add a pet</button> : null}
      </div>
    </Hero>
    {over.length > 0 && <div className="ow-banner"><span><b>Vaccine overdue:</b> {over.map(v => `${petName(db, v.petId)} (${v.vaccine})`).join(", ")}</span><button className="btn sm" onClick={() => go("vacc")}>View records</button></div>}
    <RequestList db={db} setDb={setDb} me={me} say={say} onEdit={r => setModal({ form: true, editing: r })} />
    {pets.length ? <div className="petgrid">{pets.map(p => {
      const nv = V.filter(v => v.petId === p.id && v.nextDue && !v.done).sort((a, b) => a.nextDue.localeCompare(b.nextDue))[0];
      const na = A.filter(a => a.petId === p.id && LIVE.includes(a.status) && a.date >= TODAY).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
      return <article className="petcard" key={p.id} role="button" tabIndex={0} style={{ cursor: "pointer" }} aria-label={`${p.name}, open pet details`} onClick={() => setModal({ profile: p })} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setModal({ profile: p }); } }}><div className="big"><Avatar src={p.photo} fallback={<I e={ICON[p.species]} size={40} />} size={72} /></div><h3>{p.name}</h3><p>{p.breed || p.species} · {p.sex} · {p.weight} kg{p.birth ? ` · ${petAge(p.birth)}` : ""}</p>
        <div className="kv"><span>Next vaccine</span>{nv ? <b>{nv.vaccine} <Badge v={dueState(nv.nextDue)} /></b> : <b>—</b>}</div>
        <div className="kv"><span>Next visit</span><b>{na ? <>{na.date} {fmt12(na.time)} <Badge v={na.status} /></> : "None booked"}</b></div>
        <small className="ow-hint">Click to see details</small></article>;
    })}</div> : !reqs.length && <section className="op-start">
      <h3>Let’s set up your first pet</h3>
      <p>Your account is ready. Add your pet so the clinic can link it to you.</p>
      <ol className="op-steps">
        <li><span className="op-ico"><Icon n="plus" size={20} /></span><div><b>Add your pet</b><small>Name, kind, birth date and weight.</small></div></li>
        <li><span className="op-ico"><Icon n="clock" size={20} /></span><div><b>The clinic reviews it</b><small>The front desk checks the details.</small></div></li>
        <li><span className="op-ico"><Icon n="calendar" size={20} /></span><div><b>Book and track</b><small>Visits, vaccine cards and history unlock.</small></div></li>
      </ol>
      {addBtn}
    </section>}
    {!pets.length && reqs.length > 0 && <div className="empty sm">Your pet will appear here once the clinic approves the request.</div>}
    {modal && modal.form && <PetFormModal db={db} setDb={setDb} me={me} say={say} editing={modal.editing} onClose={() => setModal(null)} />}
    {modal && modal.profile && <PetProfileModal pet={modal.profile} db={db} me={me} onClose={() => setModal(null)} onVacc={() => { pick.petId = modal.profile.id; go("vacc"); }} onBook={() => book(modal.profile.id)} />}
  </>);
}
const P = (k, l, i, sub, Page) => ({ k, l, i, sub, Page });
export const owner = { portal: "Pet Owner Portal", Dash, Header: OwnerHeader, menu: [
  { k: "home", l: "My Pets", i: "🐾", dash: 1, sub: "Your pets, their profiles, next vaccines and visits." },
  P("appts", "My Appointments", "📅", "Book, change or cancel a visit. Switch between the list and the calendar.", OwnerAppts),
  P("vacc", "Vaccination Cards", "💉", "Pick a pet to see its vaccination card.", OwnerVacc),
  P("records", "Visit History", "📋", "Diagnoses and treatments from past visits.", OwnerVisits)] };