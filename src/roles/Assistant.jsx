import { M, Stats, Hero, TODAY, plus, moveAppt, petName, ownerName, Badge, dueState } from "../lib.jsx";
function Dash({ db, setDb, me, go, say }) {
  const q = db.appts.filter(a => a.date === TODAY && a.status !== "Cancelled").sort((a, b) => a.time.localeCompare(b.time));
  const calls = db.vacc.filter(v => v.nextDue && !v.done && v.nextDue <= plus(14));
  return (<>
    <Hero title="Front desk" text="Check patients in, book visits and remind owners about vaccines." emoji="🛎️🐱"><div className="row"><button className="btn gold" onClick={() => go("appts")}>Book appointment</button><button className="btn ghost" onClick={() => go("owners")}>Register owner</button></div></Hero>
    <Stats items={[["📅", q.length, "Visits today"], ["🛎️", q.filter(a => a.status === "Checked-in").length, "Checked in"], ["📞", calls.length, "Owners to remind"]]} />
    <div className="two">
      <section className="card"><h3>Check-in list</h3>{q.length ? q.map(a => <div className="li" key={a.id}><b>{a.time}</b><div>{petName(db, a.petId)}<small>{a.reason}</small></div>{["Scheduled", "Confirmed"].includes(a.status) ? <button className="btn sm" onClick={() => { const n = a.status === "Scheduled" ? "Confirmed" : "Checked-in"; moveAppt(setDb, a.id, n, me); say(n === "Confirmed" ? "Appointment confirmed" : "Checked in"); }}>{a.status === "Scheduled" ? "Confirm" : "Check in"}</button> : <Badge v={a.status} />}</div>) : <div className="empty sm">No visits today.</div>}</section>
      <section className="card"><h3>Reminder calls</h3>{calls.length ? calls.map(v => { const p = db.pets.find(x => x.id === v.petId) || {}, o = db.owners.find(x => x.id === p.ownerId) || {}; return <div className="li" key={v.id}><b>{v.nextDue.slice(5)}</b><div>{o.name} · {p.name}<small>{v.vaccine} · {o.phone}</small></div><Badge v={dueState(v.nextDue)} /></div>; }) : <div className="empty sm">Nobody to call.</div>}</section>
    </div>
  </>);
}
export const assistant = { portal: "Front Desk", Dash, menu: [{ k: "home", l: "Front Desk", i: "🛎️", dash: 1, sub: "Today’s arrivals and reminder calls." }, M("owners", "Owners", "👤", "owners", "Register and update pet owners."), M("pets", "Pets", "🐾", "pets"), M("appts", "Appointments", "📅", "appts"), M("vacc", "Vaccinations", "💉", "vacc"), M("records", "Consultations", "📋", "records", "Read-only view of veterinary notes.")] };
