import { useSubmissionReview } from "../components/SubmissionReview.jsx";
import AdminStaff, { useAdminStaff, AdminAudit } from "./AdminStaff.jsx";
import ReminderStatus from "./ReminderStatus.jsx";
import { currentVaccinationDue } from "../vaccinationDue.js";
import { useRef, useState } from "react";
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
  const inviting = useRef(false);

  const review = useSubmissionReview(f);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (inviting.current) return;
    if (!f.name.trim()) return setErr("Staff full name is required");
    if (!f.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return setErr("Valid staff email required");

    if (!await review.ask({title:"Review staff invitation",confirmLabel:"Send invitation",description:"Check the email and role. This sends an invitation allowing the recipient to create a staff account with the selected access.",fields:[
        ["Staff name",f.name.trim()],
        ["Email",f.email.trim().toLowerCase()],
        ["Role",f.role === "vet" ? "Veterinarian" : "Vet assistant"]]}))return;
    inviting.current = true;
    setLoading(true);
    try {
      const res = await auth.inviteStaff({
        email: f.email.trim().toLowerCase(),
        name: f.name.trim(),
        role: f.role
      });

      if (res.status === "ok") {
        setSuccess(res);
        onCreated?.();
        setDb(p => ({
          ...p,
          log: addLog(p, me, `Administrator ${me.name} created staff invitation for ${f.name} (${f.role}).`)
        }));
      } else {
        setErr(res.error || "Failed to dispatch staff invitation.");
      }
    } catch (err) {
      setErr(err.message || "Failed to connect to clinic server.");
    } finally {
      inviting.current = false;
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!success?.inviteLink) return;
    try { await navigator.clipboard.writeText(success.inviteLink); } catch { setErr("Unable to copy. Select and copy the link below."); return; }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const roleName = f.role === "vet" ? "Veterinarian" : "Vet Assistant";

  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && !loading && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="staff-invite-title" style={{ width: "min(540px, 100%)", borderRadius: "18px", padding: "26px", overflowWrap: "anywhere" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <h3 id="staff-invite-title" style={{ margin: "0 0 4px", fontSize: "19px", color: "var(--navy, #0f172a)", fontWeight: 700 }}>
              Invite Staff Member
            </h3>
            <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
              Invite staff to set their password and verify their mobile number
            </p>
          </div>
          <button className="btn ghost sm" onClick={onClose} style={{ padding: "6px" }} aria-label="Close" disabled={loading}>
            <X size={18} />
          </button>
        </div>

        {success ? (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "#dcfce7", color: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Check size={28} strokeWidth={2.5} />
            </div>
            <h4 style={{ margin: "0 0 8px", fontSize: "17px", color: "#14532d", fontWeight: 700 }}>
              Invitation Created
            </h4>
            <p style={{ margin: "0 0 18px", color: "#475569", fontSize: "13px", lineHeight: 1.5 }}>
              {success.delivery === "accepted" ? <>The email provider accepted the invitation for <b>{f.email}</b>.</> : <>Email delivery is unconfirmed. Use the secure activation link below and check the configured email service.</>}<br />
              The activation link lets staff set their password and verify their phone number by SMS.
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
                  style={{ flex: 1, minWidth: 0, fontSize: "12px", padding: "8px 10px", background: "#ffffff", borderRadius: "8px", border: "1px solid #cbd5e1" }}
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

            {err && <p role="alert">{err}</p>}
            <div className="row end">
              <button className="btn gold" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            {review.card}
            <fieldset disabled={loading} style={{border: 0, padding: 0, margin: 0, minWidth: 0}}>
            {err && (
              <div role="alert" style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: "10px", padding: "10px 14px", fontSize: "13px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{err}</span>
              </div>
            )}

            <div className="fld">
              <label htmlFor="staff-invite-role">Staff Role<i> *</i></label>
              <select id="staff-invite-role" value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>
                <option value="assistant">Vet Assistant (Front Desk &amp; Operations)</option>
                <option value="vet">Veterinarian (Clinical Queue &amp; EMR)</option>
              </select>
            </div>

            <div className="fld">
              <label htmlFor="staff-invite-name">Full Name<i> *</i></label>
              <input
                id="staff-invite-name"
                type="text"
                placeholder={f.role === "vet" ? "e.g. Dr. Roberto Santos" : "e.g. Liza Ramos"}
                value={f.name}
                onChange={e => setF({ ...f, name: e.target.value })}
                required
              />
            </div>

            <div className="fld">
              <label htmlFor="staff-invite-email">Staff Email Address<i> *</i></label>
              <input
                id="staff-invite-email"
                type="email"
                placeholder="staff@pawcare.com"
                value={f.email}
                onChange={e => setF({ ...f, email: e.target.value })}
                required
              />
              <span style={{ fontSize: "11px", color: "#64748b", marginTop: "3px", display: "block" }}>
                The email service sends a secure setup link to this address.
              </span>
            </div>

            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "10px", padding: "10px 14px", fontSize: "12px", color: "#1e40af", marginTop: "14px", marginBottom: "18px", lineHeight: 1.5 }}>
              <b>Security Protocol:</b> Only Pet Owners can self-register online. Staff logins are strictly authorized by you (the Administrator). The invited staff member will set their own password and verify their phone number by SMS when opening the invitation link.
            </div>

            <div className="row end" style={{ gap: "10px", flexWrap: "wrap" }}>
              <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
              <button
                type="submit"
                className="btn gold"
                disabled={loading}
                style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 18px", fontWeight: 600 }}
              >
                <Send size={15} />
                <span>{loading ? "Sending Invitation..." : `Review ${roleName} Invitation`}</span>
              </button>
            </div>
            </fieldset>
          </form>
        )}
      </div>
    </div>
  );
}

function Dash({ db, setDb, me, go, say }) {
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const staff = useAdminStaff();
  const unpaid = db.appts.filter(a=>a.status === "Completed" && a.billingStatus !== "Paid");
  const unfinished = db.appts.filter(a=>["Checked-in","In consultation"].includes(a.status) && a.date <= TODAY);
  const locked = (staff.data?.staff || []).filter(u=>u.active && u.locked);
  const inactiveIds = (staff.data?.staff || []).filter(u=>!u.active).flatMap(u=>[u.id,u.vetId].filter(Boolean));
  const inactiveCare = unfinished.filter(a=>inactiveIds.includes(a.vetId));
  const reassign = db.appts.filter(a=>a.date >= TODAY && ["Scheduled","Confirmed"].includes(a.status) && inactiveIds.includes(a.vetId));

  const logs = (db.log || []).filter(l => {
    const text = (l.msg || l.action || "").toLowerCase();
    const actor = (l.by || (l.user ? l.user.name : "") || "").toLowerCase();
    const role = (l.role || (l.user ? l.user.role : "") || "").toLowerCase();
    const q = (logSearch || "").trim().toLowerCase();
    return !q || text.includes(q) || actor.includes(q) || role.includes(q);
  });

  return (
    <>
      <Hero
        title={`Administrator Console · ${me.name}`}
        text="Review clinic exceptions, manage staff access, audit settled payments and inspect clinical records. Reception and veterinarians carry out patient care."
        icons={["hospital", "shield"]}
      >
        <div className="row" style={{ flexWrap: "wrap", gap: "10px" }}>
          <button className="btn gold" onClick={() => setShowStaffModal(true)}>
            + Invite Staff (Vet / Assistant)
          </button>
          <button className="btn" onClick={() => go("users")}>
            Manage Staff Access
          </button>
          <button className="btn ghost" onClick={() => go("cal")}>
            Clinic Master Calendar
          </button>
          <button className="btn ghost" onClick={() => go("reports")}>
            View Clinic Reports
          </button>
        </div>
      </Hero>

      <Stats
        items={[
          ["user", db.owners.length, "Registered Owners"],
          ["paw", db.pets.length, "Animal Patients"],
          ["shield", staff.data?.accountCount ?? "—", "Registered accounts"],
          ["calendar", db.appts.filter(a => a.date === TODAY).length, "Today's Appointments"],
          ["alert", currentVaccinationDue(db.vacc).filter(v=>v.nextDue<TODAY).length, "Certified booster recalls overdue"],
          ["file", db.records.length, "Consultations on File"],
        ]}
      />

      <section className="card" style={{marginTop:16}}>
        <h3>Needs attention</h3><p>Review exceptions and direct the responsible team to the next action.</p>
        {staff.error && <p role="alert">{staff.error} <button className="btn ghost sm" onClick={()=>staff.load()}>Retry staff status</button></p>}
        <div style={{display:'grid',gap:12}}>
          <div><b>{staff.data ? locked.length : '—'} active staff account(s) locked</b> · Review the reason and unlock access if appropriate. <button className="btn ghost sm" onClick={()=>go('users')}>Review staff access</button></div>
          <div><b>{staff.data ? reassign.length : '—'} upcoming visit(s) assigned to inactive doctors</b> · Ask reception to confirm reassignment with the client. <button className="btn ghost sm" onClick={()=>go('cal')}>Review calendar</button></div>
          <div><b>{staff.data ? inactiveCare.length : '—'} arrived visit(s) assigned to inactive doctors</b> · Review staff access and coordinate a veterinarian handoff. Reception cannot reschedule started care. <button className="btn ghost sm" onClick={()=>go('users')}>Review responsible staff</button></div>
          <div><b>{unpaid.length} completed visit(s) unpaid</b> · Ask reception to resolve its checkout inbox. <button className="btn ghost sm" onClick={()=>go('sales')}>Review sales</button></div>
          <div><b>{unfinished.length} arrived visit(s) unfinished</b> · Check with the assigned clinical team. <button className="btn ghost sm" onClick={()=>go('records')}>Review clinical records</button></div>
        </div>
      </section>
      <ReminderStatus />
      <div className="two" style={{ marginTop: "16px" }}>
        <Bars title="Appointments by Status" data={by(db.appts, "status")} />
        {staff.data && <Bars title="Staff accounts by role" data={by(staff.data.staff, "role")} />}
      </div>

      {/* Security & Activity Audit Log */}
      <section className="card" style={{ marginTop: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px" }}>Recent clinic activity</h3>
            <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
              Latest 100 saved entries. Open System Audit Trail to search older activity.
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
                  <span style={{ fontWeight: "600", color: "#1e293b" }}>{l.msg || l.action}</span>
                  <small style={{ display: "flex", alignItems: "center", gap: "6px", color: "#64748b", marginTop: "3px" }}>
                    <span>Actor: <b>{l.by || (l.user ? l.user.name : "System")}</b></span>
                    {(l.role || l.user?.role) && (
                      <span style={{ background: "#e2e8f0", color: "#334155", padding: "1px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: 600 }}>
                        {l.role || l.user?.role}
                      </span>
                    )}
                  </small>
                </div>
                <span style={{ fontSize: "12px", color: "#64748b", whiteSpace: "nowrap" }}>
                  {l.at || l.ts || ""}
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
          onCreated={() => staff.load()}
        />
      )}
    </>
  );
}

function StaffPage(props) {
  const [inviting,setInviting] = useState(false),[revision,setRevision]=useState(0);
  return <><AdminStaff key={revision} onInvite={()=>setInviting(true)} />{inviting && <StaffModal {...props} onCreated={()=>setRevision(r=>r+1)} onClose={()=>{setInviting(false);setRevision(r=>r+1);}} />}</>;
}

export const admin = {
  portal: "Clinic Administrator Console",
  Dash,
  menu: [
    { k: "home", l: "Clinic Overview", i: "hospital", dash: 1, sub: "Clinic-wide analytics, audit trail, and staff provisioning." },
    { k:"users", l:"Staff Access & Invitations", i:"shield", Page:StaffPage, sub:"Invite veterinarians and assistants, review access, and resolve locked accounts." },
    { k: "sales", l: "Sales & Financial Audit", i: "receipt", Page: DailySalesPage, sub: "Review settled payments and receipts; reception collects payments." },
    { k: "cal", l: "Master Calendar", i: "calendar", Page: ClinicCalendar, sub: "Clinic appointment calendar (read-only administrative oversight)." },
    { k: "clients-patients", l: "Clients & Patients Masterlist", i: "users", Page: ClientsAndPatientsPage, sub: "Unified masterlist of pet owners, animal patient profiles, and official vaccination cards." },
    { k: "records", l: "Consultations & EMR", i: "file", Page: ConsultationsPage, sub: "Certified veterinary consultation notes, EMR, and prescription handoff." },
    { k:"audit", l:"System Audit Trail", i:"shield", Page:AdminAudit, sub:"Search saved activity and review older entries." },
    { k: "reports", l: "Reports & Audits", i: "chart", rep: 1, sub: "Filter, audit, and print clinic summaries." },
    { k: "owners", hide: true, Page: ClientsAndPatientsPage },
    { k: "pets", hide: true, Page: ClientsAndPatientsPage },
    { k: "appts", hide: true, Page: ClinicCalendar },
  ],
};
