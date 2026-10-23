import { useState } from "react";
import { Logo, I, ROLES } from "../lib.jsx";
import { validateLogin } from "../validate.js";
import { useLive, Field } from "../roles/owner/ui.jsx";
import { auth, OFFLINE_MSG } from "../authApi.js";
import "./auth.css";

/* Dev-only shortcuts for the seeded demo accounts. They never show in a production build. */
const DEMO = { admin: ["admin", "Admin123"], vet: ["vet", "Vet12345"], assistant: ["assistant", "Assist123"], owner: ["owner", "Owner123"] };

export default function Login({ role, notice, bad, onLogin, onBack, go }) {
  const f = useLive({ identifier: "", password: "" }, validateLogin);
  const [show, setShow] = useState(false), [busy, setBusy] = useState(false), [top, setTop] = useState("");
  const [rv, setRv] = useState(""), [unver, setUnver] = useState(false);

  /* The lock lives on the server (3 wrong passwords = account locked + unlock email), so this page only shows what the server says. */
  const submit = async e => {
    e.preventDefault(); setTop(""); setRv(""); setUnver(false); f.submit();
    if (!f.valid || busy) return;
    setBusy(true);
    try { const r = await auth.login(f.v.identifier.trim(), f.v.password); onLogin(r); return; }
    catch (x) {
      setUnver(!!x.unverified);
      setTop(x.offline ? OFFLINE_MSG : x.message || "Incorrect username/email or password.");   // never says which one was wrong
    }
    setBusy(false);
  };
  const resend = async () => {
    setRv(""); try { await auth.resendVerification(f.v.identifier.trim()); setTop(""); setUnver(false); setRv("If that account is unverified, a new link was sent. Check your inbox."); } catch (x) { setTop(x.offline ? OFFLINE_MSG : x.message || "Please try again."); }
  };
  const title = role ? `Log in · ${ROLES[role][0]}` : "Log in";
  return (
    <div className="lg auth">
      <aside className="lgl"><Logo size={72} /><h1>Welcome back to PawCare</h1><p>Sign in to open your portal. Each role sees its own tools.</p><div className="lart sm" aria-hidden="true"><span><I e="🐶" size={40} /></span><span><I e="🐱" size={40} /></span><span><I e="🐰" size={40} /></span></div></aside>
      <form className="lgr" onSubmit={submit} noValidate>
        <button type="button" className="lnk" onClick={onBack}>← Back to home</button>
        <h2>{title}</h2>
        {notice && <p className={`auth-note${bad ? " bad" : ""}`} role="status">{notice}</p>}
        <Field id="u" label="Username or email" req value={f.v.identifier} onChange={x => f.set("identifier", x)} onBlur={() => f.blur("identifier")} error={f.show("identifier", false)} autoComplete="username" />
        <Field id="p" label="Password" req type={show ? "text" : "password"} value={f.v.password} onChange={x => f.set("password", x)} onBlur={() => f.blur("password")} error={f.show("password", false)} autoComplete="current-password" />
        <div className="auth-row"><label className="chk"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> Show password</label><button type="button" className="lnk" onClick={() => go("forgot")}>Forgot password?</button></div>
        {top && <p className="err" role="alert">{top}{unver && <> <button type="button" className="lnk" onClick={resend}>Resend verification email</button></>}</p>}
        {rv && <p className="okm" role="status">{rv}</p>}
        <button className="btn gold wide" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
        <p className="auth-alt">New pet owner? <button type="button" className="lnk" onClick={() => go("register")}>Create an account</button></p>
        <p className="auth-fine">Clinic staff accounts are created by the clinic administrator.</p>
        {import.meta.env.DEV && <div className="demo"><p>Demo accounts (dev only, click to fill):</p><div className="chips">{Object.entries(DEMO).map(([r, [a, b]]) => <button type="button" key={r} className="btn ghost sm" onClick={() => { f.patch({ identifier: a, password: b }); }}>{ROLES[r][0]}</button>)}</div></div>}
      </form>
    </div>
  );
}