import { useState } from "react";
import {
  House,
  User,
  PawPrint,
  CalendarDays,
  Syringe,
  ClipboardList,
  ChartColumn,
  ShieldCheck,
  Hospital,
  Stethoscope,
  ConciergeBell,
  Dog,
  Cat,
  Rabbit,
  Bird,
  TriangleAlert,
  CircleCheck,
  CalendarClock,
  Phone,
  Thermometer,
  Scale,
  Clock,
  Sparkles,
  Flame,
} from "lucide-react";

const MAP = {
  // Lucide icon components directly supported
  home: House,
  user: User,
  paw: PawPrint,
  calendar: CalendarDays,
  cal: CalendarDays,
  syringe: Syringe,
  vacc: Syringe,
  file: ClipboardList,
  records: ClipboardList,
  chart: ChartColumn,
  reports: ChartColumn,
  shield: ShieldCheck,
  admin: ShieldCheck,
  hospital: Hospital,
  clinic: Hospital,
  stethoscope: Stethoscope,
  vet: Stethoscope,
  bell: ConciergeBell,
  assistant: ConciergeBell,
  dog: Dog,
  cat: Cat,
  rabbit: Rabbit,
  bird: Bird,
  alert: TriangleAlert,
  check: CircleCheck,
  clock: Clock,
  phone: Phone,
  thermometer: Thermometer,
  scale: Scale,
  sparkles: Sparkles,
  flame: Flame,
  // Emoji string keys backward compatibility (maps to real Lucide SVG)
  "🏠": House, "👤": User, "🐾": PawPrint, "📅": CalendarDays, "💉": Syringe,
  "📋": ClipboardList, "📊": ChartColumn, "🔐": ShieldCheck, "🏥": Hospital,
  "🩺": Stethoscope, "🛎": ConciergeBell, "🐶": Dog, "🐱": Cat, "🐰": Rabbit,
  "🐦": Bird, "⚠": TriangleAlert, "✅": CircleCheck, "🗓": CalendarClock, "📞": Phone,
};

export function I({ e, size = 20, color }) {
  if (typeof e === "function") {
    const Component = e;
    return <Component size={size} color={color} strokeWidth={2} aria-hidden="true" />;
  }
  const cleanKey = String(e || "").replace(/\uFE0F/g, "").toLowerCase();
  const C = MAP[cleanKey] || MAP[String(e || "").replace(/\uFE0F/g, "")] || PawPrint;
  return <C size={size} color={color} strokeWidth={2} aria-hidden="true" />;
}
/* ---------- helpers & mock data (in memory only, no backend) ---------- */
export const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const plus = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
export const TODAY = plus(0);
export const uid = () => Math.random().toString(36).slice(2, 9);
export const VETS = [["v1", "Dr. Ana Cruz"], ["v2", "Dr. Ben Lim"]];
export const ICON = { Dog: "🐶", Cat: "🐱", Bird: "🐦", Rabbit: "🐰", Other: "🐾" };
export const ROLES = { admin: ["Clinic Administrator", "Full access to every record"], vet: ["Veterinarian", "Consultations, vaccines, appointments"], assistant: ["Vet Assistant", "Front desk: owners, pets, bookings"], owner: ["Pet Owner", "Your pets, visits and vaccines"] };
export const SEED = {
  owners: [{ id: "o1", name: "Maria Santos", email: "maria@example.com", phone: "09171234567", address: "Caloocan City" }, { id: "o2", name: "Jose Reyes", email: "jose@example.com", phone: "09189876543", address: "Quezon City" }],
  pets: [{ id: "p1", ownerId: "o1", name: "Bantay", species: "Dog", breed: "Aspin", sex: "Male", birth: "2022-03-14", weight: 14.5, allergies: ["Chicken"], notes: "Afraid of loud noises, especially fireworks and thunder.", weights: [{ date: plus(-200), kg: 13.2, by: "clinic" }, { date: plus(-100), kg: 14, by: "clinic" }, { date: plus(-20), kg: 14.5, by: "clinic" }] }, { id: "p2", ownerId: "o1", name: "Mingming", species: "Cat", breed: "Puspin", sex: "Female", birth: "2023-06-01", weight: 4.2, allergies: [], notes: "Hides when she meets new people. Please keep her carrier covered.", weights: [{ date: plus(-120), kg: 3.9, by: "clinic" }, { date: plus(-30), kg: 4.2, by: "clinic" }] }, { id: "p3", ownerId: "o2", name: "Choco", species: "Dog", breed: "Shih Tzu", sex: "Male", birth: "2021-11-20", weight: 6.8, allergies: ["Penicillin", "Flea bites"], notes: "", weights: [{ date: plus(-90), kg: 6.8, by: "clinic" }] }],
  appts: [{ id: "a1", petId: "p1", vetId: "v1", date: TODAY, time: "09:00", reason: "Annual check-up", status: "Confirmed", billingStatus: "Unbilled", amount: 650 }, { id: "a2", petId: "p3", vetId: "v1", date: TODAY, time: "10:30", reason: "Rabies booster", status: "Scheduled", billingStatus: "Unbilled", amount: 500 }, { id: "a3", petId: "p2", vetId: "v2", date: plus(2), time: "14:00", reason: "Deworming", status: "Scheduled", billingStatus: "Unbilled", amount: 350 }],
  vacc: [{ id: "v1", petId: "p1", vaccine: "Anti-rabies", brand: "Defensor 3", batch: "DEF-2025-09", date: plus(-350), nextDue: plus(15), notes: "" }, { id: "v2", petId: "p3", vaccine: "5-in-1", brand: "Vanguard Plus 5", batch: "VAN-2025-11", date: plus(-380), nextDue: plus(-15), notes: "" }],
  records: [{ id: "r1", petId: "p1", vetId: "v1", date: plus(-30), symptoms: "Excessive itching and ear scratching for 3 days", objective: "Temp: 38.6°C, Wt: 14.5 kg. Mild ventral erythema.", diagnosis: "Mild skin allergy", treatment: "Medicated hypoallergenic shampoo twice weekly", prescription: "Cetirizine 5 mg daily for 7 days" }],
  petRequests: [
    {
      id: "req1",
      ownerId: "o1",
      name: "Luna",
      species: "Dog",
      breed: "Golden Retriever",
      sex: "Female",
      birth: plus(-90), // ~3-month-old puppy
      weight: 8.5,
      neutered: "No",
      color: "Golden Cream",
      notes: "Newly adopted puppy. Needs initial vaccine schedule and digital card.",
      requestedAt: TODAY,
      status: "Pending",
      declineReason: "",
    },
  ],
};

/* ---------- validation ---------- */
export const PH = /^(09|\+639)\d{9}$/, NM = /^[A-Za-zÀ-ÿ.'\- ]+$/;
export function checkField(f, raw) {
  const v = String(raw ?? "").trim();
  if (f.req && !v) return `${f.l} is required`;
  if (!v) return "";
  if (f.min && v.length < f.min) return `Use at least ${f.min} characters`;
  if (f.max && v.length > f.max) return `Keep it under ${f.max} characters`;
  if (f.t === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return "Enter a valid email address";
  if (f.pat && !f.pat.test(v)) return f.msg;
  if (f.t === "number" && (isNaN(+v) || +v < f.lo || +v > f.hi)) return `Enter a number from ${f.lo} to ${f.hi}`;
  return "";
}
export const petOpts = (db, me) => scope(db, me, "pets").map(p => [p.id, `${p.name} (${ownerName(db, p.ownerId)})`]);
export const ownerName = (db, id) => (db.owners.find(o => o.id === id) || {}).name || "—";
export const petName = (db, id) => (db.pets.find(p => p.id === id) || {}).name || "—";

/* ---------- entity config ---------- */
export const E = {
  owners: { title: "Pet Owners", sub: "Keep owner contact details in one place.", one: "owner", cols: ["name", "email", "phone", "address"], perm: { admin: "crud", vet: "r", assistant: "cru" },
    f: [{ k: "name", l: "Full name", req: 1, min: 2, max: 60, pat: NM, msg: "Letters, spaces, . ' - only" }, { k: "email", l: "Email", t: "email", req: 1 }, { k: "phone", l: "Mobile number", t: "tel", req: 1, pat: PH, msg: "Use 09XXXXXXXXX or +639XXXXXXXXX" }, { k: "address", l: "Address", req: 1, min: 5, max: 120 }],
    chk: (d, id, db) => db.owners.some(o => o.id !== id && o.email.toLowerCase() === d.email.toLowerCase()) ? { email: "Another owner already uses this email" } : {} },
  pets: { title: "Pets", sub: "Every furry, feathery and fluffy patient.", one: "pet", cols: ["name", "ownerId", "species", "breed", "weight"], perm: { admin: "crud", vet: "cru", assistant: "cru", owner: "r" },
    f: [{ k: "ownerId", l: "Owner", t: "select", o: db => db.owners.map(o => [o.id, o.name]), req: 1 }, { k: "name", l: "Pet name", req: 1, max: 40 }, { k: "species", l: "Species", t: "select", o: () => Object.keys(ICON), req: 1 }, { k: "breed", l: "Breed", max: 40 }, { k: "sex", l: "Sex", t: "select", o: () => ["Male", "Female"], req: 1 }, { k: "birth", l: "Birth date", t: "date", req: 1 }, { k: "weight", l: "Weight (kg)", t: "number", lo: 0.1, hi: 120, req: 1 }],
    chk: (d, id, db) => { const e = {}; if (d.birth > TODAY) e.birth = "Birth date can’t be in the future"; if (db.pets.some(p => p.id !== id && p.ownerId === d.ownerId && p.name.toLowerCase() === d.name.trim().toLowerCase())) e.name = "This owner already has a pet with that name"; return e; } },
  appts: { title: "Appointments", sub: "Schedule, update and track clinic visits.", one: "appointment", cols: ["date", "time", "petId", "vetId", "reason", "status"], perm: { admin: "crud", vet: "cru", assistant: "cru", owner: "cru" }, sort: (a, b) => (a.date + a.time).localeCompare(b.date + b.time), def: { status: "Scheduled" },
    f: [{ k: "petId", l: "Pet", t: "select", o: petOpts, req: 1 }, { k: "vetId", l: "Veterinarian", t: "select", o: () => VETS, req: 1 }, { k: "date", l: "Date", t: "date", req: 1 }, { k: "time", l: "Time (08:00–17:00)", t: "time", req: 1 }, { k: "reason", l: "Reason for visit", t: "textarea", req: 1, min: 3, max: 200 }],
    chk: (d, id, db) => { const e = {}, live = !["Cancelled", "Completed"].includes(d.status), old = db.appts.find(a => a.id === id);
      if (live && d.date < TODAY && (!old || old.date !== d.date)) e.date = "Date can’t be in the past";
      if (d.time < "08:00" || d.time > "17:00") e.time = "Clinic hours are 08:00–17:00";
      else if (live && db.appts.some(a => a.id !== id && a.vetId === d.vetId && a.date === d.date && a.time === d.time && a.status !== "Cancelled")) e.time = "This veterinarian is already booked then";
      return e; } },
  vacc: { title: "Vaccinations", sub: "History and upcoming shots for every pet.", one: "vaccination", cols: ["petId", "vaccine", "brand", "batch", "date", "nextDue", "_due"], perm: { admin: "crud", vet: "crud", assistant: "cru", owner: "r" }, sort: (a, b) => b.date.localeCompare(a.date),
    f: [{ k: "petId", l: "Pet", t: "select", o: petOpts, req: 1 }, { k: "vaccine", l: "Vaccine", t: "select", o: () => ["Anti-rabies", "5-in-1", "Kennel cough", "Feline 4-in-1", "Deworming", "Other"], req: 1 }, { k: "brand", l: "Brand", max: 40 }, { k: "batch", l: "Batch / Lot #", max: 40 }, { k: "date", l: "Date given", t: "date", req: 1 }, { k: "nextDue", l: "Next dose due (auto-calculated, editable)", t: "date" }, { k: "notes", l: "Notes", t: "textarea", max: 200 }],
    chk: d => { const e = {}; if (d.date > TODAY) e.date = "Date given can’t be in the future"; if (d.nextDue && d.nextDue <= d.date) e.nextDue = "Next dose must be after the date given"; return e; } },
  records: { title: "Consultations", sub: "SOAP veterinary notes, diagnoses and treatments.", one: "consultation", cols: ["date", "petId", "vetId", "diagnosis", "treatment"], perm: { admin: "r", vet: "crud", assistant: "r", owner: "r" }, sort: (a, b) => b.date.localeCompare(a.date),
    f: [{ k: "petId", l: "Pet", t: "select", o: petOpts, req: 1 }, { k: "date", l: "Consultation date", t: "date", req: 1 }, { k: "symptoms", l: "Subjective: Symptoms & History", t: "textarea", max: 300 }, { k: "objective", l: "Objective: Exam & Vitals", t: "textarea", max: 300 }, { k: "diagnosis", l: "Assessment: Diagnosis", t: "textarea", req: 1, min: 3, max: 300 }, { k: "treatment", l: "Plan: Treatment & Procedures", t: "textarea", req: 1, min: 3, max: 300 }, { k: "prescription", l: "Prescription & Home Care", t: "textarea", max: 300 }],
    chk: d => d.date > TODAY ? { date: "Date can’t be in the future" } : {} },
};
export const LAB = { ownerId: "Owner", petId: "Pet", vetId: "Veterinarian", nextDue: "Next dose", _due: "Status", brand: "Brand", batch: "Batch #", symptoms: "Subjective", objective: "Objective", diagnosis: "Assessment", treatment: "Plan", prescription: "Prescription", billingStatus: "Billing", amount: "Amount (₱)" };
export const NAV = [["dashboard", "Dashboard", "🏠"], ["owners", "Owners", "👤"], ["pets", "Pets", "🐾"], ["appts", "Appointments", "📅"], ["vacc", "Vaccinations", "💉"], ["records", "Consultations", "📋"], ["reports", "Reports", "📊"]];
export const HIDE = { owner: ["owners"] };
export const can = (ent, me, a) => (E[ent].perm[me.role] || "").includes(a);
export const dueState = n => !n ? "" : n < TODAY ? "Overdue" : n <= plus(14) ? "Due soon" : "On track";
export function scope(db, me, ent) {
  if (me.role !== "owner") return db[ent];
  const ps = db.pets.filter(p => p.ownerId === me.ownerId).map(p => p.id);
  return ent === "pets" ? db.pets.filter(p => p.ownerId === me.ownerId) : ["appts", "vacc", "records"].includes(ent) ? db[ent].filter(x => ps.includes(x.petId)) : db[ent];
}
export function cellText(db, x, k) {
  if (k === "ownerId") return ownerName(db, x.ownerId);
  if (k === "petId") return petName(db, x.petId);
  if (k === "vetId") return (VETS.find(v => v[0] === x.vetId) || [])[1] || "—";
  if (k === "_due") return x.done ? "Completed" : dueState(x.nextDue);
  if (k === "role") return ROLES[x.role][0];
  return x[k] ?? "";
}

/* ---------- small UI pieces ---------- */
export function Logo({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="PawCare logo">
      <circle cx="24" cy="24" r="23" fill="#FFE28A" stroke="#1E3A8A" strokeWidth="2" />
      <g fill="#1E3A8A"><ellipse cx="11.5" cy="22" rx="3.6" ry="4.6" /><ellipse cx="19" cy="13" rx="3.8" ry="5" /><ellipse cx="29" cy="13" rx="3.8" ry="5" /><ellipse cx="36.5" cy="22" rx="3.6" ry="4.6" /><path d="M24 22c-7 0-12 5-12 9.5 0 3 2.5 4.5 5.5 4.5 2.5 0 4-1 6.5-1s4 1 6.5 1c3 0 5.5-1.5 5.5-4.5C36 27 31 22 24 22z" /></g>
      <path d="M22.5 26h3v3h3v3h-3v3h-3v-3h-3v-3h3z" fill="#FFE28A" />
    </svg>
  );
}
export function Badge({ v }) {
  const c = { Completed: "ok", Confirmed: "ok", "On track": "ok", Cancelled: "er", "No-show": "er", Overdue: "er", "Due soon": "wa" }[v] || "wa";
  return v ? <span className={`badge ${c}`}>{v}</span> : "—";
}
export function Cell({ db, x, k }) {
  const t = cellText(db, x, k);
  if (k === "status" || k === "_due") return <Badge v={t} />;
  if (k === "name" && x.species) return <span className="who"><span className="av"><I e={ICON[x.species]} size={16} /></span>{t}</span>;
  return t === "" ? "—" : t;
}
export function Table({ db, ent, list, acts, me, onEdit, onDel, onMove }) {
  const c = E[ent], showActs = acts && (can(ent, me, "u") || can(ent, me, "d"));
  if (!list.length) return <div className="empty"><div><I e="🐾" size={34} /></div>No {c.title.toLowerCase()} found yet.</div>;
  return (
    <div className="tw"><table><thead><tr>{c.cols.map(k => <th key={k}>{LAB[k] || (c.f.find(f => f.k === k) || {}).l || k}</th>)}{showActs && <th />}</tr></thead>
      <tbody>{list.map(x => (
        <tr key={x.id}>{c.cols.map(k => <td key={k}><Cell db={db} x={x} k={k} /></td>)}
          {showActs && <td className="act">{ent === "appts" && onMove && (me.role === "vet" && x.status === "In consultation" ? <button className="btn sm" onClick={() => onMove(x, "WRITE")}>Write consultation</button> : nextSteps(x, me).map(s => <button key={s} className={s === "Cancelled" || s === "No-show" ? "btn danger sm" : "btn sm"} onClick={() => onMove(x, s)}>{LABEL[s]}</button>))} {can(ent, me, "u") && (ent !== "appts" || ["Scheduled", "Confirmed"].includes(x.status)) && <button className="btn ghost sm" onClick={() => onEdit(x)}>Edit</button>} {can(ent, me, "d") && <button className="btn danger sm" onClick={() => onDel(x)}>Delete</button>}</td>}
        </tr>))}</tbody></table></div>
  );
}

export function FormModal({ ent, init, db, me, onSave, onClose }) {
  const c = E[ent], [d, setD] = useState(init || c.def || {}), [err, setErr] = useState({}), [auto, setAuto] = useState(!(init && init.nextDue));
  const set = (k, v) => { if (ent === "vacc" && k === "nextDue") setAuto(false); setD(p => { const n = { ...p, [k]: v }; if (ent === "vacc" && k !== "nextDue" && auto && n.date && INTERVAL[n.vaccine]) { const x = new Date(n.date + "T00:00:00"); x.setDate(x.getDate() + INTERVAL[n.vaccine]); n.nextDue = ymd(x); } return n; }); };
  const opts = f => (f.o ? f.o(db, me) : []).map(o => Array.isArray(o) ? o : [o, o]);
  const run = key => {
    const ex = c.chk(d, init && init.id, db), e = {};
    c.f.forEach(f => { const m = checkField(f, d[f.k]) || (f.k in ex ? ex[f.k] : ""); if (m) e[f.k] = m; });
    setErr(key ? p => ({ ...p, [key]: e[key] || "" }) : e); return !Object.keys(e).length;
  };
  const submit = ev => { ev.preventDefault(); if (run()) onSave({ ...d, ...(f => f)(d), weight: d.weight === undefined ? d.weight : +d.weight }); };
  return (
    <div className="scrim" onMouseDown={ev => ev.target === ev.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit} noValidate>
        <h3>{init && init.id ? "Edit" : "Add"} {c.one}</h3>
        {c.f.map(f => (
          <div className="fld" key={f.k}>
            <label htmlFor={f.k}>{f.l}{f.req && <i> *</i>}</label>
            {f.t === "select" ? <select id={f.k} value={d[f.k] || ""} aria-invalid={!!err[f.k]} onChange={e => set(f.k, e.target.value)} onBlur={() => run(f.k)}><option value="">Select…</option>{opts(f).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>
              : f.t === "textarea" ? <textarea id={f.k} rows={3} value={d[f.k] || ""} aria-invalid={!!err[f.k]} onChange={e => set(f.k, e.target.value)} onBlur={() => run(f.k)} />
              : <input id={f.k} type={f.t || "text"} step={f.t === "number" ? "0.1" : undefined} value={d[f.k] ?? ""} aria-invalid={!!err[f.k]} onChange={e => set(f.k, e.target.value)} onBlur={() => run(f.k)} />}
            {err[f.k] && <span className="err">{err[f.k]}</span>}
          </div>))}
        <div className="row end"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn">Save {c.one}</button></div>
      </form>
    </div>
  );
}


SEED.users=[{id:"u1",name:"Clinic Admin",username:"admin",email:"admin@pawcare.com",password:"Admin123",role:"admin"},{id:"u2",name:"Dr. Ana Cruz",username:"vet",email:"vet@pawcare.com",password:"Vet12345",role:"vet",vetId:"v1"},{id:"u3",name:"Liza Ramos",username:"assistant",email:"assistant@pawcare.com",password:"Assist123",role:"assistant"},{id:"u4",name:"Maria Santos",username:"owner",email:"maria@example.com",password:"Owner123",role:"owner",ownerId:"o1"}];
E.users={title:"User Accounts",sub:"Create and manage staff and owner logins.",one:"account",cols:["name","username","role","ownerId"],perm:{admin:"crud"},
 f:[{k:"name",l:"Full name",req:1,min:2,max:60,pat:NM,msg:"Letters, spaces, . ' - only"},{k:"username",l:"Username",req:1,pat:/^[a-z0-9_]{3,20}$/,msg:"3-20 lowercase letters, numbers or _"},{k:"password",l:"Password",req:1,pat:/^(?=.*[A-Za-z])(?=.*\d).{8,}$/,msg:"8+ characters with a letter and a number"},{k:"role",l:"Role",t:"select",o:()=>Object.entries(ROLES).map(([k,v])=>[k,v[0]]),req:1},{k:"ownerId",l:"Linked owner (Pet Owner role)",t:"select",o:db=>db.owners.map(o=>[o.id,o.name])}],
 chk:(d,id,db)=>{const e={};if(db.users.some(u=>u.id!==id&&u.username===d.username))e.username="Username is already taken";if(d.role==="owner"&&!d.ownerId)e.ownerId="Link an owner record for this role";return e}};
export const M=(k,l,i,ent,sub)=>({k,l,i,ent,sub:sub||E[ent].sub});
export const setAppt=(setDb,id,status)=>setDb(p=>({...p,appts:p.appts.map(a=>a.id===id?{...a,status}:a)}));
export const by=(arr,k)=>arr.reduce((m,x)=>(m[x[k]]=(m[x[k]]||0)+1,m),{});
export function Stats({items}){return <div className="stats">{items.map(([i,n,l])=><div className="stat" key={l}><span className="si"><I e={i} size={22} /></span><b>{n}</b><span>{l}</span></div>)}</div>}
export function Hero({title,text,children,emoji,icons}){
  const list = icons || (emoji ? Array.from(String(emoji).replace(/\uFE0F/g,"")) : ["dog", "cat"]);
  return (
    <div className="hero">
      <div><h2>{title}</h2><p>{text}</p>{children}</div>
      <div className="pets" aria-hidden="true" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        {list.map((c,k)=><I key={k} e={c} size={36} />)}
      </div>
    </div>
  );
}

SEED.log = [];
export const INTERVAL = { "Anti-rabies": 365, "5-in-1": 365, "Kennel cough": 365, "Feline 4-in-1": 365, "Deworming": 90 };
export const FLOW = { Scheduled: ["Confirmed", "Cancelled", "No-show"], Confirmed: ["Checked-in", "Cancelled", "No-show"], "Checked-in": ["In consultation", "Cancelled"], "In consultation": ["Completed"], Completed: [], Cancelled: [], "No-show": [] };
export const ACT = { Confirmed: ["assistant", "admin"], "Checked-in": ["assistant", "admin"], "In consultation": ["vet"], Completed: ["vet", "assistant", "admin"], Cancelled: ["assistant", "admin", "owner"], "No-show": ["assistant", "admin"] };
export const LABEL = { Confirmed: "Confirm", "Checked-in": "Check in", "In consultation": "Start consultation", Completed: "Complete visit", Cancelled: "Cancel", "No-show": "No-show" };
export const nextSteps = (a, me) => (FLOW[a.status] || []).filter(s => (ACT[s] || []).includes(me.role) && !(me.role === "owner" && !["Scheduled", "Confirmed"].includes(a.status)));
export const addLog = (p, me, msg) => [{ id: uid(), at: new Date().toLocaleString(), by: me.name, msg }, ...(p.log || [])].slice(0, 40);
export const moveAppt = (setDb, id, status, me) => setDb(p => {
  const a = p.appts.find(x => x.id === id); if (!a || !nextSteps(a, me).includes(status)) return p;
  if (me.role === "owner" && (p.pets.find(x => x.id === a.petId) || {}).ownerId !== me.ownerId) return p;
  return { ...p, appts: p.appts.map(x => x.id === id ? { ...x, status } : x), log: addLog(p, me, `${petName(p, a.petId)}: ${a.status} → ${status}`) };
});
