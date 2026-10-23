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
  const addBtn = (
    <button
      className="btn gold"
      disabled={!!blocked}
      title={blocked}
      onClick={() => setModal({ form: true })}
      style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontWeight: 700 }}
    >
      <Icon n="plus" size={16} /> Add my pet
    </button>
  );

  return (<>
    <div className="hero" style={{ flexDirection: "column", alignItems: "stretch", padding: "24px 28px", marginBottom: "18px" }}>
      {/* Top Header: Title on left, Add Pet Button + Icons in upper right aligned with title */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "14px", width: "100%", marginBottom: (!pets.length && !reqs.length) ? "18px" : "0px" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: "1.75rem", fontWeight: 800, color: "var(--navy)" }}>
            Hi {me.name.split(" ")[0]}!
          </h2>
          <p style={{ margin: 0, color: "#78350f", fontSize: "0.95rem" }}>
            Here’s how your pets are doing.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginLeft: "auto", flexWrap: "wrap" }}>
          {pets.length > 0 && <button className="btn gold" onClick={() => book()}>Book a visit</button>}
          {addBtn}
          <div className="pets" aria-hidden="true" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <I e="dog" size={34} />
            <I e="cat" size={34} />
          </div>
        </div>
      </div>

      {/* 3 Blue Step Cards placed inside the yellow banner */}
      {!pets.length && !reqs.length && (
        <div style={{ width: "100%", borderTop: "1px dashed rgba(120,53,15,0.25)", paddingTop: "14px" }}>
          <div style={{ marginBottom: "10px", color: "#78350f", fontSize: "0.88rem", fontWeight: 700 }}>
            Let’s set up your first pet — your account is ready:
          </div>
          <ol className="op-steps" style={{ margin: 0 }}>
            <li
              role="button"
              tabIndex={0}
              onClick={() => setModal({ form: true })}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setModal({ form: true }); } }}
              style={{ cursor: "pointer", background: "rgba(255, 255, 255, 0.88)", border: "1.5px solid rgba(147, 197, 253, 0.85)", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
              title="Click to add your pet"
            >
              <span className="op-ico"><Icon n="plus" size={20} /></span>
              <div>
                <b style={{ color: "var(--navy)" }}>1. Add your pet</b>
                <small style={{ color: "#475569" }}>Name, species, birth date and weight.</small>
              </div>
            </li>
            <li style={{ background: "rgba(255, 255, 255, 0.88)", border: "1.5px solid rgba(147, 197, 253, 0.85)", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <span className="op-ico"><Icon n="clock" size={20} /></span>
              <div>
                <b style={{ color: "var(--navy)" }}>2. The clinic reviews it</b>
                <small style={{ color: "#475569" }}>The front desk checks the details.</small>
              </div>
            </li>
            <li style={{ background: "rgba(255, 255, 255, 0.88)", border: "1.5px solid rgba(147, 197, 253, 0.85)", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <span className="op-ico"><Icon n="calendar" size={20} /></span>
              <div>
                <b style={{ color: "var(--navy)" }}>3. Book and track</b>
                <small style={{ color: "#475569" }}>Visits, vaccine cards and history unlock.</small>
              </div>
            </li>
          </ol>
        </div>
      )}
    </div>

    {over.length > 0 && <div className="ow-banner"><span><b>Vaccine overdue:</b> {over.map(v => `${petName(db, v.petId)} (${v.vaccine})`).join(", ")}</span><button className="btn sm" onClick={() => go("vacc")}>View records</button></div>}
    <RequestList db={db} setDb={setDb} me={me} say={say} onEdit={r => setModal({ form: true, editing: r })} />
    {pets.length ? <div className="petgrid">{pets.map(p => {
      const nv = V.filter(v => v.petId === p.id && v.nextDue && !v.done).sort((a, b) => a.nextDue.localeCompare(b.nextDue))[0];
      const na = A.filter(a => a.petId === p.id && LIVE.includes(a.status) && a.date >= TODAY).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
      return <article className="petcard" key={p.id} role="button" tabIndex={0} style={{ cursor: "pointer" }} aria-label={`${p.name}, open pet details`} onClick={() => setModal({ profile: p })} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setModal({ profile: p }); } }}><div className="big"><Avatar src={p.photo} fallback={<I e={ICON[p.species]} size={40} />} size={72} /></div><h3>{p.name}</h3><p>{p.breed || p.species} · {p.sex} · {p.weight} kg{p.birth ? ` · ${petAge(p.birth)}` : ""}</p>
        <div className="kv"><span>Next vaccine</span>{nv ? <b>{nv.vaccine} <Badge v={dueState(nv.nextDue)} /></b> : <b>—</b>}</div>
        <div className="kv"><span>Next visit</span><b>{na ? <>{na.date} {fmt12(na.time)} <Badge v={na.status} /></> : "None booked"}</b></div>
        <small className="ow-hint">Click to see details</small></article>;
    })}</div> : null}
    {!pets.length && reqs.length > 0 && <div className="empty sm">Your pet will appear here once the clinic approves the request.</div>}
    {modal && modal.form && <PetFormModal db={db} setDb={setDb} me={me} say={say} editing={modal.editing} onClose={() => setModal(null)} />}
    {modal && modal.profile && <PetProfileModal pet={modal.profile} db={db} me={me} onClose={() => setModal(null)} onVacc={() => { pick.petId = modal.profile.id; go("vacc"); }} onBook={(pid, rsn) => book(pid || modal.profile.id, rsn)} />}
  </>);
}
const P = (k, l, i, sub, Page) => ({ k, l, i, sub, Page });
export const owner = { portal: "Pet Owner Portal", Dash, Header: OwnerHeader, menu: [
  { k: "home", l: "My Pets", i: "paw", dash: 1, sub: "Your pets, their profiles, next vaccines and visits." },
  P("appts", "My Appointments", "calendar", "Book, change or cancel a visit. Switch between the list and the calendar.", OwnerAppts),
  P("vacc", "Vaccination Cards", "syringe", "Pick a pet to see its vaccination card.", OwnerVacc),
  P("records", "Visit History", "file", "Diagnoses and treatments from past visits.", OwnerVisits)] };