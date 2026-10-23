import { useState, useEffect, useRef } from "react";
import { Logo, I } from "../lib.jsx";
import { validateCode } from "../validate.js";
import { useLive, Field } from "../roles/owner/ui.jsx";
import { auth, OFFLINE_MSG } from "../authApi.js";
import "./auth.css";

/* The three screens between "Create account" / "account locked" and a working log in.
   Flow (same as login_registration): register -> CheckEmail -> email link -> Otp (SMS code) -> Log in.
   A locked account: unlock email -> Unlock (2-minute cooling countdown) -> Log in. */

const digits6 = s => s.replace(/\D/g, "").slice(0, 6);
const Side = ({ title, text, icons }) => (
  <aside className="lgl"><Logo size={72} /><h1>{title}</h1><p>{text}</p><div className="lart sm" aria-hidden="true">{icons.map(e => <span key={e}><I e={e} size={40} /></span>)}</div></aside>
);

/* ---------- 1. "Check your email" after registering ---------- */
export function CheckEmail({ email, go }) {
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [err, setErr] = useState(""), [cool, setCool] = useState(30);
  useEffect(() => { if (cool <= 0) return; const t = setTimeout(() => setCool(c => c - 1), 1000); return () => clearTimeout(t); }, [cool]);
  const resend = async () => {
    if (busy || cool > 0) return;
    setBusy(true); setMsg(""); setErr("");
    try { await auth.resendVerification(email); setMsg("If that account is unverified, a new link was sent."); setCool(30); }
    catch (x) { setErr(x.offline ? OFFLINE_MSG : x.message || "Please try again."); }
    setBusy(false);
  };
  return (
    <div className="lg auth">
      <Side title="Almost there" text="Verify your email, then your mobile number. After that you can log in." icons={["🐶", "🐱", "🐰"]} />
      <div className="lgr auth-ok">
        <I e="📋" size={48} />
        <h2>Check your email</h2>
        <p>We sent a verification link to <b>{email}</b>. It expires in 24 hours. Check your spam folder too.</p>
        <p className="auth-fine">After you click the link we will text a 6-digit code to your mobile number.</p>
        {msg && <p className="okm" role="status">{msg}</p>}
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn gold wide" onClick={() => go("login")}>Go to log in</button>
        <div className="auth-links"><span>Didn’t get it?</span><button type="button" className="lnk" disabled={cool > 0 || busy} onClick={resend}>{cool > 0 ? `Send again in ${cool}s` : "Send again"}</button></div>
      </div>
    </div>
  );
}

/* ---------- 2. Mobile code (OTP) ---------- */
export function Otp({ onDone, onBack }) {
  const f = useLive({ code: "" }, validateCode);
  const [phone, setPhone] = useState(""), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [err, setErr] = useState(""), [info, setInfo] = useState(""), [n, setN] = useState(0);
  const fail = x => setErr(x.offline ? OFFLINE_MSG : x.message || "Something went wrong. Please try again.");
  const send = async first => {
    setErr(""); setInfo("");
    try { await auth.otpSend(); setN(60); if (!first) setInfo("New code sent."); } catch (x) { fail(x); }
  };
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; started.current = true;
    (async () => {
      try {
        const i = await auth.otpInfo();
        if (i.mobileVerified) return onDone(null);        // nothing left to verify: send them to Log in
        setPhone(i.phone); setReady(true); await send(true);
      } catch (x) { fail(x); setReady(true); }
    })();
  }, []); // eslint-disable-line
  useEffect(() => { if (n <= 0) return; const t = setTimeout(() => setN(c => c - 1), 1000); return () => clearTimeout(t); }, [n]);

  const submit = async e => {
    e.preventDefault(); setErr(""); setInfo(""); f.submit();
    if (!f.valid || busy) return;
    setBusy(true);
    try { const r = await auth.otpVerify(f.v.code.trim()); onDone(r.user || null); return; } catch (x) { fail(x); }
    setBusy(false);
  };
  return (
    <div className="lg auth">
      <Side title="Verify your mobile" text="One last check so we can reach you about your pets’ visits and vaccines." icons={["🐾", "📅"]} />
      <form className="lgr" onSubmit={submit} noValidate>
        <button type="button" className="lnk" onClick={onBack}>← Back to log in</button>
        <h2>Enter your code</h2>
        <p className="auth-note">Email verified. We texted a 6-digit code to <b>{ready ? phone || "your mobile number" : "…"}</b>. It lasts 5 minutes. After 3 wrong tries you must wait 15 minutes.</p>
        <div className="otp-field">
          <Field id="otp" label="6-digit code" req value={f.v.code} filter={digits6} filterMsg="Numbers only" inputMode="numeric" maxLen={6} onChange={x => f.set("code", x)} onBlur={() => f.blur("code")} error={f.show("code", false)} valid={f.ok("code")} autoComplete="one-time-code" />
        </div>
        {info && <p className="okm" role="status">{info}</p>}
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn gold wide" disabled={busy || !ready}>{busy ? "Checking…" : "Verify code"}</button>
        <div className="auth-links"><span>Didn’t get a code?</span><button type="button" className="lnk" disabled={n > 0 || busy} onClick={() => send(false)}>{n > 0 ? `Send again in ${n}s` : "Send again"}</button></div>
      </form>
    </div>
  );
}

/* ---------- 3. Unlock link: 2-minute cooling countdown ---------- */
export function Unlock({ token, onDone }) {
  const [wait, setWait] = useState(null), [left, setLeft] = useState(0), [err, setErr] = useState("");
  const check = async () => {
    try {
      const r = await auth.unlock(token);
      if (r.status === "ok") return onDone("Account unlocked. You can log in now.");
      if (r.status === "wait") return setWait({ s: r.seconds, at: Date.now() });
      onDone("That unlock link is invalid or expired. Try logging in again to get a new one.", true);
    } catch (x) { setErr(x.offline ? OFFLINE_MSG : x.message || "We couldn’t check that link. Please try again."); }
  };
  const started = useRef(false);
  useEffect(() => { if (started.current) return; started.current = true; check(); }, []); // eslint-disable-line
  useEffect(() => {
    if (!wait) return;
    const end = wait.at + wait.s * 1000;
    const tick = () => { const l = Math.max(0, Math.ceil((end - Date.now()) / 1000)); setLeft(l); if (!l) { clearInterval(id); setWait(null); check(); } };   // timer done: ask the server again, it unlocks the account
    const id = setInterval(tick, 1000); tick();
    return () => clearInterval(id);
  }, [wait]); // eslint-disable-line
  return (
    <div className="lg auth">
      <Side title="Unlocking your account" text="For your protection the unlock link works only after a short cooling period." icons={["🔐", "🐾"]} />
      <div className="lgr auth-ok">
        <I e="🔐" size={48} />
        <h2>Cooling period</h2>
        {err ? <p className="err" role="alert">{err}</p>
          : wait ? <><p className="auth-note bad" role="status">Cooling period started. Your account will unlock in</p><p className="auth-count" aria-live="off">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</p><p className="auth-fine">Keep this page open. It unlocks by itself when the timer ends.</p></>
          : <p>Checking your link…</p>}
        <button className="btn ghost wide" onClick={() => onDone("")}>Back to log in</button>
      </div>
    </div>
  );
}
