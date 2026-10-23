import { useState, useEffect, useRef } from "react";
import { SEED, TODAY, addLog } from "./lib.jsx";
import { bindStore } from "./api.js";
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
export default function App() {
  const [db, setDb] = useState(SEED), [me, setMe] = useState(null), [view, setView] = useState("landing"), [role, setRole] = useState(""), [notice, setNotice] = useState(""), [bad, setBad] = useState(false), [flow, setFlow] = useState({});   // flow = { email } for "check your email", { token } for the unlock countdown
  const dbRef = useRef(db); dbRef.current = db;
  useEffect(() => { bindStore(() => dbRef.current, setDb); }, []);   // lets the sign-in "server" (api.js) read and update the same data
  useEffect(() => {
    fetch("/api/state")
      .then(r => r.json())
      .then(res => {
        if (res.success && res.data) {
          setDb(p => ({
            ...p,
            owners: res.data.owners?.length ? res.data.owners : p.owners,
            pets: res.data.pets?.length ? res.data.pets : p.pets,
            appts: res.data.appts?.length ? res.data.appts : p.appts,
            vaccs: res.data.vaccs?.length ? res.data.vaccs : p.vaccs,
            consults: res.data.consults?.length ? res.data.consults : p.consults,
            petRequests: res.data.petRequests?.length ? res.data.petRequests : p.petRequests,
            log: res.data.log?.length ? res.data.log : p.log
          }));
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => { setDb(p => { const late = p.appts.filter(a => ["Scheduled", "Confirmed"].includes(a.status) && a.date < TODAY); if (!late.length) return p; return { ...p, appts: p.appts.map(a => late.includes(a) ? { ...a, status: "No-show" } : a), log: addLog(p, { name: "System" }, `${late.length} past appointment(s) marked No-show`) }; }); }, []);
  /* Log out here and on the server. A message (e.g. idle timeout) sends the person to Log in with that notice. */
  const logout = async msg => { try { await auth.logout(); } catch { /* signed out here either way */ } setMe(null); setNotice(msg || ""); setBad(false); setView(msg ? "login" : "landing"); };
  /* Idle timeout: 15 minutes with no mouse, key or touch activity ends the session. */
  useEffect(() => {
    if (!me) return;
    let t; const reset = () => { clearTimeout(t); t = setTimeout(() => logout("You were logged out after 15 minutes of no activity. Please log in again."), 15 * 60000); };
    const ev = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"]; ev.forEach(e => window.addEventListener(e, reset, { passive: true })); reset();
    return () => { clearTimeout(t); ev.forEach(e => window.removeEventListener(e, reset)); };
  }, [me]);
  const go = v => { setNotice(""); setBad(false); setView(v); };
  const toLogin = (msg, isBad = false) => { setNotice(msg || ""); setBad(isBad); setView("login"); };

  /* Links from the emails: <site>/?verify=TOKEN, <site>/?unlock=TOKEN, and <site>/?invite=TOKEN */
  const openLink = async ({ type, token }) => {
    if (type === "invite") { setFlow({ inviteToken: token }); setNotice(""); setView("staff-setup"); return; }
    if (type === "unlock") { setFlow({ token }); setNotice(""); setView("unlock"); return; }
    try {
      const r = await auth.verifyEmail(token);
      if (r.status !== "ok" && !r.ok) return toLogin("That verification link is invalid or expired. Log in and choose “Resend verification email”.", true);
      const i = await auth.otpInfo();
      if (i.mobileVerified) return toLogin("Email verified. Your mobile number is already verified, so you can log in.");
      setNotice(""); setView("otp");                                   // email link -> mobile code -> log in
    } catch (x) {
      console.error("Verification link error:", x);
      toLogin(x.offline ? OFFLINE_MSG : (x.message || "We couldn’t check that link. Please try again."), true);
    }
  };
  useEffect(() => {
    const q = new URLSearchParams(window.location.search),
          v = q.get("verify") || q.get("token"),
          u = q.get("unlock"),
          inv = q.get("invite"),
          vOk = q.get("verified") === "ok";
    if (!v && !u && !inv && !vOk) return;
    window.history.replaceState(null, "", window.location.pathname);   // the token must not stay in the address bar
    if (vOk) {
      auth.otpInfo().then(i => {
        if (!i.mobileVerified) {
          setNotice("");
          setView("otp");
        } else {
          toLogin("Email verified. Your mobile number is already verified, so you can log in.");
        }
      }).catch(() => {
        setNotice("");
        setView("otp");
      });
      return;
    }
    if (inv) openLink({ type: "invite", token: inv });
    else if (u) openLink({ type: "unlock", token: u });
    else if (v) openLink({ type: "verify", token: v });
  }, []); // eslint-disable-line
  const onLogin = r => { if (r.needsOtp) { setNotice(""); setView("otp"); } else setMe(r.user); };   // password right but mobile not verified yet: ask for the SMS code first

  if (me) return <Portal cfg={CFG[me.role]} me={me} db={db} setDb={setDb} onLogout={() => logout()} />;
  const screen =
    view === "login" ? <Login role={role} notice={notice} bad={bad} onLogin={onLogin} onBack={() => go("landing")} go={go} />
    : view === "staff-setup" ? <StaffSetup token={flow.inviteToken} onDone={r => { if (r.needsOtp) { setNotice(""); setView("otp"); } else setMe(r.user); }} onCancel={() => go("landing")} />
    : view === "register" ? <Register onDone={email => { setFlow({ email }); setView("checkemail"); }} onBack={() => go("landing")} go={go} limited={() => toLogin("Registration limit reached. To prevent bot spam, each IP address can make at most 5 registration attempts per hour. Please try again later, or log in if you already have an account.", true)} />
    : view === "checkemail" ? <CheckEmail email={flow.email} go={go} />
    : view === "otp" ? <Otp onDone={u => u ? setMe(u) : toLogin("Mobile number verified. Please log in to continue.")} onBack={async () => { try { await auth.logout(); } catch { /* nothing to sign out */ } go("login"); }} />
    : view === "unlock" ? <Unlock token={flow.token} onDone={(msg, isBad) => toLogin(msg, isBad)} />
    : view === "forgot" ? <Forgot onBack={() => go("login")} go={go} />
    : <Landing onLogin={r => { setRole(r || ""); setView("login"); }} onRegister={() => setView("register")} />;
  return <>{screen}<DevInbox onOpen={openLink} /></>;
}