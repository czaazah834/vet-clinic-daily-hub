import { useState } from "react";
import { M, by, Stats, Hero, TODAY, plus, ROLES, VETS, uid, addLog, Badge } from "../lib.jsx";
import ClinicCalendar from "./ClinicCalendar.jsx";

function Bars({ title, data }) {
  const max = Math.max(1, ...Object.values(data));
  return (
    <section className="card">
      <h3 style={{ margin: "0 0 12px" }}>{title}</h3>
      {Object.entries(data).map(([k, n]) => (
        <div className="bar2" key={k} style={{ display: "grid", gridTemplateColumns: "130px 1fr 40px", gap: "10px", alignItems: "center", margin: "8px 0" }}>
          <span style={{ fontSize: "13px", fontWeight: "600", color: "#334155" }}>{k}</span>
          <i style={{ display: "block", height: "12px", background: "var(--butter, #f5c542)", borderRadius: "99px", width: `${(n / max) * 100}%` }} />
          <b style={{ fontSize: "13px", textAlign: "right" }}>{n}</b>
        </div>
      ))}
    </section>
  );
}

function StaffModal({ db, setDb, me, onClose, onCreated }) {
  const [f, setF] = useState({
    name: "",
    email: "",
    username: "",
    password: "",
    role: "assistant",
    vetId: "v1",
  });
  const [err, setErr] = useState("");

  const submit = (e) => {
    e.preventDefault();
    setErr("");
    if (!f.name.trim()) return setErr("Staff full name is required");
    if (!f.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return setErr("Valid staff email required");
    if (!f.username.trim() || f.username.length < 3) return setErr("Username must be at least 3 characters");
    if (!f.password || f.password.length < 8) return setErr("Password must be at least 8 characters");

    if (db.users.some(u => u.username.toLowerCase() === f.username.trim().toLowerCase())) {
      return setErr("That username is already taken");
    }
    if (db.users.some(u => u.email?.toLowerCase() === f.email.trim().toLowerCase())) {
      return setErr("A user with this email already exists");
    }

    const newUser = {
      id: "u" + uid(),
      name: f.name.trim(),
      email: f.email.trim().toLowerCase(),
      username: f.username.trim().toLowerCase(),
      password: f.password,
      role: f.role,
      vetId: f.role === "vet" ? f.vetId : undefined,
      emailVerified: true,
      mobileVerified: true,
      created_at: new Date().toISOString(),
    };

    setDb(p => ({
      ...p,
      users: [...p.users, newUser],
      log: addLog(p, me, `Administrator ${me.name} registered new staff account: ${newUser.name} (${ROLES[newUser.role][0]}).`),
    }));

    onCreated && onCreated(newUser);
  };

  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: "min(520px, 100%)" }}>
        <h3>Register New Staff Account</h3>
        <p className="auth-note">
          <b>Role-Based Access Control:</b> Only the Clinic Administrator can create and authorize staff logins (Veterinarians and Vet Assistants).
        </p>

        {err && <p className="err" role="alert" style={{ marginBottom: "12px" }}>{err}</p>}

        <form onSubmit={submit}>
          <div className="fld">
            <label>Staff Role<i> *</i></label>
            <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>
              <option value="assistant">Vet Assistant (Front Desk &amp; Operations)</option>
              <option value="vet">Veterinarian (Clinical Queue &amp; EMR)</option>
            </select>
          </div>

          {f.role === "vet" && (
            <div className="fld">
              <label>Link Doctor Profile<i> *</i></label>
              <select value={f.vetId} onChange={e => setF({ ...f, vetId: e.target.value })}>
                {VETS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
          )}

          <div className="fld">
            <label>Full Name<i> *</i></label>
            <input
              type="text"
              placeholder="e.g. Dr. Carlo Santos, Liza Ramos"
              value={f.name}
              onChange={e => setF({ ...f, name: e.target.value })}
            />
          </div>

          <div className="fld">
            <label>Staff Clinic Email<i> *</i></label>
            <input
              type="email"
              placeholder="staff@pawcare.com"
              value={f.email}
              onChange={e => setF({ ...f, email: e.target.value })}
            />
          </div>

          <div className="fld">
            <label>Username<i> *</i></label>
            <input
              type="text"
              placeholder="e.g. carlo_vet, liza_frontdesk"
              value={f.username}
              onChange={e => setF({ ...f, username: e.target.value })}
            />
          </div>

          <div className="fld">
            <label>Initial Temporary Password<i> *</i></label>
            <input
              type="password"
              placeholder="At least 8 characters"
              value={f.password}
              onChange={e => setF({ ...f, password: e.target.value })}
            />
          </div>

          <div className="row end" style={{ marginTop: "18px", gap: "10px" }}>
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn gold">Create Staff Login</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Dash({ db, setDb, me, go, say }) {
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [logSearch, setLogSearch] = useState("");

  const logs = (db.log || []).filter(l =>
    !logSearch || l.msg.toLowerCase().includes(logSearch.toLowerCase()) || l.by.toLowerCase().includes(logSearch.toLowerCase())
  );

  return (
    <>
      <Hero
        title={`Administrator Console · ${me.name}`}
        text="Full clinic oversight: system-wide analytics, staff account provisioning, clinical workflows and security audit logs."
        emoji="🏥🐾"
      >
        <div className="row" style={{ flexWrap: "wrap", gap: "10px" }}>
          <button className="btn gold" onClick={() => setShowStaffModal(true)}>
            + Register Staff Account
          </button>
          <button className="btn" onClick={() => go("users")}>
            Manage User Accounts
          </button>
          <button className="btn ghost" onClick={() => go("cal")}>
            Clinic Master Calendar
          </button>
          <button className="btn ghost" onClick={() => go("reports")}>
            Print Audit Reports
          </button>
        </div>
      </Hero>

      <Stats
        items={[
          ["👤", db.owners.length, "Registered Owners"],
          ["🐾", db.pets.length, "Animal Patients"],
          ["🔐", db.users.length, "User Accounts"],
          ["📅", db.appts.filter(a => a.date === TODAY).length, "Today's Appointments"],
          ["⚠️", db.vacc.filter(v => v.nextDue && !v.done && v.nextDue < TODAY).length, "Overdue Vaccines"],
          ["📋", db.records.length, "Consultations on File"],
        ]}
      />

      <div className="two" style={{ marginTop: "16px" }}>
        <Bars title="Appointments by Status" data={by(db.appts, "status")} />
        <Bars title="System Accounts by Role (RBAC)" data={by(db.users, "role")} />
      </div>

      {/* Security & Activity Audit Log */}
      <section className="card" style={{ marginTop: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px" }}>System Security &amp; Activity Audit Log</h3>
            <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
              Permanent audit trail tracking all clinical entries, walk-in registrations, appointments and staff activity.
            </p>
          </div>
          <input
            type="search"
            placeholder="Search audit trail..."
            value={logSearch}
            onChange={e => setLogSearch(e.target.value)}
            style={{ width: "240px", padding: "6px 12px", fontSize: "13px" }}
          />
        </div>

        {logs.length ? (
          <div style={{ maxHeight: "320px", overflowY: "auto", display: "grid", gap: "8px" }}>
            {logs.map(l => (
              <div
                key={l.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "9px 14px",
                  borderRadius: "8px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  fontSize: "13px",
                }}
              >
                <div>
                  <span style={{ fontWeight: "600", color: "#1e293b" }}>{l.msg}</span>
                  <small style={{ display: "block", color: "#64748b", marginTop: "2px" }}>
                    Actor: <b>{l.by}</b>
                  </small>
                </div>
                <span style={{ fontSize: "12px", color: "#64748b", whiteSpace: "nowrap" }}>
                  {l.at}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty sm">No activity matching your search.</div>
        )}
      </section>

      {showStaffModal && (
        <StaffModal
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setShowStaffModal(false)}
          onCreated={(u) => {
            setShowStaffModal(false);
            say(`Staff account for ${u.name} (${u.role}) created successfully!`);
          }}
        />
      )}
    </>
  );
}

export const admin = {
  portal: "Clinic Administrator Console",
  Dash,
  menu: [
    { k: "home", l: "Clinic Overview", i: "🏥", dash: 1, sub: "Clinic-wide analytics, audit trail, and staff provisioning." },
    { k: "cal", l: "Master Calendar", i: "📅", Page: ClinicCalendar, sub: "Full clinic interactive schedule calendar." },
    M("users", "Staff & User Accounts", "🔐", "users", "RBAC control: create and manage staff logins."),
    M("owners", "Owners Masterlist", "👤", "owners", "Complete owner contact records."),
    M("pets", "Patients Masterlist", "🐾", "pets", "All registered patient profiles."),
    M("appts", "Appointments", "🗓️", "appts", "System-wide appointment bookings and tracking."),
    M("vacc", "Vaccinations Hub", "💉", "vacc", "Vaccination records and compliance tracking."),
    M("records", "Consultations", "📋", "records", "Electronic medical records and consultation history."),
    { k: "reports", l: "Reports & Audits", i: "📊", rep: 1, sub: "Filter, audit, and print clinic summaries." },
  ],
};
