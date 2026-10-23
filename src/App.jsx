import { useState, useEffect, useRef } from "react";
import { SEED, TODAY, addLog } from "./lib.jsx";
import { bindStore } from "./api.js";
import { auth } from "./authApi.js";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Forgot from "./pages/Forgot.jsx";
import Portal from "./Portal.jsx";
import { admin } from "./roles/Admin.jsx";
import { vet } from "./roles/Vet.jsx";
import { assistant } from "./roles/Assistant.jsx";
import { owner } from "./roles/Owner.jsx";
const CFG = { admin, vet, assistant, owner };
export default function App() {
  const [db, setDb] = useState(SEED), [me, setMe] = useState(null), [view, setView] = useState("landing"), [role, setRole] = useState(""), [notice, setNotice] = useState("");
  const dbRef = useRef(db); dbRef.current = db;
  useEffect(() => { bindStore(() => dbRef.current, setDb); }, []);   // lets the sign-in "server" (api.js) read and update the same data
  useEffect(() => { setDb(p => { const late = p.appts.filter(a => ["Scheduled", "Confirmed"].includes(a.status) && a.date < TODAY); if (!late.length) return p; return { ...p, appts: p.appts.map(a => late.includes(a) ? { ...a, status: "No-show" } : a), log: addLog(p, { name: "System" }, `${late.length} past appointment(s) marked No-show`) }; }); }, []);
  /* Log out here and on the server. A message (e.g. idle timeout) sends the person to Log in with that notice. */
  const logout = async msg => { try { await auth.logout(); } catch { /* signed out here either way */ } setMe(null); setNotice(msg || ""); setView(msg ? "login" : "landing"); };
  /* Idle timeout: 15 minutes with no mouse, key or touch activity ends the session. */
  useEffect(() => {
    if (!me) return;
    let t; const reset = () => { clearTimeout(t); t = setTimeout(() => logout("You were logged out after 15 minutes of no activity. Please log in again."), 15 * 60000); };
    const ev = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"]; ev.forEach(e => window.addEventListener(e, reset, { passive: true })); reset();
    return () => { clearTimeout(t); ev.forEach(e => window.removeEventListener(e, reset)); };
  }, [me]);
  const go = v => { setNotice(""); setView(v); };
  if (me) return <Portal cfg={CFG[me.role]} me={me} db={db} setDb={setDb} onLogout={() => logout()} />;
  if (view === "login") return <Login role={role} notice={notice} onLogin={setMe} onBack={() => go("landing")} go={go} />;
  if (view === "register") return <Register onDone={setMe} onBack={() => go("landing")} go={go} />;
  if (view === "forgot") return <Forgot onBack={() => go("login")} go={go} />;
  return <Landing onLogin={r => { setRole(r || ""); setView("login"); }} onRegister={() => setView("register")} />;
}