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
  const o = (db.owners || []).find(x => x.id === me.ownerId || x.userId === me.id || (me.email && x.email?.toLowerCase() === me.email.toLowerCase())) || {
    id: me.ownerId || me.id || "owner_me",
    userId: me.id,
    name: me.name || `${me.firstName || ''} ${me.lastName || ''}`.trim(),
    firstName: me.firstName || "",
    lastName: me.lastName || "",
    middleInitial: me.middleInitial || "",
    email: me.email || "",
    phone: me.phone || "",
    birthday: me.birthday || "",
    houseStreet: me.houseStreet || me.address?.houseStreet || "",
    country: me.country || me.address?.country || "Philippines",
    state: me.state || me.address?.state || "",
    city: me.city || me.address?.city || "",
    zipCode: me.zipCode || me.address?.zipCode || "",
    address: typeof me.address === "string" && me.address ? me.address : (me.houseStreet ? `${me.houseStreet}, ${me.city}, ${me.state} ${me.zipCode}, ${me.country}` : "")
  };

  const savePhoto = photo => {
    setDb(d => ({
      ...d,
      owners: (d.owners || []).map(x => (x.id === o.id || x.userId === me.id) ? { ...x, photo } : x),
      log: addLog(d, me, photo ? "Owner updated profile picture" : "Owner removed profile picture")
    }));
    say(photo ? "Profile picture saved" : "Profile picture removed");
  };

  return (<>
    <div className="ow-card">
      <h3>Profile picture</h3>
      <p>Shown at the top of your pet portal.</p>
      <PhotoUpload src={o.photo} fallback={(o.name || "U")[0]} size={84} label="Upload picture" onSave={savePhoto} onRemove={() => savePhoto("")} />
    </div>
    <Contact o={o} me={me} setDb={setDb} say={say} />
  </>);
}
export function PasswordBody({ me, say }) {
  const [n, setN] = useState(0);   // bumps after a successful change so the form starts empty
  return <Password key={n} me={me} say={say} onDone={() => setN(n + 1)} />;
}

function Contact({ o, me, setDb, say }) {
  const [email, setEmail] = useState(o.email || "");
  const [phone, setPhone] = useState(o.phone || "");
  const [houseStreet, setHouseStreet] = useState(o.houseStreet || "");
  const [city, setCity] = useState(o.city || "");
  const [state, setState] = useState(o.state || "");
  const [country, setCountry] = useState(o.country || "Philippines");
  const [zipCode, setZipCode] = useState(o.zipCode || "");
  const [address, setAddress] = useState(o.address || "");

  const [srv, setSrv] = useState({});
  const [busy, setBusy] = useState(false);
  const [top, setTop] = useState("");

  const dirty =
    normEmail(email) !== (o.email || "").toLowerCase() ||
    normPhone(phone) !== normPhone(o.phone || "") ||
    clean(houseStreet) !== (o.houseStreet || "") ||
    clean(city) !== (o.city || "") ||
    clean(state) !== (o.state || "") ||
    clean(zipCode) !== (o.zipCode || "") ||
    clean(address) !== (o.address || "");

  const save = async e => {
    e.preventDefault();
    setTop("");
    if (!email) return setTop("Email is required.");
    if (!phone) return setTop("Mobile number is required.");
    setBusy(true);

    const fullAddr = houseStreet && city ? `${houseStreet}, ${city}, ${state} ${zipCode}, ${country}`.replace(/\s+,/g, ",") : (address || o.address);

    try {
      const r = await auth.updateContact({
        email: normEmail(email),
        phone: normPhone(phone),
        address: fullAddr,
        houseStreet,
        city,
        state,
        country,
        zipCode
      });
      const updatedOwner = r?.owner || {
        ...o,
        email,
        phone,
        address: fullAddr,
        houseStreet,
        city,
        state,
        country,
        zipCode
      };
      setDb(p => ({
        ...p,
        owners: (p.owners || []).map(x => (x.id === o.id || x.userId === me.id) ? { ...x, ...updatedOwner } : x)
      }));
      setAddress(fullAddr);
      say("Contact & address details saved successfully!");
    } catch (x) {
      const m = explain(x);
      if (m.fields) setSrv(m.fields);
      else setTop(m.top);
      if (x.expired) say(x.message);
    }
    setBusy(false);
  };

  const formattedBirthday = o.birthday ? new Date(o.birthday + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "Not recorded";

  return (
    <form className="ow-card" onSubmit={save} noValidate>
      <h3>Registration & Account Details</h3>
      <p>Verified profile information from your registration.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
        <Field id="pfn" label="First name" value={o.firstName || o.name?.split(" ")[0] || ""} readOnly hint="Official name on record" />
        <Field id="pln" label="Last name" value={o.lastName || o.name?.split(" ").slice(1).join(" ") || ""} readOnly hint="Official surname on record" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
        <Field id="pmi" label="Middle initial" value={o.middleInitial || "—"} readOnly hint="Optional initial" />
        <Field id="pbday" label="Date of birth" value={formattedBirthday} readOnly hint="Birthdate from registration" />
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        <span style={{ background: "#dcfce7", color: "#166534", padding: "4px 10px", borderRadius: "12px", fontSize: "0.82rem", fontWeight: 600 }}>
          ✓ Email Verified
        </span>
        <span style={{ background: "#dbeafe", color: "#1e40af", padding: "4px 10px", borderRadius: "12px", fontSize: "0.82rem", fontWeight: 600 }}>
          ✓ Mobile Number Verified
        </span>
      </div>

      <h4 style={{ marginTop: 20, marginBottom: 8, fontSize: "1rem", color: "#0b3a5b" }}>Contact Information</h4>
      <Field id="pemail" label="Email address" req type="email" value={email} filter={noSpaces} filterMsg="Spaces aren’t allowed in an email" maxLen={100} onChange={setEmail} error={srv.email} hint="Used for appointment confirmations & notifications" autoComplete="email" />
      <Field id="pphone" label="Mobile number" req type="tel" value={phone} onChange={setPhone} filter={onlyDigitsPlus} filterMsg="Numbers only" inputMode="tel" maxLen={13} error={srv.phone} hint="SMS notifications and verification number" autoComplete="tel" />

      <h4 style={{ marginTop: 20, marginBottom: 8, fontSize: "1rem", color: "#0b3a5b" }}>Registered Address</h4>
      <Field id="phouse" label="House number & street" value={houseStreet} maxLen={120} onChange={setHouseStreet} hint="From registration form" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <Field id="pcity" label="City / Municipality" value={city} maxLen={60} onChange={setCity} hint="City / Municipality" />
        <Field id="pstate" label="State / Province" value={state} maxLen={60} onChange={setState} hint="Province or region" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <Field id="pcountry" label="Country" value={country} maxLen={60} onChange={setCountry} hint="Country" />
        <Field id="pzip" label="ZIP / Postal code" value={zipCode} maxLen={20} onChange={setZipCode} hint="ZIP code" />
      </div>

      <div style={{ marginTop: 8, padding: "8px 12px", background: "#f8fafc", borderRadius: "6px", fontSize: "0.85rem", color: "#475569" }}>
        <b>Full Address: </b>
        {houseStreet || city ? `${houseStreet}, ${city}, ${state} ${zipCode}, ${country}`.replace(/,\s*,/g, ",") : (address || "No address on file")}
      </div>

      {top && <p className="err" role="alert" style={{ marginTop: 12 }}>{top}</p>}
      <div className="row end" style={{ marginTop: 16 }}>
        <button className="btn gold" disabled={!dirty || busy}>
          {busy ? "Saving…" : dirty ? "Save changes" : "No changes yet"}
        </button>
      </div>
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