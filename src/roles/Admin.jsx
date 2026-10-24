import { useState } from "react";
import {
  Send,
  Copy,
  Check,
  Mail,
  UserPlus,
  Stethoscope,
  ConciergeBell,
  X,
  AlertCircle
} from "lucide-react";
import { M, by, Stats, Hero, TODAY, plus, ROLES, VETS, uid, addLog, Badge } from "../lib.jsx";
import { auth } from "../authApi.js";
import ClinicCalendar from "./ClinicCalendar.jsx";
import DailySalesPage from "./DailySalesPage.jsx";
import ClientsAndPatientsPage from "./ClientsAndPatientsPage.jsx";
import ConsultationsPage from "./ConsultationsPage.jsx";

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
    role: "assistant"
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!f.name.trim()) return setErr("Staff full name is required");
    if (!f.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return setErr("Valid staff email required");

    setLoading(true);
    try {
      const res = await auth.inviteStaff({
        email: f.email.trim().toLowerCase(),
        name: f.name.trim(),
        role: f.role
      });

      if (res.status === "ok") {
        setSuccess(res);
        setDb(p => ({
          ...p,
          log: addLog(p, me, `Administrator ${me.name} dispatched staff invitation to ${f.name} (${f.role}) via Brevo.`)
        }));
      } else {
        setErr(res.error || "Failed to dispatch staff invitation.");
      }
    } catch (err) {
      setErr(err.message || "Failed to connect to clinic server.");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (!success?.inviteLink) return;
    navigator.clipboard.writeText(success.inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const roleName = f.role === "vet" ? "Veterinarian" : "Vet Assistant";

  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: "min(540px, 100%)", borderRadius: "18px", padding: "26px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "19px", color: "var(--navy, #0f172a)", fontWeight: 700 }}>
              Invite Staff Member
            </h3>
            <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
              Authorizes a Veterinarian or Vet Assistant account via Brevo invitation email
            </p>
          </div>
          <button className="btn ghost sm" onClick={onClose} style={{ padding: "6px" }} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {success ? (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "#dcfce7", color: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Check size={28} strokeWidth={2.5} />
            </div>
            <h4 style={{ margin: "0 0 8px", fontSize: "17px", color: "#14532d", fontWeight: 700 }}>
              Invitation Sent Successfully!
            </h4>
            <p style={{ margin: "0 0 18px", color: "#475569", fontSize: "13px", lineHeight: 1.5 }}>
              An invitation email has been dispatched via <b>Brevo</b> to <b>{f.email}</b>.<br />
              The recipient will receive an activation link to set their password and verify their phone number via <b>TextBee SMS OTP</b>.
            </p>

            <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "20px", textAlign: "left" }}>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                Direct Activation Link
              </span>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="text"
                  readOnly
                  value={success.inviteLink}
                  style={{ flex: 1, fontSize: "12px", padding: "8px 10px", background: "#ffffff", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                />
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={copyLink}
                  style={{ display: "flex", alignItems: "center", gap: "4px", padding: "8px 12px" }}
                >
                  {copied ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                  <span>{copied ? "Copied!" : "Copy"}</span>
                </button>
              </div>
            </div>

            <div className="row end">
              <button className="btn gold" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            {err && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: "10px", padding: "10px 14px", fontSize: "13px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{err}</span>
              </div>
            )}

            <div className="fld">
              <label>Staff Role<i> *</i></label>
              <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>
                <option value="assistant">Vet Assistant (Front Desk &amp; Operations)</option>
                <option value="vet">Veterinarian (Clinical Queue &amp; EMR)</option>
              </select>
            </div>

            <div className="fld">
              <label>Full Name<i> *</i></label>
              <input
                type="text"
                placeholder={f.role === "vet" ? "e.g. Dr. Roberto Santos" : "e.g. Liza Ramos"}
                value={f.name}
                onChange={e => setF({ ...f, name: e.target.value })}
                required
              />
            </div>

            <div className="fld">
              <label>Staff Email Address<i> *</i></label>
              <input
                type="email"
                placeholder="staff@pawcare.com"
                value={f.email}
                onChange={e => setF({ ...f, email: e.target.value })}
                required
              />
              <span style={{ fontSize: "11px", color: "#64748b", marginTop: "3px", display: "block" }}>
                ✉️ An invitation email will be sent to this address via Brevo with a secure setup link.
              </span>
            </div>

            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "10px", padding: "10px 14px", fontSize: "12px", color: "#1e40af", marginTop: "14px", marginBottom: "18px", lineHeight: 1.5 }}>
              <b>Security Protocol:</b> Only Pet Owners can self-register online. Staff logins are strictly authorized by you (the Administrator). The invited staff member will set their own password and verify their phone number via TextBee SMS OTP upon clicking the invitation link.
            </div>

            <div className="row end" style={{ gap: "10px" }}>
              <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
              <button
                type="submit"
                className="btn gold"
                disabled={loading}
                style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 18px", fontWeight: 600 }}
              >
                <Send size={15} />
                <span>{loading ? "Sending Invitation..." : `Send ${roleName} Invitation`}</span>
              </button>
            </div>
          </form>
        )}
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
        icons={["hospital", "shield"]}
      >
        <div className="row" style={{ flexWrap: "wrap", gap: "10px" }}>
          <button className="btn gold" onClick={() => setShowStaffModal(true)}>
            + Invite Staff (Vet / Assistant)
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
          ["user", db.owners.length, "Registered Owners"],
          ["paw", db.pets.length, "Animal Patients"],
          ["shield", db.users.length, "User Accounts"],
          ["calendar", db.appts.filter(a => a.date === TODAY).length, "Today's Appointments"],
          ["alert", db.vacc.filter(v => v.nextDue && !v.done && v.nextDue < TODAY).length, "Overdue Vaccines"],
          ["file", db.records.length, "Consultations on File"],
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
    { k: "home", l: "Clinic Overview", i: "hospital", dash: 1, sub: "Clinic-wide analytics, audit trail, and staff provisioning." },
    M("users", "Staff & User Accounts", "shield", "users", "RBAC control: create and manage staff logins, roles, and credentials."),
    { k: "sales", l: "Daily Sales & Billing", i: "receipt", Page: DailySalesPage, sub: "Daily collections register, cashier receipts, and sales breakdown." },
    { k: "cal", l: "Master Calendar", i: "calendar", Page: ClinicCalendar, sub: "Clinic appointment calendar (read-only administrative oversight)." },
    { k: "clients-patients", l: "Clients & Patients Masterlist", i: "users", Page: ClientsAndPatientsPage, sub: "Unified masterlist of pet owners, animal patient profiles, and official vaccination cards." },
    { k: "records", l: "Consultations & EMR", i: "file", Page: ConsultationsPage, sub: "Certified veterinary consultation notes, EMR, and prescription handoff." },
    { k: "reports", l: "Reports & Audits", i: "chart", rep: 1, sub: "Filter, audit, and print clinic summaries." },
    { k: "owners", hide: true, Page: ClientsAndPatientsPage },
    { k: "pets", hide: true, Page: ClientsAndPatientsPage },
    { k: "appts", hide: true, Page: ClinicCalendar },
  ],
};
