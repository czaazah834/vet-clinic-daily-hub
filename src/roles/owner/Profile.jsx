import { useState } from "react";
import { addLog } from "../../lib.jsx";
import { PW_RULES, pwStrength, validateContact, validatePasswordChange, clean, normEmail, normPhone } from "../../validate.js";
import { auth, OFFLINE_MSG } from "../../authApi.js";
import { useLive, Field, onlyDigitsPlus, noSpaces, PhotoUpload } from "./ui.jsx";

const LABEL = ["Too weak", "Okay", "Good", "Strong", "Very strong"], COLOR = ["#c0392b", "#d98e04", "#2f8f5b", "#1b7a43", "#1b7a43"];

/* Turns a server answer into what the form needs: field messages, or one message for the top. */
const explain = x => x.offline ? { top: OFFLINE_MSG } : x.fields ? { fields: x.fields } : { top: x.message || "Something went wrong. Please try again." };

/* Popup bodies (shown inside a Modal from the header menu). */
export function ProfileBody({ db, setDb, me, say }) {
  const o = db.owners.find(x => x.id === me.ownerId);
  if (!o) return <div className="empty">Your owner record couldn’t be found. Please contact the clinic.</div>;
  const savePhoto = photo => { setDb(d => ({ ...d, owners: d.owners.map(x => x.id === o.id && me.ownerId === o.id ? { ...x, photo } : x), log: addLog(d, me, photo ? "Owner updated profile picture" : "Owner removed profile picture") })); say(photo ? "Profile picture saved" : "Profile picture removed"); };
  return (<>
    <div className="ow-card"><h3>Profile picture</h3><p>Shown at the top of every page.</p><PhotoUpload src={o.photo} fallback={o.name[0]} size={84} label="Upload picture" onSave={savePhoto} onRemove={() => savePhoto("")} /></div>
    <Contact o={o} setDb={setDb} say={say} />
  </>);
}
export function PasswordBody({ me, say }) {
  const [n, setN] = useState(0);   // bumps after a successful change so the form starts empty
  return <Password key={n} me={me} say={say} onDone={() => setN(n + 1)} />;
}

function Contact({ o, setDb, say }) {
  const f = useLive({ email: o.email, phone: o.phone, address: o.address }, validateContact), v = f.v;
  const [srv, setSrv] = useState({}), [busy, setBusy] = useState(false), [top, setTop] = useState("");
  const set = (k, x) => { f.set(k, x); if (srv[k]) setSrv(s => ({ ...s, [k]: "" })); };
  const err = k => f.show(k) || srv[k] || "";
  const dirty = normEmail(v.email) !== o.email.toLowerCase() || normPhone(v.phone) !== normPhone(o.phone) || clean(v.address) !== o.address;
  const save = async e => {
    e.preventDefault(); setTop(""); f.submit();
    if (!f.valid || !dirty || busy) return;
    setBusy(true);
    try {
      const r = await auth.updateContact({ email: normEmail(v.email), phone: normPhone(v.phone), address: clean(v.address) });
      setDb(p => ({ ...p, owners: p.owners.map(x => x.id === o.id ? { ...x, ...r.owner } : x) }));   // show what the server saved
      say("Contact details saved");
    } catch (x) { const m = explain(x); if (m.fields) setSrv(m.fields); else setTop(m.top); if (x.expired) say(x.message); }
    setBusy(false);
  };
  return (
    <form className="ow-card" onSubmit={save} noValidate>
      <h3>Contact details</h3><p>The clinic uses these for confirmations and vaccine reminders.</p>
      <Field id="pname" label="Full name" value={o.name} readOnly hint="To change your name, please ask the clinic front desk." />
      <Field id="pemail" label="Email" req type="email" value={v.email} filter={noSpaces} filterMsg="Spaces aren’t allowed in an email" maxLen={100} onChange={x => set("email", x)} onBlur={() => f.blur("email")} error={err("email")} valid={f.ok("email") && !srv.email} hint="The clinic may use this to reach you" autoComplete="email" />
      <Field id="pphone" label="Mobile number" req type="tel" value={v.phone} onChange={x => set("phone", x)} filter={onlyDigitsPlus} filterMsg="Numbers only (a + is allowed at the start)" inputMode="tel" maxLen={13} onBlur={() => f.blur("phone")} error={err("phone")} valid={f.ok("phone")} hint="Numbers only: 09XXXXXXXXX or +639XXXXXXXXX" autoComplete="tel" />
      <Field id="paddr" label="Address" req type="textarea" rows={2} max={120} value={v.address} onChange={x => set("address", x)} onBlur={() => f.blur("address")} error={err("address")} valid={f.ok("address")} hint="Barangay, city / municipality" />
      {top && <p className="err" role="alert">{top}</p>}
      <div className="row end"><button className="btn" disabled={!dirty || busy}>{busy ? "Saving…" : dirty ? "Save changes" : "No changes yet"}</button></div>
    </form>
  );
}

/* The current password is checked by the server. The browser never sees or compares the real one. */
function Password({ me, say, onDone }) {
  const [show, setShow] = useState(false), [srv, setSrv] = useState({}), [busy, setBusy] = useState(false), [top, setTop] = useState("");
  const f = useLive({ cur: "", next: "", conf: "" }, v => validatePasswordChange(v, me.username || "")), v = f.v;
  const set = (k, x) => { f.set(k, x); if (srv[k]) setSrv(s => ({ ...s, [k]: "" })); };
  const t = show ? "text" : "password", s = pwStrength(v.next), rulesOk = PW_RULES.every(([r]) => r(v.next));
  const save = async e => {
    e.preventDefault(); setTop(""); f.submit();
    if (!f.valid || busy) return;
    setBusy(true);
    try { await auth.changePassword({ cur: v.cur, next: v.next, conf: v.conf }); say("Password changed. Use it next time you log in"); onDone(); return; }
    catch (x) { const m = explain(x); if (m.fields) setSrv(m.fields); else setTop(m.top); if (x.expired) say(x.message); }
    setBusy(false);
  };
  return (
    <form className="ow-card ow-pw" onSubmit={save} noValidate>
      <h3>Change password</h3><p>Pick something you don’t use anywhere else.</p>
      <Field id="pcur" label="Current password" req type={t} value={v.cur} onChange={x => set("cur", x)} onBlur={() => f.blur("cur")} error={f.show("cur", false) || srv.cur || ""} valid={f.ok("cur") && !srv.cur} hint="The password you use to log in" autoComplete="current-password" />
      <Field id="pnext" label="New password" req type={t} value={v.next} filter={noSpaces} filterMsg="Spaces aren’t allowed in passwords" maxLen={72} onChange={x => set("next", x)} onBlur={() => f.blur("next")} error="" valid={f.ok("next")} autoComplete="new-password" />
      <ul className="ow-req" aria-label="Password requirements">{PW_RULES.map(([r, l]) => <li key={l} className={r(v.next) ? "y" : "n"}>{r(v.next) ? "✓" : "○"} {l}</li>)}</ul>
      {v.next && <><div className="ow-meter"><i style={{ width: `${s * 25}%`, background: COLOR[s] }} /></div><span className="ow-hint">Strength: {LABEL[s]}</span></>}
      {rulesOk && (f.show("next") || srv.next) && <span className="err">{f.show("next") || srv.next}</span>}
      <Field id="pconf" label="Retype new password" req type={t} value={v.conf} filter={noSpaces} filterMsg="Spaces aren’t allowed in passwords" maxLen={72} onChange={x => set("conf", x)} onBlur={() => f.blur("conf")} error={f.show("conf", !v.next.startsWith(v.conf) || v.conf.length > v.next.length) || srv.conf || ""} valid={f.ok("conf")} hint="Type the new password again" autoComplete="new-password" />
      <label className="chk"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> Show passwords</label>
      {top && <p className="err" role="alert">{top}</p>}
      <div className="row end"><button className="btn" disabled={busy}>{busy ? "Saving…" : "Change password"}</button></div>
    </form>
  );
}