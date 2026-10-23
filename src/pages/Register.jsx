import { useState, useEffect } from "react";
import { Logo, I } from "../lib.jsx";
import { PW_RULES, pwStrength, validateRegistration, clean, normEmail, normPhone } from "../validate.js";
import { useLive, Field, onlyLetters, onlyDigitsPlus, noSpaces } from "../roles/owner/ui.jsx";
import { auth, OFFLINE_MSG } from "../authApi.js";
import "./auth.css";

const lowerUser = s => s.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
const LABEL = ["Too weak", "Okay", "Good", "Strong", "Very strong"], COLOR = ["#c0392b", "#d98e04", "#2f8f5b", "#1b7a43", "#1b7a43"];

/* Pet owner self-registration. Rules come from validate.js (the same file the server runs), so the
   browser and the server can never disagree. Server answers (taken username, etc.) show on the field. */
export default function Register({ onDone, onBack, go }) {
  const f = useLive({ name: "", email: "", phone: "", address: "", username: "", password: "", confirm: "", agree: false }, validateRegistration), v = f.v;
  const [srv, setSrv] = useState({}), [busy, setBusy] = useState(false), [top, setTop] = useState(""), [showPw, setShowPw] = useState(false), [capped, setCapped] = useState(false);
  const set = (k, x) => { f.set(k, x); if (srv[k]) setSrv(s => ({ ...s, [k]: "" })); };
  const err = (k, eager) => f.show(k, eager) || srv[k] || "";

  /* "Is this username / email free?" checked a moment after typing stops. Skipped quietly if the server has no such route. */
  useEffect(() => {
    const timers = ["username", "email"].filter(k => v[k] && !f.errs[k]).map(k => setTimeout(async () => {
      try {
        const r = await auth.available(k, k === "email" ? normEmail(v[k]) : v[k]);
        if (r && r.available === false) setSrv(s => ({ ...s, [k]: k === "email" ? "An account with this email already exists. Try logging in" : "That username is taken. Try another" }));
      } catch { /* optional check: the server still verifies on submit */ }
    }, 500));
    return () => timers.forEach(clearTimeout);
  }, [v.username, v.email]);

  const rulesOk = PW_RULES.every(([t]) => t(v.password)), s = pwStrength(v.password);
  const submit = async e => {
    e.preventDefault(); setTop(""); f.submit();
    if (!f.valid || busy || capped || srv.username || srv.email) return;
    setBusy(true);
    try {
      const r = await auth.register({ name: clean(v.name), email: normEmail(v.email), phone: normPhone(v.phone), address: clean(v.address), username: v.username.trim(), password: v.password, agree: true });
      return onDone((r && r.email) || normEmail(v.email));   // not signed in yet: "check your email" comes next
    } catch (x) {
      if (x.limit) { setCapped(true); setTop(x.message); } else if (x.offline) setTop(OFFLINE_MSG); else if (x.fields) setSrv(x.fields); else setTop(x.message || "We couldn’t create your account. Please try again.");
    }
    setBusy(false);
  };
  return (
    <div className="lg auth reg">
      <aside className="lgl"><Logo size={72} /><h1>Join PawCare</h1><p>Create your pet owner account to see your pets’ records, track vaccines and request visits online.</p><div className="lart sm" aria-hidden="true"><span><I e="🐶" size={40} /></span><span><I e="🐱" size={40} /></span><span><I e="🐰" size={40} /></span></div></aside>
      <form className="lgr" onSubmit={submit} noValidate>
        <button type="button" className="lnk" onClick={onBack}>← Back to home</button>
        <h2>Create your account</h2>
        <p className="auth-note">Your pets are added by the clinic front desk at your first visit. Once they’re on file, they appear here. After you register we email you a link to verify your address, then text a code to your mobile number.</p>
        <div className="auth-grid">
          <Field id="rname" label="Full name" req value={v.name} filter={onlyLetters} filterMsg="Letters, spaces, . ' - only" maxLen={60} onChange={x => set("name", x)} onBlur={() => f.blur("name")} error={err("name")} valid={f.ok("name")} autoComplete="name" />
          <Field id="ruser" label="Username" req value={v.username} filter={lowerUser} filterMsg="Lowercase letters, numbers and _ only" maxLen={20} onChange={x => set("username", x)} onBlur={() => f.blur("username")} error={err("username")} valid={f.ok("username") && !srv.username} hint="3–20 characters: lowercase letters, numbers or _" autoComplete="username" />
          <Field id="remail" label="Email" req type="email" value={v.email} filter={noSpaces} filterMsg="Spaces aren’t allowed in an email" maxLen={100} onChange={x => set("email", x)} onBlur={() => f.blur("email")} error={err("email")} valid={f.ok("email") && !srv.email} hint="For example name@example.com" autoComplete="email" />
          <Field id="rphone" label="Mobile number" req type="tel" value={v.phone} filter={onlyDigitsPlus} filterMsg="Numbers only (a + is allowed at the start)" inputMode="tel" maxLen={13} onChange={x => set("phone", x)} onBlur={() => f.blur("phone")} error={err("phone")} valid={f.ok("phone")} hint="09XXXXXXXXX or +639XXXXXXXXX" autoComplete="tel" />
          <div className="full"><Field id="raddr" label="Address" req type="textarea" rows={2} max={120} value={v.address} onChange={x => set("address", x)} onBlur={() => f.blur("address")} error={err("address")} valid={f.ok("address")} hint="Barangay, city / municipality" autoComplete="street-address" /></div>
          <Field id="rpw" label="Password" req type={showPw ? "text" : "password"} value={v.password} filter={noSpaces} filterMsg="Spaces aren’t allowed in passwords" maxLen={72} onChange={x => set("password", x)} onBlur={() => f.blur("password")} error="" valid={f.ok("password")} autoComplete="new-password" />
          <Field id="rconf" label="Retype password" req type={showPw ? "text" : "password"} value={v.confirm} filter={noSpaces} filterMsg="Spaces aren’t allowed in passwords" maxLen={72} onChange={x => set("confirm", x)} onBlur={() => f.blur("confirm")} error={err("confirm", !v.password.startsWith(v.confirm) || v.confirm.length > v.password.length)} valid={f.ok("confirm")} autoComplete="new-password" />
          <div className="full pw-block">
            <ul className="ow-req" aria-label="Password requirements">{PW_RULES.map(([t, l]) => <li key={l} className={t(v.password) ? "y" : "n"}>{t(v.password) ? "✓" : "○"} {l}</li>)}</ul>
            {v.password && <><div className="ow-meter"><i style={{ width: `${s * 25}%`, background: COLOR[s] }} /></div><span className="ow-hint">Strength: {LABEL[s]}</span></>}
            {rulesOk && err("password") && <span className="err">{err("password")}</span>}
            <label className="chk"><input type="checkbox" checked={showPw} onChange={e => setShowPw(e.target.checked)} /> Show passwords</label>
          </div>
          <div className="full fld">
            <label className="auth-agree"><input type="checkbox" checked={v.agree} onChange={e => f.set("agree", e.target.checked)} aria-invalid={!!f.show("agree", false)} /><span>I agree to the privacy notice: PawCare keeps my contact details and my pets’ records to run clinic visits and send reminders.</span></label>
            {f.show("agree", false) && <span className="err">{f.show("agree", false)}</span>}
          </div>
        </div>
        {top && <p className="err" role="alert">{top}</p>}
        {f.submitted && !f.valid && <p className="err" role="alert">Please fix the {f.count} highlighted item{f.count > 1 ? "s" : ""} above.</p>}
        <button className="btn gold wide" disabled={busy || capped} title={capped ? "Registration is paused for this connection. Try again in an hour." : undefined}>{busy ? "Creating account…" : "Create account"}</button>
        <div className="auth-links"><span>Already registered?</span><button type="button" className="lnk" onClick={() => go("login")}>Log in</button></div>
      </form>
    </div>
  );
}