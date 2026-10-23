import { useState, useEffect } from "react";
import { Logo, I, ROLES } from "../lib.jsx";
import { validateLogin } from "../validate.js";
import { useLive, Field } from "../roles/owner/ui.jsx";
import { auth, OFFLINE_MSG } from "../authApi.js";
import "./auth.css";

/* Dev-only shortcuts for the seeded demo accounts. They never show in a production build. */
const DEMO = { admin: ["admin", "Admin123"], vet: ["vet", "Vet12345"], assistant: ["assistant", "Assist123"], owner: ["owner", "Owner123"] };

export default function Login({ role, notice, onLogin, onBack, go }) {
  const f = useLive({ identifier: "", password: "" }, validateLogin);
  const [show, setShow] = useState(false), [busy, setBusy] = useState(false), [top, setTop] = useState("");
  const [fails, setFails] = useState(0), [until, setUntil] = useState(0), [, tick] = useState(0);

  /* After 5 wrong tries the form pauses for 30 seconds, with a live countdown. */
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => { tick(n => n + 1); if (Date.now() >= until) { setUntil(0); setTop(""); } }, 500);
    return () => clearInterval(t);
  }, [until]);
  const wait = Math.max(0, Math.ceil((until - Date.now()) / 1000));

  const submit = async e => {
    e.preventDefault(); setTop(""); f.submit();
    if (!f.valid || busy || wait) return;
    setBusy(true);
    try { const r = await auth.login(f.v.identifier.trim(), f.v.password); onLogin(r.user); return; }
    catch (x) {
      if (x.offline) setTop(OFFLINE_MSG);
      else {
        const n = fails + 1; setFails(n >= 5 ? 0 : n); if (n >= 5) setUntil(Date.now() + 30000);
        setTop(x.message || "Incorrect username/email or password.");   // never says which one was wrong
      }
    }
    setBusy(false);
  };
  const title = role ? `Log in · ${ROLES[role][0]}` : "Log in";
  return (
    <div className="lg auth">
      <aside className="lgl"><Logo size={72} /><h1>Welcome back to PawCare</h1><p>Sign in to open your portal. Each role sees its own tools.</p><div className="lart sm" aria-hidden="true"><span><I e="🐶" size={40} /></span><span><I e="🐱" size={40} /></span><span><I e="🐰" size={40} /></span></div></aside>
      <form className="lgr" onSubmit={submit} noValidate>
        <button type="button" className="lnk" onClick={onBack}>← Back to home</button>
        <h2>{title}</h2>
        {notice && <p className="auth-note" role="status">{notice}</p>}
        <Field id="u" label="Username or email" req value={f.v.identifier} onChange={x => f.set("identifier", x)} onBlur={() => f.blur("identifier")} error={f.show("identifier", false)} autoComplete="username" disabled={!!wait} />
        <Field id="p" label="Password" req type={show ? "text" : "password"} value={f.v.password} onChange={x => f.set("password", x)} onBlur={() => f.blur("password")} error={f.show("password", false)} autoComplete="current-password" disabled={!!wait} />
        <div className="auth-row"><label className="chk"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> Show password</label><button type="button" className="lnk" onClick={() => go("forgot")}>Forgot password?</button></div>
        {wait > 0 ? <p className="err" role="alert">Too many attempts. Try again in {wait} seconds.</p> : top && <p className="err" role="alert">{top}</p>}
        <button className="btn gold wide" disabled={busy || wait > 0}>{busy ? "Logging in…" : "Log in"}</button>
        <p className="auth-alt">New pet owner? <button type="button" className="lnk" onClick={() => go("register")}>Create an account</button></p>
        <p className="auth-fine">Clinic staff accounts are created by the clinic administrator.</p>
        {import.meta.env.DEV && <div className="demo"><p>Demo accounts (dev only, click to fill):</p><div className="chips">{Object.entries(DEMO).map(([r, [a, b]]) => <button type="button" key={r} className="btn ghost sm" onClick={() => { f.patch({ identifier: a, password: b }); }}>{ROLES[r][0]}</button>)}</div></div>}
      </form>
    </div>
  );
}