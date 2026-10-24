import { useState, useEffect } from "react";
import { Logo, I } from "../lib.jsx";
import { PW_RULES, pwStrength, validateReset } from "../validate.js";
import { useLive, Field, noSpaces } from "../roles/owner/ui.jsx";
import { auth, OFFLINE_MSG } from "../authApi.js";
import OtpBoxInput from "./OtpBoxInput.jsx";
import { ArrowLeft, ArrowRight, ShieldCheck, CheckCircle2, RotateCcw } from "lucide-react";
import "./auth.css";
import "./brand.css";

const LABEL = ["Too weak", "Okay", "Good", "Strong", "Very strong"];
const COLOR = ["#c0392b", "#d98e04", "#2f8f5b", "#1b7a43", "#1b7a43"];

export default function Forgot({ onBack, go }) {
  const f = useLive({ identifier: "", code: "", password: "", confirm: "" }, validateReset),
    v = f.v;
  const [step, setStep] = useState("ask"),
    [busy, setBusy] = useState(false),
    [top, setTop] = useState(""),
    [cool, setCool] = useState(0),
    [dev, setDev] = useState(""),
    [show, setShow] = useState(false),
    [srv, setSrv] = useState({});

  useEffect(() => {
    if (cool <= 0) return;
    const t = setTimeout(() => setCool((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cool]);

  const set = (k, x) => {
    f.set(k, x);
    if (srv[k]) setSrv((s) => ({ ...s, [k]: "" }));
  };

  const err = (k, eager) => f.show(k, eager) || srv[k] || "";
  const fail = (x) => {
    if (x.offline) setTop(OFFLINE_MSG);
    else if (x.fields) setSrv(x.fields);
    else setTop(x.message || "Something went wrong. Please try again.");
  };

  const send = async (e) => {
    e && e.preventDefault();
    setTop("");
    f.blur("identifier");
    if (f.errs.identifier || busy || cool > 0) return;
    setBusy(true);
    try {
      const r = await auth.forgot(v.identifier.trim());
      setDev((r && r.devCode) || "");
      setStep("reset");
      setCool(30);
    } catch (x) {
      fail(x);
    }
    setBusy(false);
  };

  const reset = async (e) => {
    e.preventDefault();
    setTop("");
    f.submit();
    if (!f.valid || busy) return;
    setBusy(true);
    try {
      await auth.reset({ identifier: v.identifier.trim(), code: v.code.trim(), password: v.password });
      setStep("done");
    } catch (x) {
      fail(x);
    }
    setBusy(false);
  };

  const rulesOk = PW_RULES.every(([t]) => t(v.password));
  const s = pwStrength(v.password);

  return (
    <div className="lg auth cardl">
      <aside className="lgl photo">
        <div className="brandrow">
          <Logo size={28} />
          <span>PawCare</span>
        </div>
        <div className="cap">
          <h1>
            Password <em>Recovery</em>
          </h1>
          <p>Verify your identity with a 6-digit code to choose a new secure password.</p>
        </div>
      </aside>

      {step === "done" ? (
        <div className="auth-verify-card">
          <div className="envelope-badge-wrap">
            <div className="envelope-pulse-bg" />
            <div className="envelope-icon-box" style={{ background: "linear-gradient(135deg,#059669,#10b981)" }}>
              <CheckCircle2 size={34} />
            </div>
            <div className="envelope-paw-tag">🎉</div>
          </div>
          <h2>Password Changed!</h2>
          <p className="card-subtitle">
            Your password was updated successfully. You can now log into your PawCare portal.
          </p>
          <button className="btn gold wide" onClick={() => go("login")}>
            Proceed to Log in <ArrowRight size={16} />
          </button>
        </div>
      ) : step === "ask" ? (
        <form className="auth-verify-card" onSubmit={send} noValidate style={{ textAlign: "left" }}>
          <button type="button" className="lnk" onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: "4px", marginBottom: "8px" }}>
            <ArrowLeft size={14} /> Back to log in
          </button>
          <h2 style={{ textAlign: "center", marginBottom: "6px" }}>Find your account</h2>
          <p className="card-subtitle" style={{ textAlign: "center" }}>
            Enter your email or username and we’ll send a 6-digit verification code.
          </p>

          <Field
            id="fid"
            label="Username or email"
            req
            value={v.identifier}
            filter={noSpaces}
            filterMsg="Spaces aren’t allowed here"
            onChange={(x) => set("identifier", x)}
            onBlur={() => f.blur("identifier")}
            error={f.show("identifier", false)}
            hint="Enter the email address you registered with"
            autoComplete="username"
          />

          {top && <p className="err" role="alert" style={{ margin: "10px 0" }}>{top}</p>}

          <button className="btn gold wide" disabled={busy} style={{ marginTop: "16px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            {busy ? "Sending code..." : "Send me a 6-digit code"} <ArrowRight size={16} />
          </button>
        </form>
      ) : (
        <form className="auth-verify-card" onSubmit={reset} noValidate style={{ textAlign: "left" }}>
          <button
            type="button"
            className="lnk"
            onClick={() => {
              setStep("ask");
              setTop("");
            }}
            style={{ display: "inline-flex", alignItems: "center", gap: "4px", marginBottom: "8px" }}
          >
            <ArrowLeft size={14} /> Use a different account
          </button>
          <h2 style={{ textAlign: "center", marginBottom: "6px" }}>Enter 6-digit code</h2>
          <p className="card-subtitle" style={{ textAlign: "center" }}>
            Code sent to <b>{v.identifier}</b>. Enter it below along with your new password.
          </p>

          {dev && <p className="auth-dev">Dev only: your code is <b>{dev}</b></p>}

          <div style={{ textAlign: "center", margin: "14px 0" }}>
            <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--navy)", display: "block", marginBottom: "4px" }}>
              6-DIGIT VERIFICATION CODE<i> *</i>
            </label>
            <OtpBoxInput
              value={v.code}
              onChange={(c) => {
                set("code", c);
                setTop("");
              }}
              hasError={!!err("code")}
              autoFocus={true}
            />
            {err("code") && <span className="err" style={{ display: "block", textAlign: "center" }}>{err("code")}</span>}
          </div>

          <Field
            id="fpw"
            label="New password"
            req
            type={show ? "text" : "password"}
            value={v.password}
            filter={noSpaces}
            filterMsg="Spaces aren’t allowed in passwords"
            maxLen={72}
            onChange={(x) => set("password", x)}
            onBlur={() => f.blur("password")}
            error=""
            valid={f.ok("password")}
            autoComplete="new-password"
          />

          <ul className="ow-req" aria-label="Password requirements">
            {PW_RULES.map(([t, l]) => (
              <li key={l} className={t(v.password) ? "y" : "n"}>
                {t(v.password) ? "✓" : "○"} {l}
              </li>
            ))}
          </ul>

          {v.password && (
            <>
              <div className="ow-meter">
                <i style={{ width: `${s * 25}%`, background: COLOR[s] }} />
              </div>
              <span className="ow-hint">Strength: {LABEL[s]}</span>
            </>
          )}

          {rulesOk && err("password") && <span className="err">{err("password")}</span>}

          <Field
            id="fconf"
            label="Retype new password"
            req
            type={show ? "text" : "password"}
            value={v.confirm}
            filter={noSpaces}
            filterMsg="Spaces aren’t allowed in passwords"
            maxLen={72}
            onChange={(x) => set("confirm", x)}
            onBlur={() => f.blur("confirm")}
            error={err("confirm", !v.password.startsWith(v.confirm) || v.confirm.length > v.password.length)}
            valid={f.ok("confirm")}
            autoComplete="new-password"
          />

          <label className="chk" style={{ marginTop: "8px", display: "inline-flex" }}>
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
          </label>

          {top && <p className="err" role="alert" style={{ margin: "12px 0" }}>{top}</p>}

          <button className="btn gold wide" disabled={busy || v.code.length < 6} style={{ marginTop: "18px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            {busy ? "Saving new password..." : "Change Password & Log In"} <ArrowRight size={16} />
          </button>

          <div className="auth-links" style={{ justifyContent: "center", marginTop: "14px" }}>
            <span>Didn’t get a code?</span>
            <button type="button" className="lnk" disabled={cool > 0 || busy} onClick={() => send()}>
              {cool > 0 ? `Send again in ${cool}s` : "Send again"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}