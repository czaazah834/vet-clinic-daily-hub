import { useState, useEffect, useRef } from "react";
import { Logo, I } from "../lib.jsx";
import { validateCode } from "../validate.js";
import { useLive } from "../roles/owner/ui.jsx";
import { auth, OFFLINE_MSG } from "../authApi.js";
import OtpBoxInput from "./OtpBoxInput.jsx";
import {
  Mail,
  CheckCircle2,
  Smartphone,
  ArrowRight,
  RotateCcw,
  ExternalLink,
  ShieldCheck,
  Copy,
  Check,
  Sparkles,
  Lock,
  ArrowLeft
} from "lucide-react";
import "./auth.css";
import "./brand.css";

/* ---------- 1. "Check your email" after registering ---------- */
export function CheckEmail({ email, go }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [cool, setCool] = useState(30);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (cool <= 0) return;
    const t = setTimeout(() => setCool((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cool]);

  const copyEmail = () => {
    if (!email) return;
    navigator.clipboard?.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resend = async () => {
    if (busy || cool > 0) return;
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      await auth.resendVerification(email);
      setMsg("A fresh verification link has been sent to your email!");
      setCool(30);
    } catch (x) {
      setErr(x.offline ? OFFLINE_MSG : x.message || "Please try again.");
    }
    setBusy(false);
  };

  const domain = (email || "").split("@")[1]?.toLowerCase() || "";
  const isGmail = domain.includes("gmail");
  const isOutlook = domain.includes("outlook") || domain.includes("hotmail");
  const isYahoo = domain.includes("yahoo");

  return (
    <div className="lg auth cardl">
      <aside className="lgl photo">
        <div className="brandrow">
          <Logo size={28} />
          <span>PawCare</span>
        </div>
        <div className="cap">
          <h1>
            Almost <em>there!</em>
          </h1>
          <p>Verify your email address, then enter your mobile security code to activate your account.</p>
        </div>
      </aside>

      <div className="auth-verify-card">
        {/* Step Tracker */}
        <div className="verify-steps">
          <span className="verify-step-pill done">
            <CheckCircle2 size={13} /> 1. Registered
          </span>
          <span className="verify-step-sep">›</span>
          <span className="verify-step-pill active">
            <Mail size={13} /> 2. Verify Email
          </span>
          <span className="verify-step-sep">›</span>
          <span className="verify-step-pill">
            <Smartphone size={13} /> 3. Mobile Code
          </span>
        </div>

        {/* Animated Envelope Graphic */}
        <div className="envelope-badge-wrap">
          <div className="envelope-pulse-bg" />
          <div className="envelope-icon-box">
            <Mail size={32} />
          </div>
          <div className="envelope-paw-tag">🐾</div>
        </div>

        <h2>Check your inbox</h2>
        <p className="card-subtitle">
          We sent a secure verification link to activate your PawCare portal account.
        </p>

        {/* User Email Pill with Copy */}
        <div className="user-email-pill" title="Click to copy email address">
          <span>{email || "your email address"}</span>
          <button type="button" onClick={copyEmail} aria-label="Copy email address">
            {copied ? <Check size={14} color="#059669" /> : <Copy size={14} />}
          </button>
        </div>

        {/* 1-Click Webmail Quick Launchers */}
        <div className="webmail-shortcuts" aria-label="Quick email access">
          {isGmail && (
            <a
              href="https://mail.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="webmail-btn"
              style={{ borderColor: "#ea4335", color: "#c5221f" }}
            >
              <ExternalLink size={14} /> Open Gmail
            </a>
          )}
          {isOutlook && (
            <a
              href="https://outlook.live.com"
              target="_blank"
              rel="noopener noreferrer"
              className="webmail-btn"
              style={{ borderColor: "#0078d4", color: "#005a9e" }}
            >
              <ExternalLink size={14} /> Open Outlook
            </a>
          )}
          {isYahoo && (
            <a
              href="https://mail.yahoo.com"
              target="_blank"
              rel="noopener noreferrer"
              className="webmail-btn"
              style={{ borderColor: "#6001d2", color: "#5000b8" }}
            >
              <ExternalLink size={14} /> Open Yahoo Mail
            </a>
          )}
          {!isGmail && !isOutlook && !isYahoo && (
            <>
              <a href="https://mail.google.com" target="_blank" rel="noopener noreferrer" className="webmail-btn">
                <ExternalLink size={13} /> Gmail
              </a>
              <a href="https://outlook.live.com" target="_blank" rel="noopener noreferrer" className="webmail-btn">
                <ExternalLink size={13} /> Outlook
              </a>
              <a href="https://mail.yahoo.com" target="_blank" rel="noopener noreferrer" className="webmail-btn">
                <ExternalLink size={13} /> Yahoo
              </a>
            </>
          )}
        </div>

        {/* Status / Error alerts */}
        {msg && <p className="okm" role="status" style={{ margin: "10px 0" }}>{msg}</p>}
        {err && <p className="err" role="alert" style={{ margin: "10px 0" }}>{err}</p>}

        {/* Tips Guidance Box */}
        <div className="verify-tips-box">
          <b><Sparkles size={14} color="#f59e0b" /> What to expect:</b>
          <ul>
            <li>Click the <b>“Verify My Account”</b> button inside the email.</li>
            <li>Can’t find it? Check your <b>Spam or Junk</b> folder.</li>
            <li>The email link stays valid for <b>24 hours</b>.</li>
          </ul>
        </div>

        {/* Resend Action */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "14px" }}>
          <button
            type="button"
            className="btn ghost wide"
            disabled={cool > 0 || busy}
            onClick={resend}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
          >
            <RotateCcw size={15} />
            {busy ? "Sending..." : cool > 0 ? `Resend email in ${cool}s` : "Resend verification email"}
          </button>

          <button
            type="button"
            className="btn gold wide"
            onClick={() => go("login")}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
          >
            Back to Log in <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 2. Mobile code (OTP) with 6 Boxes ---------- */
export function Otp({ onDone, onBack, enabled = true }) {
  const f = useLive({ code: "" }, validateCode);
  const [phone, setPhone] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [n, setN] = useState(60);
  const verifying = useRef(false);

  const fail = (x) => setErr(x.offline ? OFFLINE_MSG : x.message || "Something went wrong. Please try again.");

  const send = async (first = false) => {
    setErr("");
    setInfo("");
    try {
      await auth.otpSend();
      setReady(true);
      setN(60);
      if (!first) setInfo("A new 6-digit SMS security code was sent to your phone.");
    } catch (x) {
      fail(x);
    }
  };

  const started = useRef(false);
  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    (async () => {
      try {
        const i = await auth.otpInfo();
        if (i.mobileVerified) return onDone(); // already verified
        if (!i.hasActiveOtp) await auth.otpSend();
        if (i.phone) setPhone(i.phone);
        setReady(true);
        setN(60);
      } catch (x) {
        fail(x);
        setN(0);
      }
    })();
  }, [enabled]); // eslint-disable-line

  useEffect(() => {
    if (!enabled || n <= 0) return;
    const t = setTimeout(() => setN((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [n, enabled]);

  const handleVerify = async (codeToVerify) => {
    const code = (codeToVerify || f.v.code || "").trim();
    if (!enabled || !ready || code.length !== 6 || verifying.current) return;
    verifying.current = true;
    setBusy(true);
    setErr("");
    setInfo("");
    try {
      await auth.otpVerify(code);
      await onDone();
      return;
    } catch (x) {
      fail(x);
    }
    verifying.current = false;
    setBusy(false);
  };

  const submit = async (e) => {
    e && e.preventDefault();
    handleVerify(f.v.code);
  };

  // Mask phone for security: e.g. "+63 917 123 4567" -> "+63 917 ••• ••67"
  const maskPhone = (raw) => {
    if (!raw) return "your registered mobile number";
    const s = String(raw).trim();
    if (s.length < 7) return s;
    return s.slice(0, 6) + " ••• ••" + s.slice(-2);
  };

  return (
    <div className="lg auth cardl">
      <aside className="lgl photo">
        <div className="brandrow">
          <Logo size={28} />
          <span>PawCare</span>
        </div>
        <div className="cap">
          <h1>
            Security <em>Verification</em>
          </h1>
          <p>Verify your registered mobile number to finish setting up your account.</p>
        </div>
      </aside>

      <form className="auth-verify-card" onSubmit={submit} noValidate>
        {/* Step Tracker */}
        <div className="verify-steps">
          <span className="verify-step-pill done">
            <CheckCircle2 size={13} /> 1. Email Verified
          </span>
          <span className="verify-step-sep">›</span>
          <span className="verify-step-pill active">
            <Smartphone size={13} /> 2. Mobile OTP
          </span>
          <span className="verify-step-sep">›</span>
          <span className="verify-step-pill">
            <Sparkles size={13} /> 3. Log in
          </span>
        </div>

        {/* Security Badge */}
        <div className="envelope-badge-wrap">
          <div className="envelope-pulse-bg" />
          <div className="envelope-icon-box" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)" }}>
            <ShieldCheck size={34} />
          </div>
          <div className="envelope-paw-tag">📱</div>
        </div>

        <h2>Enter 6-digit code</h2>
        <p className="card-subtitle">
          {ready ? <>Code sent to <b>{maskPhone(phone)}</b>. It stays valid for 10 minutes.</> : "Use the 6-digit SMS code sent to your registered mobile number."}
        </p>

        {/* 6 Individual OTP Boxes */}
        <OtpBoxInput
          value={f.v.code}
          onChange={(newCode) => {
            f.set("code", newCode);
            setErr("");
          }}
          hasError={!!err}
          disabled={!enabled || !ready || busy}
          autoFocus={true}
          onComplete={(fullCode) => {
            // Automatically attempt verification when all 6 digits are typed!
            handleVerify(fullCode);
          }}
        />

        {info && <p className="okm" role="status" style={{ margin: "10px 0" }}>{info}</p>}
        {err && <p className="err" role="alert" style={{ margin: "10px 0" }}>{err}</p>}

        <button
          type="submit"
          className="btn gold wide"
          disabled={busy || !ready || f.v.code.length < 6}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", margin: "18px 0 10px" }}
        >
          {busy ? "Verifying code..." : "Verify mobile number"} <ArrowRight size={17} />
        </button>

        <div className="auth-links" style={{ justifyContent: "space-between", marginTop: "14px" }}>
          <button type="button" className="lnk" onClick={onBack} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <ArrowLeft size={14} /> Back to log in
          </button>

          <button
            type="button"
            className="lnk"
            disabled={!enabled || n > 0 || busy}
            onClick={() => send(false)}
            style={{ fontWeight: 600, color: n > 0 ? "#94a3b8" : "#2563eb" }}
          >
            {n > 0 ? `Resend SMS in ${n}s` : "Resend SMS code"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------- 3. Unlock link: 2-minute cooling countdown ---------- */
export function Unlock({ token, onDone }) {
  const [wait, setWait] = useState(null);
  const [left, setLeft] = useState(0);
  const [err, setErr] = useState("");

  const check = async () => {
    try {
      const r = await auth.unlock(token);
      if (r.status === "ok") return onDone("Account unlocked. You can log in now.");
      if (r.status === "wait") return setWait({ s: r.seconds, at: Date.now() });
      onDone("That unlock link is invalid or expired. Try logging in again to get a new one.", true);
    } catch (x) {
      setErr(x.offline ? OFFLINE_MSG : x.message || "We couldn’t check that link. Please try again.");
    }
  };

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    check();
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!wait) return;
    const end = wait.at + wait.s * 1000;
    const tick = () => {
      const l = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(l);
      if (!l) {
        clearInterval(id);
        setWait(null);
        check();
      }
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, [wait]); // eslint-disable-line

  return (
    <div className="lg auth cardl">
      <aside className="lgl photo">
        <div className="brandrow">
          <Logo size={28} />
          <span>PawCare</span>
        </div>
        <div className="cap">
          <h1>
            Account <em>Protection</em>
          </h1>
          <p>For your security, locked accounts require a short cooling period before re-activating.</p>
        </div>
      </aside>

      <div className="auth-verify-card">
        <div className="envelope-badge-wrap">
          <div className="envelope-pulse-bg" />
          <div className="envelope-icon-box" style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)" }}>
            <Lock size={32} />
          </div>
          <div className="envelope-paw-tag">🛡️</div>
        </div>

        <h2>Cooling Period Active</h2>

        {err ? (
          <p className="err" role="alert">{err}</p>
        ) : wait ? (
          <>
            <p className="card-subtitle">
              Cooling period in progress. Your account will automatically unlock when the timer finishes:
            </p>
            <div
              style={{
                fontSize: "46px",
                fontWeight: 800,
                color: "var(--navy)",
                letterSpacing: "0.04em",
                fontVariantNumeric: "tabular-nums",
                margin: "12px 0 16px"
              }}
            >
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
            </div>
            <p className="auth-fine" style={{ marginBottom: "20px" }}>
              Please keep this page open. It will automatically redirect once unlocked.
            </p>
          </>
        ) : (
          <p className="card-subtitle">Verifying security token...</p>
        )}

        <button
          type="button"
          className="btn ghost wide"
          onClick={() => onDone("")}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
        >
          <ArrowLeft size={16} /> Return to Log in
        </button>
      </div>
    </div>
  );
}
