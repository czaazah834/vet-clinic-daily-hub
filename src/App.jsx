import { useState, useEffect, useRef } from "react";
import { clinicRequest } from "./clinicApi.js";
import { emptyClinicState, applyClinicState } from "./clinicState.js";
import { bindStore, setSessionUser } from "./api.js";
import { auth, OFFLINE_MSG } from "./authApi.js";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Forgot from "./pages/Forgot.jsx";
import { CheckEmail, Otp, Unlock } from "./pages/Verify.jsx";
import StaffSetup from "./pages/StaffSetup.jsx";
import DevInbox from "./pages/DevInbox.jsx";
import Portal from "./Portal.jsx";
import { admin } from "./roles/Admin.jsx";
import { vet } from "./roles/Vet.jsx";
import { assistant } from "./roles/Assistant.jsx";
import { owner } from "./roles/Owner.jsx";
const CFG = { admin, vet, assistant, owner };

function getInitialView() {
  if (typeof window === "undefined") return "landing";
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("verify") || q.get("token")) return "otp";
    if (q.get("verified") === "ok" || q.get("otp")) return "otp";
    if (q.has("verified")) return "login";
    if (q.get("unlock")) return "unlock";
    if (q.get("invite")) return "staff-setup";
  } catch (_) {}
  return "landing";
}

// Display-only snapshot: backend API remains the authority for authenticated access.
// Saved in this tab only, so F5 does not flash a full-page authentication screen.
const SESSION_USER_KEY = "pawcare_last_session_user";
function getCachedUser() {
  if (typeof window === "undefined" || getInitialView() !== "landing") return null;
  try {
    const token = localStorage.getItem("pawcare_token") || sessionStorage.getItem("pawcare_token");
    if (!token) return null;
    const saved = JSON.parse(sessionStorage.getItem(SESSION_USER_KEY) || "null");
    return saved && saved.id != null && typeof saved.name === "string" &&
      typeof saved.role === "string" && CFG[saved.role] ? saved : null;
  } catch (_) { return null; }
}
function saveCachedUser(user) {
  try {
    if (user && user.id != null && typeof user.name === "string" && CFG[user.role]) {
      sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify({ id: user.id, name: user.name, role: user.role }));
    } else sessionStorage.removeItem(SESSION_USER_KEY);
  } catch (_) { /* storage may be disabled */ }
}

export default function App() {
  const [db, setDb] = useState(emptyClinicState), [me, setMe] = useState(getCachedUser), [restoring, setRestoring] = useState(() => !getCachedUser()), [view, setView] = useState(getInitialView), [role, setRole] = useState(""), [notice, setNotice] = useState(""), [bad, setBad] = useState(false), [flow, setFlow] = useState({});   // flow = { email } for "check your email", { token } for the unlock countdown
  const [clinicError, setClinicError] = useState("");
  const [otpEnabled, setOtpEnabled] = useState(() => getInitialView() !== "otp");
  const dbRef = useRef(db); dbRef.current = db;
  useEffect(() => { bindStore(() => dbRef.current, setDb); }, []);
  // Restore an existing SERVER-VALIDATED session on reload. Never trust a saved user/role.
  // Verification, invite and password recovery URLs must keep their own screens.
  useEffect(() => {
    let active = true;
    const specialLink = getInitialView() !== "landing";
    if (specialLink) { setRestoring(false); return; }
    auth.me()
      .then(result => {
        if (!active) return;
        if (result?.user?.role && CFG[result.user.role]) {
          setMe(result.user);
          saveCachedUser(result.user);
          setSessionUser(result.user);
        }
        else { setMe(null); saveCachedUser(null); setSessionUser(null); setView("login"); }
      })
      .catch(error => {
        if (!active) return;
        if (error.status === 401 || error.status === 403) { setMe(null); saveCachedUser(null); setView("login"); }
        // No stored session: normal landing. A temporary server failure: allow retry.
        if (error.status !== 401 && error.status !== 403 &&
            (localStorage.getItem("pawcare_token") || sessionStorage.getItem("pawcare_token"))) {
          setMe(null); saveCachedUser(null);
          setNotice("Could not restore your session. Check your connection and log in again if needed.");
          setBad(true);
          setView("login");
        }
      })
      .finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, []);
  // Sync only authenticated records; empty results clear stale and demo data.
  useEffect(() => {
    if (!me || restoring) return;
    let active = true;
    const syncState = async () => {
      try {
        const remote = await clinicRequest("GET", "/api/state");
        if (!active) return;
        setDb(p => applyClinicState(p, remote));
        setClinicError("");
      } catch (error) {
        if (!active) return;
        if (error.status === 401 || error.status === 403) {
          setDb(emptyClinicState()); setMe(null); saveCachedUser(null); setSessionUser(null);
          setNotice("Your session has ended. Please log in again."); setBad(true); setView("login");
        } else setClinicError("Clinic connection unavailable. Displayed records may be out of date. Changes require a successful server save.");
      }
    };
    syncState();
    const interval = setInterval(syncState, 3000);
    window.addEventListener("focus", syncState);
    return () => { active = false; clearInterval(interval); window.removeEventListener("focus", syncState); };
  }, [me?.id, me?.role, restoring]);
  /* Log out here and on the server. A message (e.g. idle timeout) sends the person to Log in with that notice. */
  const logout = async msg => { try { await auth.logout(); } catch { /* signed out here either way */ } try { localStorage.removeItem("pawcare_token"); sessionStorage.removeItem("pawcare_token"); } catch (_) {} setDb(emptyClinicState()); setClinicError(""); setMe(null); saveCachedUser(null); setSessionUser(null); window.history.replaceState(null, "", window.location.pathname); setNotice(msg || ""); setBad(false); setView(msg ? "login" : "landing"); };
  /* Work Shift Session Timeout: 8 hours (standard full clinic shift) */
  useEffect(() => {
    if (!me) return;
    let t;
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(() => logout("Your session ended after 8 hours of inactivity. Please log in again."), 8 * 60 * 60 * 1000);
    };
    const ev = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    ev.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { clearTimeout(t); ev.forEach(e => window.removeEventListener(e, reset)); };
  }, [me]);
  const go = v => { setNotice(""); setBad(false); setView(v); };
  const enterOtp = () => { window.history.replaceState(null, "", `${window.location.pathname}?otp=1`); setOtpEnabled(true); setView("otp"); };
  const toLogin = (msg, isBad = false) => { window.history.replaceState(null, "", window.location.pathname); setNotice(msg || ""); setBad(isBad); setView("login"); };

  /* Links from the emails: <site>/?verify=TOKEN, <site>/?unlock=TOKEN, and <site>/?invite=TOKEN */
  const openLink = async ({ type, token }) => {
    if (type === "invite") { setFlow({ inviteToken: token }); setNotice(""); setView("staff-setup"); return; }
    if (type === "unlock") { setFlow({ token }); setNotice(""); setView("unlock"); return; }
    setMe(null);
    saveCachedUser(null);
    setSessionUser(null);
    setOtpEnabled(false);
    setView("otp");
    try {
      const r = await auth.verifyEmail(token);
      if (r && (r.status === "ok" || r.ok)) {
        if (r.mobileVerified) return logout("Account already verified. Please log in.");
        setNotice("");
        enterOtp();
        return;
      }
      toLogin("That verification link is invalid or expired. Request a new verification email.", true);
    } catch (x) {
      toLogin(x.offline ? OFFLINE_MSG : (x.message || "We couldn’t check that link. Please try again."), true);
    }
  };
  useEffect(() => {
    const q = new URLSearchParams(window.location.search),
          v = q.get("verify") || q.get("token"),
          u = q.get("unlock"),
          inv = q.get("invite"),
          vOk = q.get("verified") === "ok" || q.get("otp");
    if (!v && !u && !inv && !vOk && !q.has("verified")) return;
    window.history.replaceState(null, "", window.location.pathname);   // the token must not stay in the address bar
    if (q.has("verified") && q.get("verified") !== "ok") {
      toLogin("That verification link is invalid or expired. Request a new verification email.", true);
      return;
    }
    if (vOk) {
      auth.otpInfo().then(i => {
        if (!i.mobileVerified) {
          setNotice("");
          enterOtp();
        } else {
          logout("Account already verified. Please log in.");
        }
      }).catch(x => toLogin(x.message || "Open your verification email to continue.", true));
      return;
    }
    if (inv) openLink({ type: "invite", token: inv });
    else if (u) openLink({ type: "unlock", token: u });
    else if (v) openLink({ type: "verify", token: v });
  }, []); // eslint-disable-line
  const onLogin = r => { if (r.needsOtp) { setNotice(""); enterOtp(); } else { setMe(r.user); saveCachedUser(r.user); } };   // password right but mobile not verified yet: ask for the SMS code first

  // Render the normal app instead of an intrusive full-screen restoring view.
  if (me) return <>{clinicError && <div role="alert" style={{ padding: "12px 20px", background: "#fff7ed", color: "#9a3412" }}>{clinicError}</div>}<Portal cfg={CFG[me.role]} me={me} db={db} setDb={setDb} onLogout={() => logout()} /></>;
  const screen =
    view === "login" ? <Login role={role} notice={notice} bad={bad} onLogin={onLogin} onBack={() => go("landing")} go={go} />
    : view === "staff-setup" ? <StaffSetup token={flow.inviteToken} onDone={r => { if (r.needsOtp) { setNotice(""); enterOtp(); } else { setMe(r.user); saveCachedUser(r.user); } }} onCancel={() => go("landing")} />
    : view === "register" ? <Register onDone={email => { setFlow({ email }); setView("checkemail"); }} onBack={() => go("landing")} go={go} limited={() => toLogin("Registration limit reached. To prevent bot spam, each IP address can make at most 5 registration attempts per hour. Please try again later, or log in if you already have an account.", true)} />
    : view === "checkemail" ? <CheckEmail email={flow.email} go={go} />
    : view === "otp" ? <Otp enabled={otpEnabled} onDone={() => logout("Account verified successfully. Please log in to continue.")} onBack={() => logout("Log in to continue verification.")} />
    : view === "unlock" ? <Unlock token={flow.token} onDone={(msg, isBad) => toLogin(msg, isBad)} />
    : view === "forgot" ? <Forgot onBack={() => go("login")} go={go} />
    : <Landing onLogin={r => { setRole(r || ""); setView("login"); }} onRegister={() => setView("register")} />;
  return <>{screen}<DevInbox onOpen={openLink} /></>;
}