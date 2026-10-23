import { I, M, Stats, Hero, scope, TODAY, plus, moveAppt, petName, ICON, Badge, dueState } from "../lib.jsx";
function Dash({ db, setDb, me, go, say }) {
  const vid = me.vetId || "v1", queue = db.appts.filter(a => a.vetId === vid && a.date === TODAY && a.status !== "Cancelled").sort((a, b) => a.time.localeCompare(b.time));
  const due = db.vacc.filter(v => v.nextDue && !v.done && v.nextDue <= plus(14));
  return (<>
    <Hero title={`Good day, ${me.name}`} text={`${queue.filter(a => a.status !== "Completed").length} patient(s) still waiting on you today.`} emoji="🩺🐶"><button className="btn gold" onClick={() => go("records")}>Write a consultation</button></Hero>
    <Stats items={[["🩺", queue.length, "Patients today"], ["✅", queue.filter(a => a.status === "Completed").length, "Seen so far"], ["💉", due.length, "Vaccines due soon"], ["📋", db.records.filter(r => r.vetId === vid).length, "My consultations"]]} />
    <section className="card"><h3>My patient queue</h3>{queue.length ? queue.map(a => { const p = db.pets.find(x => x.id === a.petId) || {}; return <div className="li" key={a.id}><b>{a.time}</b><div><I e={ICON[p.species]} size={16} /> {p.name}<small>{p.breed} · {a.reason}</small></div><Badge v={a.status} />{a.status === "Checked-in" && <button className="btn sm" onClick={() => { moveAppt(setDb, a.id, "In consultation", me); go("appts"); }}>Start consultation</button>}{a.status === "In consultation" && <button className="btn sm" onClick={() => go("appts")}>Write consultation</button>}</div>; }) : <div className="empty sm">No patients scheduled today.</div>}</section>
  </>);
}
export const vet = { portal: "Veterinarian Desk", Dash, menu: [{ k: "home", l: "My Day", i: "🩺", dash: 1, sub: "Your patient queue for today." }, M("pets", "Patients", "🐾", "pets", "Pet profiles and health details."), M("owners", "Owners", "👤", "owners", "Owner contact details (view only)."), M("appts", "Appointments", "📅", "appts"), M("records", "Consultations", "📋", "records", "Record diagnoses, treatments and prescriptions."), M("vacc", "Vaccinations", "💉", "vacc"), { k: "reports", l: "Reports", i: "📊", rep: 1, sub: "Filter and print clinic summaries." }] };
