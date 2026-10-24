import { useState } from "react";
import { Logo, I } from "../lib.jsx";
import { Check, Syringe, CalendarCheck, PawPrint, HeartPulse, ChevronRight } from "lucide-react";
import "./landing.css";
import "./brand.css";
const PORTALS = [["admin", "🏥", "Clinic Administrator", "Oversee every record, schedule and login, with a clinic-wide overview.", "w7", "sky"], ["vet", "🩺", "Veterinarian", "See today’s patient queue, write consultations and track vaccines.", "w5", "butter"], ["assistant", "🛎️", "Vet Assistant", "Check patients in, register owners and call owners with reminders.", "w5", "butter"], ["owner", "🐶", "Pet Owner", "Follow your pets’ health, book visits and view vaccine records.", "w7", "sky"]];
const WHY = [["🔐", "Role-based access", "Everyone sees only the tools their job needs."], ["💉", "Vaccine reminders", "Overdue and due-soon shots surface on the dashboard."], ["📋", "Complete records", "Pets, owners, visits and prescriptions in one place."], ["🔎", "Fast search", "Find any pet, owner or visit in a couple of keystrokes."]];
const REVIEWS = [["Maria S.", "Pet owner", "I can finally see Bantay’s next vaccine date without calling the clinic."], ["Dr. Ana C.", "Veterinarian", "My day starts with a clear queue, and consultation notes take seconds."], ["Liza R.", "Vet assistant", "Check-in and reminder calls are all on one screen. No more paper lists."], ["Jose R.", "Pet owner", "Booking Choco’s booster took less than a minute."], ["Clinic admin", "Administrator", "Adding a new staff login is quick, and access stays tidy."]];
const FAQ = [["How do I get an account?", "Pet owners can sign up on this page with an email, mobile number and password. Clinic staff accounts are created by the clinic administrator."], ["Do I need to install anything?", "No. The hub runs in your browser. You only need an internet or local network connection."], ["Who can see my pet’s records?", "Access is based on role. Pet owners see only their own pets, and staff see what their responsibilities require."], ["Will it diagnose my pet?", "No. It stores what the veterinarian records and never replaces professional judgment."], ["Does it work offline or import other clinics’ records?", "Not yet. It needs a connection and does not pull records from other clinics or outside databases."]];
export default function Landing({ onLogin, onRegister }) {
  const [open, setOpen] = useState(0), [em, setEm] = useState(""), [msg, setMsg] = useState({});
  const sub = e => { e.preventDefault(); if (!em.trim()) return setMsg({ e: "Enter your email" }); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em.trim())) return setMsg({ e: "Enter a valid email address" }); setMsg({ ok: "Thanks! We’ll be in touch." }); setEm(""); };
  return (
    <div className="w"><div className="wc">
      <header className="wnav"><div className="wlogo"><Logo size={38} /><b>PawCare</b></div>
        <nav aria-label="Page"><a href="#portals">Portals</a><a href="#why">Why Us</a><a href="#reviews">Reviews</a><a href="#faq">FAQs</a><a href="#contact">Contact</a></nav>
        <div className="wnavr"><button className="btn ghost" onClick={() => onLogin()}>Log in</button><button className="btn gold" onClick={onRegister}>Sign up</button></div></header>
      <section className="whero"><div className="hpanel">
        <div className="hl">
          <span className="wbadge"><PawPrint size={14} /> Built for veterinary clinics</span>
          <h1>Every pet’s health story, in <em>one friendly hub.</em></h1>
          <p>Appointments, vaccinations and consultations in a single place, with a dedicated space for each member of your clinic team and for pet owners.</p>
          <div className="row"><button className="btn gold" onClick={onRegister}>Create a pet owner account</button><a className="btn ghost" href="#portals">Explore portals</a></div>
          <div className="hchips" aria-hidden="true"><span><Syringe size={14} /> Vaccine reminders</span><span><CalendarCheck size={14} /> Online booking</span><span><HeartPulse size={14} /> Health records</span></div>
        </div>
        <img className="hpic" src="/images/hero-pets.jpg" alt="A happy dog and cat together" loading="eager" />
        <aside className="hcard" aria-label="Open your portal">
          <h2>Open your portal</h2>
          <p>Choose how you use PawCare today.</p>
          <div className="hroles">{[["owner", "Pet Owner", "Book visits, view vaccine cards"], ["assistant", "Vet Assistant", "Front desk, check-in, billing"], ["vet", "Veterinarian", "Queue, SOAP notes, Rx"], ["admin", "Administrator", "Staff, sales, audit trail"]].map(([r, n, d]) => <button key={r} type="button" onClick={() => onLogin(r)}><span><b>{n}</b><small>{d}</small></span><ChevronRight size={18} /></button>)}</div>
          <button className="btn gold wide" type="button" onClick={onRegister}>New pet owner? Sign up</button>
        </aside>
      </div></section>
      <section className="wstats" aria-label="Highlights"><div><b>4</b><span>Role-based portals</span></div><div><b>24/7</b><span>Online booking</span></div><div><b>BAI</b><span>Digital vaccine cards</span></div><div><b>Live</b><span>Clinic-wide sync</span></div></section>
      <section className="wpart"><p>Caring for every kind of pet</p><div>{[["🐶", "Dogs"], ["🐱", "Cats"], ["🐰", "Rabbits"], ["🐦", "Birds"], ["🐾", "And more"]].map(([e, x]) => <span key={x}><I e={e} size={16} />{x}</span>)}</div></section>
      <section id="portals" className="wsec"><h2>One clinic, four portals</h2><div className="wfeat">{PORTALS.map(([r, i, t, d, w, c]) => <article key={r} className={`fc ${w} ${c}`}><span className="si"><I e={i} size={26} /></span><div><h3>{t}</h3><p>{d}</p><div className="row"><button className="btn sm" onClick={() => onLogin(r)}>Open portal</button>{r === "owner" && <button className="btn ghost sm" onClick={onRegister}>Create account</button>}</div></div></article>)}</div></section>
      <section className="wsplit"><div className="ph"><img src="/images/vet-care.jpg" alt="Veterinarian caring for a dog" loading="lazy" /></div>
        <div><h2>Gentle care for pets, clear workflow for the team</h2><p>From the front desk to the consultation room, every step is connected so pets get seen faster and owners stay informed.</p>
          <ul>{[["Check-in and vitals", "Weight and temperature are recorded at the desk before the doctor sees the patient."], ["SOAP notes and prescriptions", "Veterinarians finish the visit and billing opens automatically."], ["Vaccine cards that stay current", "Boosters are calculated and reminders surface before they are due."]].map(([t, d]) => <li key={t}><span className="ck"><Check size={16} /></span><div><b>{t}</b><small>{d}</small></div></li>)}</ul></div></section>
      <section id="why" className="wsec"><h2>Why choose PawCare</h2><div className="wwhy">{WHY.map(([i, t, d]) => <div key={t}><span className="ib"><I e={i} size={22} /></span><h3>{t}</h3><p>{d}</p></div>)}</div></section>
      <section id="reviews" className="wsec"><h2>Loved by clinics and owners</h2><div className="wrev" tabIndex={0} aria-label="Reviews">{REVIEWS.map(([n, p, q]) => <figure key={n}><div className="stars" aria-label="5 stars">★★★★★</div><blockquote>{q}</blockquote><figcaption><span className="av">{n[0]}</span><div><b>{n}</b><small>{p}</small></div></figcaption></figure>)}</div><p className="wnote">Sample feedback for the UI preview.</p></section>
      <section id="faq" className="wsec wfaq"><div><h2>Questions, answered</h2><p>Quick answers before you log in.</p></div><div>{FAQ.map(([q, a], i) => <div className="qi" key={q}><button aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>{q}<span>{open === i ? "−" : "+"}</span></button>{open === i && <p>{a}</p>}</div>)}</div></section>
      <section className="wcta"><div><h2>Ready to give every pet better care?</h2><p>Log in to your portal, or create a pet owner account in a minute.</p><div className="row"><button className="btn gold" onClick={() => onLogin()}>Log in</button><button className="btn ghost" onClick={onRegister}>Create account</button></div></div><div className="deco" aria-hidden="true"><i><I e="🐾" size={48} /></i><i><I e="🐶" size={48} /></i></div></section>
      <footer id="contact" className="wfoot"><div className="fl1"><div className="wlogo"><Logo size={38} /><b>PawCare Daily Hub</b></div><p>Questions about the system? Leave your email and we’ll reach out.</p>
        <form onSubmit={sub} noValidate><input type="email" placeholder="Enter your email" value={em} aria-label="Email" aria-invalid={!!msg.e} onChange={e => { setEm(e.target.value); setMsg({}); }} /><button className="btn">Talk to us</button></form>{msg.e && <span className="err">{msg.e}</span>}{msg.ok && <span className="okm">{msg.ok}</span>}</div>
        <div><h4>Essential links</h4><a href="#portals">Portals</a><a href="#why">Why us</a><a href="#reviews">Reviews</a><a href="#faq">FAQs</a></div>
        <div><h4>Log in as</h4><button className="lk" onClick={onRegister}>New pet owner? Sign up</button>{[["admin", "Administrator"], ["vet", "Veterinarian"], ["assistant", "Vet assistant"], ["owner", "Pet owner"]].map(([r, l]) => <button key={r} className="lk" onClick={() => onLogin(r)}>{l}</button>)}</div>
        <div><h4>Project</h4><span>University of Caloocan City</span><span>Computer Studies Department</span><span>ITP-108 Event-Driven Programming</span></div></footer>
    </div></div>
  );
}

