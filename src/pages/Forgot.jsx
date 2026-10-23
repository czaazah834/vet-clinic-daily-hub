import { useState, useEffect } from "react";
import { Logo, I } from "../lib.jsx";
import { PW_RULES, pwStrength, validateReset } from "../validate.js";
import { useLive, Field, noSpaces } from "../roles/owner/ui.jsx";
import { auth, OFFLINE_MSG } from "../authApi.js";
import "./auth.css";

const digits6 = s => s.replace(/\D/g, "").slice(0, 6);
const LABEL = ["Too weak", "Okay", "Good", "Strong", "Very strong"], COLOR = ["#c0392b", "#d98e04", "#2f8f5b", "#1b7a43", "#1b7a43"];

/* Reset a forgotten password in two steps: ask for a 6-digit code, then set the new password. */
export default function Forgot({ onBack, go }) {
  const f = useLive({ identifier: "", code: "", password: "", confirm: "" }, validateReset), v = f.v;
  const [step, setStep] = useState("ask"), [busy, setBusy] = useState(false), [top, setTop] = useState(""), [cool, setCool] = useState(0), [dev, setDev] = useState(""), [show, setShow] = useState(false), [srv, setSrv] = useState({});
  useEffect(() => { if (cool <= 0) return; const t = setTimeout(() => setCool(c => c - 1), 1000); return () => clearTimeout(t); }, [cool]);
  const set = (k, x) => { f.set(k, x); if (srv[k]) setSrv(s => ({ ...s, [k]: "" })); };
  const err = (k, eager) => f.show(k, eager) || srv[k] || "";
  const fail = x => { if (x.offline) setTop(OFFLINE_MSG); else if (x.fields) setSrv(x.fields); else setTop(x.message || "Something went wrong. Please try again."); };

  const send = async e => {
    e && e.preventDefault(); setTop(""); f.blur("identifier");
    if (f.errs.identifier || busy || cool > 0) return;
    setBusy(true);
    try { const r = await auth.forgot(v.identifier.trim()); setDev((r && r.devCode) || ""); setStep("reset"); setCool(30); } catch (x) { fail(x); }
    setBusy(false);
  };
  const reset = async e => {
    e.preventDefault(); setTop(""); f.submit();
    if (!f.valid || busy) return;
    setBusy(true);
    try { await auth.reset({ identifier: v.identifier.trim(), code: v.code.trim(), password: v.password }); setStep("done"); } catch (x) { fail(x); }
    setBusy(false);
  };
  const rulesOk = PW_RULES.every(([t]) => t(v.password)), s = pwStrength(v.password);
  return (
    <div className="lg auth">
      <aside className="lgl"><Logo size={72} /><h1>Forgot your password?</h1><p>No problem. We’ll send a 6-digit code so you can choose a new one.</p><div className="lart sm" aria-hidden="true"><span><I e="🔒" size={40} /></span><span><I e="🐾" size={40} /></span></div></aside>
      {step === "done" ? <div className="lgr auth-ok"><I e="✅" size={48} /><h2>Password changed</h2><p>You can now log in with your new password.</p><button className="btn gold wide" onClick={() => go("login")}>Go to log in</button></div>
      : step === "ask" ? <form className="lgr" onSubmit={send} noValidate>
        <button type="button" className="lnk" onClick={onBack}>← Back to log in</button>
        <h2>Find your account</h2>
        <Field id="fid" label="Username or email" req value={v.identifier} filter={noSpaces} filterMsg="Spaces aren’t allowed here" onChange={x => set("identifier", x)} onBlur={() => f.blur("identifier")} error={f.show("identifier", false)} hint="Enter the one you use to log in" autoComplete="username" />
        {top && <p className="err" role="alert">{top}</p>}
        <button className="btn gold wide" disabled={busy}>{busy ? "Sending…" : "Send me a code"}</button>
      </form>
      : <form className="lgr" onSubmit={reset} noValidate>
        <button type="button" className="lnk" onClick={() => { setStep("ask"); setTop(""); }}>← Use a different account</button>
        <h2>Enter the code</h2>
        <p className="auth-note">If an account matches <b>{v.identifier}</b>, a 6-digit code was sent to its email. It may take a minute to arrive.</p>
        {dev && <p className="auth-dev">Dev only: your code is <b>{dev}</b></p>}
        <Field id="fcode" label="6-digit code" req value={v.code} filter={digits6} filterMsg="Numbers only" inputMode="numeric" maxLen={6} onChange={x => set("code", x)} onBlur={() => f.blur("code")} error={err("code")} valid={f.ok("code")} autoComplete="one-time-code" />
        <Field id="fpw" label="New password" req type={show ? "text" : "password"} value={v.password} filter={noSpaces} filterMsg="Spaces aren’t allowed in passwords" maxLen={72} onChange={x => set("password", x)} onBlur={() => f.blur("password")} error="" valid={f.ok("password")} autoComplete="new-password" />
        <ul className="ow-req" aria-label="Password requirements">{PW_RULES.map(([t, l]) => <li key={l} className={t(v.password) ? "y" : "n"}>{t(v.password) ? "✓" : "○"} {l}</li>)}</ul>
        {v.password && <><div className="ow-meter"><i style={{ width: `${s * 25}%`, background: COLOR[s] }} /></div><span className="ow-hint">Strength: {LABEL[s]}</span></>}
        {rulesOk && err("password") && <span className="err">{err("password")}</span>}
        <Field id="fconf" label="Retype new password" req type={show ? "text" : "password"} value={v.confirm} filter={noSpaces} filterMsg="Spaces aren’t allowed in passwords" maxLen={72} onChange={x => set("confirm", x)} onBlur={() => f.blur("confirm")} error={err("confirm", !v.password.startsWith(v.confirm) || v.confirm.length > v.password.length)} valid={f.ok("confirm")} autoComplete="new-password" />
        <label className="chk"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> Show passwords</label>
        {top && <p className="err" role="alert">{top}</p>}
        <button className="btn gold wide" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
        <div className="auth-links"><span>Didn’t get a code?</span><button type="button" className="lnk" disabled={cool > 0 || busy} onClick={() => send()}>{cool > 0 ? `Send again in ${cool}s` : "Send again"}</button></div>
      </form>}
    </div>
  );
}