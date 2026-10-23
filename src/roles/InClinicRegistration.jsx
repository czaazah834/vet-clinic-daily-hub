import { useState } from "react";
import { uid, TODAY, plus, addLog, ICON } from "../lib.jsx";
import { outbox } from "../devOutbox.js";
import { clean, normEmail, normPhone } from "../validate.js";

const rndToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, "0")).join("");

export default function InClinicRegistration({ db, setDb, me, onClose, onRegistered }) {
  const [f, setF] = useState({
    // Owner details
    name: "",
    phone: "",
    email: "",
    address: "",
    // Pet details
    petName: "",
    species: "Dog",
    breed: "",
    sex: "Male",
    birth: plus(-365),
    weight: "5.0",
    // Queue / appointment option
    addToQueue: true,
    reason: "General Consultation / Walk-in",
  });

  const [errs, setErrs] = useState({});
  const [success, setSuccess] = useState(null);

  const set = (k, v) => {
    setF(p => ({ ...p, [k]: v }));
    if (errs[k]) setErrs(p => ({ ...p, [k]: "" }));
  };

  const validateForm = () => {
    const e = {};
    if (!clean(f.name)) e.name = "Owner full name is required";
    else if (clean(f.name).length < 2) e.name = "Name must be at least 2 characters";

    if (!f.phone.trim()) e.phone = "Contact number is required";
    if (!f.email.trim()) e.email = "Email address is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "Enter a valid email address";
    else if (db.owners.some(o => o.email.toLowerCase() === f.email.trim().toLowerCase())) {
      e.email = "An owner with this email already exists";
    }

    if (!clean(f.address)) e.address = "Address is required";

    if (!clean(f.petName)) e.petName = "Pet name is required";
    if (!f.species) e.species = "Select animal species";
    if (!f.birth) e.birth = "Birth date is required";
    if (!f.weight || isNaN(+f.weight) || +f.weight <= 0) e.weight = "Valid weight in kg required";

    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (ev) => {
    ev.preventDefault();
    if (!validateForm()) return;

    const ownerId = "o" + uid();
    const petId = "p" + uid();
    const userId = "u" + uid();
    const token = rndToken();

    const owner = {
      id: ownerId,
      name: clean(f.name),
      email: normEmail(f.email),
      phone: normPhone(f.phone),
      address: clean(f.address),
    };

    const pet = {
      id: petId,
      ownerId: ownerId,
      name: clean(f.petName),
      species: f.species,
      breed: clean(f.breed) || "Mixed Breed",
      sex: f.sex,
      birth: f.birth,
      weight: +f.weight,
      allergies: [],
      notes: "Registered in-clinic by front desk.",
      weights: [{ date: TODAY, kg: +f.weight, by: "clinic" }],
    };

    const user = {
      id: userId,
      name: owner.name,
      email: owner.email,
      username: owner.email,
      password: "TempPassword123!",
      role: "owner",
      ownerId: ownerId,
      emailVerified: true,
      mobileVerified: true,
    };

    // Portal activation link sent via email & SMS outbox
    const activateLink = `${window.location.origin}/?verify=${token}`;
    outbox.push({
      kind: "email",
      to: owner.email,
      subject: "Welcome to PawCare - Activate Your Pet Owner Portal",
      body: `Dear ${owner.name},\n\nYour pet ${pet.name} has been successfully registered at PawCare Clinic!\n\nYou can access your digital Pet Owner Portal anytime to track medical histories, vaccines, and request appointments:\n\n${activateLink}\n\nWarm regards,\nPawCare Front Desk Team`,
      link: { type: "verify", token, label: "Open Pet Owner Portal" },
    });

    outbox.push({
      kind: "sms",
      to: owner.phone,
      subject: "SMS",
      body: `PawCare: Welcome ${owner.name}! Your pet ${pet.name} is registered. Access your owner portal here: ${activateLink}`,
    });

    let newAppt = null;
    if (f.addToQueue) {
      newAppt = {
        id: "a" + uid(),
        petId: petId,
        vetId: "v1", // Primary vet or clinical queue
        date: TODAY,
        time: new Date().toLocaleTimeString("en-PH", { hour12: false, hour: "2-digit", minute: "2-digit" }),
        reason: clean(f.reason) || "Walk-in Consultation",
        status: "Checked-in", // Direct to Vet Queue!
        billingStatus: "Unbilled",
        amount: 600,
      };
    }

    setDb(p => {
      const nextOwners = [...p.owners, owner];
      const nextPets = [...p.pets, pet];
      const nextUsers = [...p.users, user];
      const nextAppts = newAppt ? [...p.appts, newAppt] : p.appts;

      return {
        ...p,
        owners: nextOwners,
        pets: nextPets,
        users: nextUsers,
        appts: nextAppts,
        log: addLog(
          p,
          me,
          `Walk-in registration: Owner ${owner.name} and pet ${pet.name} registered. Portal activation sent via SMS/Email.${
            newAppt ? ` Added to today's doctor queue (${newAppt.status}).` : ""
          }`
        ),
      };
    });

    setSuccess({
      owner,
      pet,
      appt: newAppt,
      activateLink,
    });

    onRegistered && onRegistered(owner, pet, newAppt);
  };

  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: "min(680px, 100%)" }}>
        <h3>Walk-in Owner & Patient Registration</h3>
        <p className="auth-note" style={{ margin: "0 0 16px" }}>
          <b>Workflow A (Front Desk):</b> Register a new pet owner and their pet. Saving automatically creates their record, sends a digital portal activation invite via SMS & Email, and places them into today&apos;s clinical queue.
        </p>

        {success ? (
          <div className="auth-ok" style={{ textAlign: "left", padding: "10px 0" }}>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "16px" }}>
              <span style={{ fontSize: "36px" }}>✅</span>
              <div>
                <h4 style={{ margin: "0 0 4px", fontSize: "18px", color: "var(--navy)" }}>Registration & Portal Activation Complete!</h4>
                <p style={{ margin: 0, fontSize: "14px", color: "#475569" }}>
                  <b>{success.owner.name}</b> and <b>{success.pet.name}</b> are now on file.
                </p>
              </div>
            </div>

            <div className="card" style={{ background: "#f8fafc", padding: "14px", margin: "14px 0", border: "1px solid #cbd5e1" }}>
              <p style={{ margin: "0 0 8px", fontSize: "13px" }}><b>Portal Invitation Sent:</b></p>
              <p style={{ margin: "0 0 4px", fontSize: "12.5px" }}>📧 Email: <code>{success.owner.email}</code></p>
              <p style={{ margin: "0 0 8px", fontSize: "12.5px" }}>📱 SMS: <code>{success.owner.phone}</code></p>
              <p style={{ margin: "0 0 8px", fontSize: "12.5px" }}>
                Activation Link: <a href={success.activateLink} target="_blank" rel="noreferrer" style={{ wordBreak: "break-all" }}>{success.activateLink}</a>
              </p>
              {success.appt && (
                <div style={{ marginTop: "10px", padding: "8px 12px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: "8px", color: "#065f46", fontSize: "13px" }}>
                  ✓ <b>Checked-in to Today&apos;s Clinical Queue</b> at {success.appt.time} for Dr. Ana Cruz.
                </div>
              )}
            </div>

            <div className="row end" style={{ marginTop: "18px" }}>
              <button className="btn gold" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div style={{ gridColumn: "1/-1", borderBottom: "2px solid #e2e8f0", paddingBottom: "4px", marginTop: "4px" }}>
                <b style={{ color: "var(--navy)", fontSize: "13px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  1. Owner Information
                </b>
              </div>

              <div className="fld">
                <label>Owner Full Name<i> *</i></label>
                <input
                  type="text"
                  placeholder="e.g. Juan Dela Cruz"
                  value={f.name}
                  onChange={e => set("name", e.target.value)}
                  className={errs.name ? "bad" : ""}
                />
                {errs.name && <span className="err">{errs.name}</span>}
              </div>

              <div className="fld">
                <label>Mobile Number (SMS notices)<i> *</i></label>
                <input
                  type="tel"
                  placeholder="09171234567"
                  value={f.phone}
                  onChange={e => set("phone", e.target.value)}
                  className={errs.phone ? "bad" : ""}
                />
                {errs.phone && <span className="err">{errs.phone}</span>}
              </div>

              <div className="fld">
                <label>Email Address (Portal login)<i> *</i></label>
                <input
                  type="email"
                  placeholder="juan@example.com"
                  value={f.email}
                  onChange={e => set("email", e.target.value)}
                  className={errs.email ? "bad" : ""}
                />
                {errs.email && <span className="err">{errs.email}</span>}
              </div>

              <div className="fld">
                <label>Home Address<i> *</i></label>
                <input
                  type="text"
                  placeholder="House #, Street, City"
                  value={f.address}
                  onChange={e => set("address", e.target.value)}
                  className={errs.address ? "bad" : ""}
                />
                {errs.address && <span className="err">{errs.address}</span>}
              </div>

              <div style={{ gridColumn: "1/-1", borderBottom: "2px solid #e2e8f0", paddingBottom: "4px", marginTop: "10px" }}>
                <b style={{ color: "var(--navy)", fontSize: "13px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  2. Patient / Pet Details
                </b>
              </div>

              <div className="fld">
                <label>Pet Name<i> *</i></label>
                <input
                  type="text"
                  placeholder="e.g. Bantay"
                  value={f.petName}
                  onChange={e => set("petName", e.target.value)}
                  className={errs.petName ? "bad" : ""}
                />
                {errs.petName && <span className="err">{errs.petName}</span>}
              </div>

              <div className="fld">
                <label>Species / Type<i> *</i></label>
                <select value={f.species} onChange={e => set("species", e.target.value)}>
                  {Object.keys(ICON).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="fld">
                <label>Breed</label>
                <input
                  type="text"
                  placeholder="e.g. Shih Tzu, Aspin, Puspin"
                  value={f.breed}
                  onChange={e => set("breed", e.target.value)}
                />
              </div>

              <div className="fld">
                <label>Sex<i> *</i></label>
                <select value={f.sex} onChange={e => set("sex", e.target.value)}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>

              <div className="fld">
                <label>Birth Date<i> *</i></label>
                <input
                  type="date"
                  max={TODAY}
                  value={f.birth}
                  onChange={e => set("birth", e.target.value)}
                  className={errs.birth ? "bad" : ""}
                />
                {errs.birth && <span className="err">{errs.birth}</span>}
              </div>

              <div className="fld">
                <label>Current Weight (kg)<i> *</i></label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 8.5"
                  value={f.weight}
                  onChange={e => set("weight", e.target.value)}
                  className={errs.weight ? "bad" : ""}
                />
                {errs.weight && <span className="err">{errs.weight}</span>}
              </div>

              <div style={{ gridColumn: "1/-1", background: "#f1f5f9", padding: "12px 14px", borderRadius: "12px", marginTop: "6px" }}>
                <label className="chk" style={{ display: "flex", gap: "10px", alignItems: "center", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={f.addToQueue}
                    onChange={e => set("addToQueue", e.target.checked)}
                  />
                  <b>Check-in for today&apos;s consultation right now (Moves patient to Veterinarian&apos;s queue)</b>
                </label>
                {f.addToQueue && (
                  <div style={{ marginTop: "10px" }}>
                    <label style={{ fontSize: "12.5px", fontWeight: "600", display: "block", marginBottom: "4px" }}>
                      Chief Complaint / Reason for visit:
                    </label>
                    <input
                      type="text"
                      value={f.reason}
                      onChange={e => set("reason", e.target.value)}
                      placeholder="e.g. Vomiting, skin itchiness, vaccination"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="row end" style={{ marginTop: "20px", gap: "10px" }}>
              <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn gold">Save & Send Portal Invite</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

