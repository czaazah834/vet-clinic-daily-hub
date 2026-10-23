import { M, by, Stats, Hero, scope, TODAY, plus } from "../lib.jsx";
function Bars({ title, data }) {
  const max = Math.max(1, ...Object.values(data));
  return <section className="card"><h3>{title}</h3>{Object.entries(data).map(([k, n]) => <div className="bar2" key={k}><span>{k}</span><i style={{ width: `${n / max * 100}%` }} /><b>{n}</b></div>)}</section>;
}
function Dash({ db, me, go }) {
  return (<>
    <Hero title={`Welcome back, ${me.name}`} text="You oversee every record, schedule and login in the clinic." emoji="🏥🐾" ><button className="btn gold" onClick={() => go("users")}>Manage accounts</button></Hero>
    <Stats items={[["👤", db.owners.length, "Owners"], ["🐾", db.pets.length, "Pets"], ["🔐", db.users.length, "User accounts"], ["📅", db.appts.filter(a => a.date === TODAY).length, "Appointments today"], ["⚠️", db.vacc.filter(v => v.nextDue && !v.done && v.nextDue < TODAY).length, "Overdue vaccines"], ["📋", db.records.length, "Consultations on file"]]} />
    <div className="two"><Bars title="Appointments by status" data={by(db.appts, "status")} /><Bars title="Accounts by role" data={by(db.users, "role")} /></div>
    <section className="card"><h3>Recent activity</h3>{(db.log || []).length ? db.log.slice(0, 8).map(l => <div className="li" key={l.id}><b>{l.at.split(", ")[1] || l.at}</b><div>{l.msg}<small>{l.by}</small></div></div>) : <div className="empty sm">Activity appears here as the team works.</div>}</section>
  </>);
}
export const admin = { portal: "Admin Console", Dash, menu: [{ k: "home", l: "Overview", i: "🏠", dash: 1, sub: "Clinic-wide numbers and account activity." }, M("owners", "Owners", "👤", "owners"), M("pets", "Pets", "🐾", "pets"), M("appts", "Appointments", "📅", "appts"), M("vacc", "Vaccinations", "💉", "vacc"), M("records", "Consultations", "📋", "records", "Read-only view of veterinary notes."), { k: "reports", l: "Reports", i: "📊", rep: 1, sub: "Filter and print clinic summaries." }, M("users", "User Accounts", "🔐", "users")] };
