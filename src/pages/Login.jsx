import { useState } from "react";
import { Logo, I, ROLES } from "../lib.jsx";
import { validateLogin } from "../validate.js";
import { useLive } from "../roles/owner/ui.jsx";
import { auth, OFFLINE_MSG } from "../authApi.js";
import "./auth.css";

const Eye = ({ off }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {off ? (
      <>
        <path d="M17.94 17.94A10.9 10.9 0 0 1 12 19C5 19 1 12 1 12a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
        <path d="M1 1l22 22" />
      </>
    ) : (
      <>
        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </svg>
);

const DEMO = {
  admin: ["admin@pawcare.com", "Admin123"],
  vet: ["vet@pawcare.com", "Vet12345"],
  assistant: ["assistant@pawcare.com", "Assist123"],
  owner: ["maria@example.com", "Owner123"],
};

export default function Login({ role, notice, bad, onLogin, onBack, go }) {
  const f = useLive({ email: "", password: "" }, validateLogin);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [top, setTop] = useState("");
  const [rv, setRv] = useState("");
  const [unver, setUnver] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setTop("");
    setRv("");
    setUnver(false);
    f.submit();
    if (!f.valid || busy) return;
    setBusy(true);
    try {
      const r = await auth.login(f.v.email.trim(), f.v.password);
      onLogin(r);
      return;
    } catch (x) {
      setUnver(!!x.unverified);
      setTop(x.offline ? OFFLINE_MSG : x.message || "Invalid email or password.");
    }
    setBusy(false);
  };

  const resend = async () => {
    setRv("");
    try {
      await auth.resendVerification(f.v.email.trim());
      setTop("");
      setUnver(false);
      setRv("If that account is unverified, a new link was sent. Check your inbox.");
    } catch (x) {
      setTop(x.offline ? OFFLINE_MSG : x.message || "Please try again.");
    }
  };

  const title = role ? `Log in · ${ROLES[role][0]}` : "Log in";

  return (
    <div className="lg auth">
      <aside className="lgl">
        <Logo size={72} />
        <h1>Welcome back to PawCare</h1>
        <p>Sign in to open your portal. Each role sees its own tools.</p>
        <div className="lart sm" aria-hidden="true">
          <span><I e="🐶" size={40} /></span>
          <span><I e="🐱" size={40} /></span>
          <span><I e="🐰" size={40} /></span>
        </div>
      </aside>
      <form className="lgr" onSubmit={submit} noValidate>
        <button type="button" className="lnk" onClick={onBack}>
          ← Back to home
        </button>
        <h2>{title}</h2>
        {notice && <p className={`auth-note${bad ? " bad" : ""}`} role="status">{notice}</p>}

        <div className="fld">
          <label htmlFor="login-email">
            Email<i> *</i>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              value={f.v.email}
              className={f.show("email", false) ? "bad" : ""}
              onChange={(e) => f.set("email", e.target.value)}
              onBlur={() => f.blur("email")}
            />
          </label>
          <span className="err">{f.show("email", false)}</span>
        </div>

        <div className="fld">
          <label htmlFor="login-password">
            Password<i> *</i>
            <div className="pw">
              <input
                id="login-password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                value={f.v.password}
                className={f.show("password", false) ? "bad" : ""}
                onChange={(e) => f.set("password", e.target.value)}
                onBlur={() => f.blur("password")}
              />
              <button
                type="button"
                className="eye"
                aria-label={show ? "Hide password" : "Show password"}
                aria-pressed={show}
                onClick={() => setShow(!show)}
              >
                <Eye off={show} />
              </button>
            </div>
          </label>
          <span className="err">{f.show("password", false)}</span>
        </div>

        <div className="auth-row">
          <label className="chk">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show password
          </label>
          <button type="button" className="lnk" onClick={() => go("forgot")}>
            Forgot password?
          </button>
        </div>

        {top && (
          <p className="err" role="alert">
            {top}
            {unver && (
              <>
                {" "}
                <button type="button" className="lnk" onClick={resend}>
                  Resend verification email
                </button>
              </>
            )}
          </p>
        )}
        {rv && <p className="okm" role="status" style={{ color: "var(--ok, #16a34a)" }}>{rv}</p>}

        <button className="btn gold wide" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
        <p className="auth-alt">
          New pet owner? <button type="button" className="lnk" onClick={() => go("register")}>Create an account</button>
        </p>
        <p className="auth-fine">Clinic staff accounts are created by the clinic administrator.</p>

        {import.meta.env.DEV && (
          <div className="demo">
            <p>Demo accounts (dev only, click to fill):</p>
            <div className="chips">
              {Object.entries(DEMO).map(([r, [em, pw]]) => (
                <button
                  type="button"
                  key={r}
                  className="btn ghost sm"
                  onClick={() => {
                    f.patch({ email: em, password: pw });
                  }}
                >
                  {ROLES[r][0]}
                </button>
              ))}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}