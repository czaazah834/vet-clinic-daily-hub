import { useState } from "react";
import {
  Calendar,
  Clock,
  User,
  Stethoscope,
  Syringe,
  Scissors,
  FlaskConical,
  AlertCircle,
  Plus,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Check,
  Columns,
  LayoutGrid,
  Dog,
  Cat,
  Rabbit,
  Bird,
  PawPrint,
  Phone,
  ShieldCheck,
  Activity,
  X,
} from "lucide-react";
import { VETS, TODAY, scope, petName, ownerName, dueState, moveAppt, LABEL, Badge, uid, addLog } from "../lib.jsx";
import { api } from "../api.js";
import CheckInModal from "./CheckInModal.jsx";
import SoapConsultationModal from "./SoapConsultationModal.jsx";
import BillingModal from "./BillingModal.jsx";
import PetCardModal from "./PetCardModal.jsx";
import { formatSpeciesLabel } from "../preventiveSchedule.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const TIME_SLOTS = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30", "17:00",
];

export function SpeciesIcon({ species, size = 18, color }) {
  const s = String(species || "").toLowerCase();
  if (s.includes("dog")) return <Dog size={size} color={color} strokeWidth={2} />;
  if (s.includes("cat")) return <Cat size={size} color={color} strokeWidth={2} />;
  if (s.includes("rabbit")) return <Rabbit size={size} color={color} strokeWidth={2} />;
  if (s.includes("bird")) return <Bird size={size} color={color} strokeWidth={2} />;
  return <PawPrint size={size} color={color} strokeWidth={2} />;
}

export function getServiceCategory(reason = "") {
  const r = reason.toLowerCase();
  if (r.includes("vaccin") || r.includes("rabies") || r.includes("5-in-1") || r.includes("deworm")) {
    return { label: "Vaccine & Prophylaxis", color: "#047857", bg: "#ecfdf5", border: "#a7f3d0", Icon: Syringe };
  }
  if (r.includes("surgery") || r.includes("spay") || r.includes("neuter") || r.includes("dental")) {
    return { label: "Surgery & Dental", color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", Icon: Scissors };
  }
  if (r.includes("blood") || r.includes("lab") || r.includes("x-ray") || r.includes("fecal") || r.includes("test")) {
    return { label: "Diagnostic & Lab", color: "#b45309", bg: "#fffbeb", border: "#fde68a", Icon: FlaskConical };
  }
  if (r.includes("emergency") || r.includes("trauma") || r.includes("critical") || r.includes("urgent")) {
    return { label: "Emergency Triage", color: "#b91c1c", bg: "#fef2f2", border: "#fecaca", Icon: AlertCircle };
  }
  return { label: "Consultation & Exam", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe", Icon: Stethoscope };
}

export default function ClinicCalendar({ db, setDb, me, go, say }) {
  const t = new Date();
  const [cur, setCur] = useState({ y: t.getFullYear(), m: t.getMonth() });
  const [viewMode, setViewMode] = useState("timeline"); // 'timeline' | 'month' | 'list'
  const [vetFilter, setVetFilter] = useState(me.role === "vet" ? me.vetId || "v1" : "");
  const [sel, setSel] = useState(TODAY);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modals
  const [bookingSlot, setBookingSlot] = useState(null); // { date, time, vetId }
  const [checkInAppt, setCheckInAppt] = useState(null);
  const [activeSoap, setActiveSoap] = useState(null);
  const [billingAppt, setBillingAppt] = useState(null);
  const [cardPetId, setCardPetId] = useState(null);

  const appts = db.appts.filter(a => (!vetFilter || a.vetId === vetFilter) && a.status !== "Cancelled");

  const ev = {};
  const add = (d, e) => { if (d) (ev[d] = ev[d] || []).push(e); };

  appts.forEach(a => {
    const pet = db.pets.find(p => p.id === a.petId) || {};
    const owner = db.owners.find(o => o.id === pet.ownerId || o.userId === pet.ownerId) || {};
    add(a.date, {
      id: a.id,
      time: a.time,
      pet: pet.name || "Unknown Patient",
      species: pet.species || "Other",
      breed: pet.breed || "",
      owner: owner.name || "Unknown Owner",
      ownerPhone: owner.phone || "",
      reason: a.reason,
      status: a.status,
      vetId: a.vetId,
      vet: (VETS.find(v => v[0] === a.vetId) || [])[1] || "",
      appt: a,
      petObj: pet,
    });
  });

  const first = new Date(cur.y, cur.m, 1);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(cur.y, cur.m, 1 - first.getDay() + i));
  const moveMonth = n => { const d = new Date(cur.y, cur.m + n, 1); setCur({ y: d.getFullYear(), m: d.getMonth() }); };

  const moveDay = n => {
    const d = new Date(sel + "T00:00:00");
    d.setDate(d.getDate() + n);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setSel(next);
    setCur({ y: d.getFullYear(), m: d.getMonth() });
  };

  const dayEvents = (ev[sel] || []).slice().sort((a, b) => a.time.localeCompare(b.time));
  const niceDate = new Date(sel + "T00:00:00").toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const handleAction = (a, action) => {
    moveAppt(setDb, a.id, action, me);
    say && say(`${LABEL[action] || action} updated`);
  };

  // Quick booking submit saved to PostgreSQL backend
  const handleQuickBook = async (petId, serviceName, reasonText, targetVetId, targetDate, targetTime) => {
    const newApptId = "a_" + uid();
    const reason = serviceName ? `${serviceName}: ${reasonText}` : reasonText;
    const newAppt = {
      id: newApptId,
      petId,
      vetId: targetVetId,
      date: targetDate,
      time: targetTime,
      reason,
      status: "Scheduled",
      billingStatus: "Unbilled",
      amount: 600,
    };

    try {
      await api.post("/api/appointments", {
        id: newApptId,
        petId,
        vetId: targetVetId,
        date: targetDate,
        time: targetTime,
        reason,
        amount: 600,
        actorName: me.name,
        actorRole: me.role
      });
    } catch (err) {
      console.warn("Backend appointment booking fallback:", err);
    }

    setDb(p => ({
      ...p,
      appts: [...p.appts.filter(a => a.id !== newApptId), newAppt],
      log: addLog(p, me, `${me.name} scheduled appointment for ${petName(p, petId)} with ${(VETS.find(v => v[0] === targetVetId) || [])[1]} on ${targetDate} at ${targetTime}.`),
    }));

    setBookingSlot(null);
    say && say(`Appointment booked for ${petName(db, petId)} at ${targetTime}!`);
  };

  return (
    <div>
      {/* Top Header Card */}
      <div className="card" style={{ marginBottom: "16px", padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {viewMode === "month" ? (
              <>
                <button className="btn ghost sm" onClick={() => moveMonth(-1)} aria-label="Previous month">
                  <ChevronLeft size={16} />
                </button>
                <h2 style={{ margin: 0, fontSize: "19px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Calendar size={20} color="var(--navy)" />
                  <span>{MONTHS[cur.m]} {cur.y}</span>
                </h2>
                <button className="btn ghost sm" onClick={() => moveMonth(1)} aria-label="Next month">
                  <ChevronRight size={16} />
                </button>
              </>
            ) : (
              <>
                <button className="btn ghost sm" onClick={() => moveDay(-1)} aria-label="Previous day">
                  <ChevronLeft size={16} />
                </button>
                <h2 style={{ margin: 0, fontSize: "19px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Clock size={20} color="var(--navy)" />
                  <span>{niceDate}</span>
                  {sel === TODAY && (
                    <span style={{ fontSize: "11.5px", background: "#dbeafe", color: "#1e40af", padding: "2px 8px", borderRadius: "99px", fontWeight: 700 }}>
                      Today
                    </span>
                  )}
                </h2>
                <button className="btn ghost sm" onClick={() => moveDay(1)} aria-label="Next day">
                  <ChevronRight size={16} />
                </button>
              </>
            )}

            <button
              className="btn ghost sm"
              onClick={() => {
                setCur({ y: t.getFullYear(), m: t.getMonth() });
                setSel(TODAY);
              }}
            >
              Today
            </button>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            {/* View Mode Toggle */}
            <div style={{ display: "flex", background: "#f1f5f9", padding: "3px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <button
                type="button"
                className={`btn sm ${viewMode === "timeline" ? "gold" : "ghost"}`}
                style={{ padding: "4px 10px", fontSize: "12.5px", display: "flex", alignItems: "center", gap: "6px" }}
                onClick={() => setViewMode("timeline")}
              >
                <Columns size={15} />
                <span>Doctor Timeline (Day)</span>
              </button>
              <button
                type="button"
                className={`btn sm ${viewMode === "month" ? "gold" : "ghost"}`}
                style={{ padding: "4px 10px", fontSize: "12.5px", display: "flex", alignItems: "center", gap: "6px" }}
                onClick={() => setViewMode("month")}
              >
                <LayoutGrid size={15} />
                <span>Month Overview</span>
              </button>
              <button
                type="button"
                className={`btn sm ${viewMode === "list" ? "gold" : "ghost"}`}
                style={{ padding: "4px 10px", fontSize: "12.5px", display: "flex", alignItems: "center", gap: "6px" }}
                onClick={() => setViewMode("list")}
              >
                <Calendar size={15} />
                <span>All Appointments ({appts.length})</span>
              </button>
            </div>

            {/* Doctor Filter */}
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "600", margin: 0 }}>
              <User size={15} color="#64748b" />
              <select
                value={vetFilter}
                onChange={e => setVetFilter(e.target.value)}
                style={{ width: "auto", padding: "6px 10px", fontSize: "13px" }}
              >
                <option value="">All Veterinarians</option>
                {VETS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>

            <button
              className="btn sm gold"
              onClick={() => setBookingSlot({ date: sel, time: "09:00", vetId: vetFilter || "v1" })}
              style={{ display: "flex", alignItems: "center", gap: "5px" }}
            >
              <Plus size={16} />
              <span>Book Visit</span>
            </button>
          </div>
        </div>

        {/* Month View Grid */}
        {viewMode === "month" && (
          <div className="ow-grid" role="grid" style={{ marginTop: "16px" }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} className="ow-dow">{d}</div>)}
            {cells.map(d => {
              const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              const items = ev[k] || [];
              const out = d.getMonth() !== cur.m;
              const isToday = k === TODAY;
              const isSel = k === sel;
              const loadCount = items.length;

              // Daily capacity meter status
              const loadBadge =
                loadCount === 0 ? null : loadCount <= 3 ? (
                  <span style={{ fontSize: "10px", color: "#16a34a", fontWeight: "700" }}>● Light ({loadCount})</span>
                ) : loadCount <= 7 ? (
                  <span style={{ fontSize: "10px", color: "#d97706", fontWeight: "700" }}>● Optimal ({loadCount})</span>
                ) : (
                  <span style={{ fontSize: "10px", color: "#dc2626", fontWeight: "700" }}>● Full ({loadCount})</span>
                );

              return (
                <button
                  key={k}
                  className={`ow-day${out ? " out" : ""}${isToday ? " today" : ""}${isSel ? " sel" : ""}`}
                  onClick={() => {
                    setSel(k);
                    if (out) setCur({ y: d.getFullYear(), m: d.getMonth() });
                  }}
                  style={{ minHeight: "88px", textAlign: "left", padding: "6px" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <b>{d.getDate()}</b>
                    {loadBadge}
                  </div>

                  <div className="ow-evs" style={{ marginTop: "4px" }}>
                    {items.slice(0, 3).map((item, i) => {
                      const svc = getServiceCategory(item.reason);
                      return (
                        <div
                          key={i}
                          style={{
                            fontSize: "11px",
                            lineHeight: "1.3",
                            padding: "2px 5px",
                            borderRadius: "4px",
                            background: svc.bg,
                            color: svc.color,
                            border: `1px solid ${svc.border}`,
                            fontWeight: "600",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            marginBottom: "2px",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                          title={`${item.time} ${item.pet} (${item.reason})`}
                        >
                          <span style={{ fontSize: "10px", fontWeight: "700" }}>{item.time}</span>
                          <span>{item.pet}</span>
                        </div>
                      );
                    })}
                    {items.length > 3 && (
                      <span style={{ fontSize: "10.5px", color: "#64748b", fontWeight: "700" }}>
                        +{items.length - 3} more
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Schedule Container */}
      {viewMode === "timeline" ? (
        /* Doctor Column Schedule (Hourly Timeline) */
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h3 style={{ margin: "0 0 2px", fontSize: "18px" }}>
                Doctor Appointment Schedule Timeline
              </h3>
              <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                Side-by-side doctor timetable for <b>{niceDate}</b>. Click any open slot to instantly book an arrival.
              </p>
            </div>

            {/* Service Legends */}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", fontSize: "11.5px" }}>
              <span style={{ background: "#ecfdf5", color: "#047857", padding: "3px 8px", borderRadius: "4px", border: "1px solid #a7f3d0", display: "flex", alignItems: "center", gap: "4px" }}>
                <Syringe size={12} /> Vaccine / Prophylaxis
              </span>
              <span style={{ background: "#eff6ff", color: "#1d4ed8", padding: "3px 8px", borderRadius: "4px", border: "1px solid #bfdbfe", display: "flex", alignItems: "center", gap: "4px" }}>
                <Stethoscope size={12} /> Consultation
              </span>
              <span style={{ background: "#f5f3ff", color: "#7c3aed", padding: "3px 8px", borderRadius: "4px", border: "1px solid #ddd6fe", display: "flex", alignItems: "center", gap: "4px" }}>
                <Scissors size={12} /> Surgery / Dental
              </span>
              <span style={{ background: "#fef2f2", color: "#b91c1c", padding: "3px 8px", borderRadius: "4px", border: "1px solid #fecaca", display: "flex", alignItems: "center", gap: "4px" }}>
                <AlertCircle size={12} /> Emergency
              </span>
            </div>
          </div>

          {/* Timeline Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ width: "90px", padding: "12px", textAlign: "center", borderRight: "1px solid #e2e8f0", fontSize: "13px", color: "var(--navy)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                      <Clock size={15} /> Time
                    </div>
                  </th>
                  {VETS.filter(([id]) => !vetFilter || id === vetFilter).map(([id, name]) => (
                    <th key={id} style={{ padding: "12px 16px", textAlign: "left", fontSize: "13.5px", color: "var(--navy)", borderRight: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ background: "#e0f2fe", padding: "6px", borderRadius: "6px", color: "#0369a1" }}>
                          <Stethoscope size={16} />
                        </div>
                        <div>
                          <b>{name}</b>
                          <small style={{ display: "block", color: "#64748b", fontWeight: "400", fontSize: "11.5px" }}>Clinical Station</small>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {TIME_SLOTS.map((time, idx) => {
                  return (
                    <tr key={time} style={{ borderBottom: "1px solid #f1f5f9", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                      {/* Time Slot Label */}
                      <td style={{ padding: "10px", textAlign: "center", fontWeight: "700", color: "#475569", borderRight: "1px solid #e2e8f0", fontSize: "13px" }}>
                        {time}
                      </td>

                      {/* Doctor Columns */}
                      {VETS.filter(([id]) => !vetFilter || id === vetFilter).map(([vetId]) => {
                        const apptMatch = dayEvents.find(e => e.vetId === vetId && e.time === time);

                        if (apptMatch) {
                          const svc = getServiceCategory(apptMatch.reason);
                          const { Icon } = svc;
                          const iv = apptMatch.appt.intakeVitals;

                          return (
                            <td key={vetId} style={{ padding: "8px 12px", borderRight: "1px solid #e2e8f0" }}>
                              <div
                                style={{
                                  background: svc.bg,
                                  border: `1px solid ${svc.border}`,
                                  borderRadius: "10px",
                                  padding: "10px 12px",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                                }}
                              >
                                <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                                  <div style={{ background: "#fff", padding: "6px", borderRadius: "8px", border: `1px solid ${svc.border}`, color: svc.color, marginTop: "2px" }}>
                                    <SpeciesIcon species={apptMatch.species} size={18} />
                                  </div>
                                  <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                      <b style={{ color: "var(--navy)", fontSize: "14px" }}>{apptMatch.pet}</b>
                                      <span style={{ fontSize: "12px", color: "#64748b" }}>({apptMatch.owner})</span>
                                      <span style={{ fontSize: "11px", fontWeight: "700", color: svc.color, display: "flex", alignItems: "center", gap: "3px" }}>
                                        <Icon size={12} /> {svc.label}
                                      </span>
                                    </div>

                                    <div style={{ fontSize: "12px", color: "#475569", marginTop: "2px" }}>
                                      {apptMatch.reason}
                                    </div>

                                    {iv && (
                                      <div style={{ marginTop: "4px", display: "flex", gap: "6px", fontSize: "11px" }}>
                                        <span style={{ background: "#fff", padding: "1px 6px", borderRadius: "4px", border: "1px solid #e2e8f0", color: "#334155" }}>
                                          Temp: {iv.temp}°C
                                        </span>
                                        <span style={{ background: "#fff", padding: "1px 6px", borderRadius: "4px", border: "1px solid #e2e8f0", color: "#334155" }}>
                                          Weight: {iv.weight} kg
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                  <Badge v={apptMatch.status} />

                                  {/* Assistant Actions */}
                                  {me.role === "assistant" && apptMatch.status === "Scheduled" && (
                                    <button
                                      className="btn sm"
                                      onClick={() => handleAction(apptMatch.appt, "Confirmed")}
                                      style={{ fontSize: "12px", padding: "4px 8px" }}
                                    >
                                      Confirm
                                    </button>
                                  )}

                                  {me.role === "assistant" && ["Scheduled", "Confirmed"].includes(apptMatch.status) && (
                                    <button
                                      className="btn sm gold"
                                      onClick={() => setCheckInAppt(apptMatch.appt)}
                                      style={{ fontSize: "12px", padding: "4px 8px" }}
                                      title="Intake triage and record vitals"
                                    >
                                      Check in
                                    </button>
                                  )}

                                  {/* Veterinarian Actions */}
                                  {me.role === "vet" && apptMatch.status === "Checked-in" && (
                                    <button
                                      className="btn sm gold"
                                      onClick={() => {
                                        moveAppt(setDb, apptMatch.appt.id, "In consultation", me);
                                        setActiveSoap({ appt: apptMatch.appt, pet: apptMatch.petObj });
                                      }}
                                      style={{ fontSize: "12px", padding: "4px 8px" }}
                                    >
                                      Consult
                                    </button>
                                  )}

                                  {me.role === "vet" && apptMatch.status === "In consultation" && (
                                    <button
                                      className="btn sm gold"
                                      onClick={() => setActiveSoap({ appt: apptMatch.appt, pet: apptMatch.petObj })}
                                      style={{ fontSize: "12px", padding: "4px 8px" }}
                                    >
                                      SOAP Notes
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                          );
                        }

                        // Empty slot
                        return (
                          <td key={vetId} style={{ padding: "6px 12px", borderRight: "1px solid #e2e8f0" }}>
                            <button
                              type="button"
                              className="btn ghost sm"
                              style={{
                                width: "100%",
                                borderStyle: "dashed",
                                borderColor: "#cbd5e1",
                                color: "#94a3b8",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "4px",
                                padding: "6px 8px",
                                fontSize: "11.5px",
                                background: "transparent",
                              }}
                              onClick={() => setBookingSlot({ date: sel, time, vetId })}
                            >
                              <Plus size={13} />
                              <span>Open Slot</span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Daily List below Month View */
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <div>
              <h3 style={{ margin: "0 0 4px", fontSize: "18px" }}>
                Visits Scheduled on {niceDate} {sel === TODAY ? "(Today)" : ""}
              </h3>
              <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                {dayEvents.length} patient visit(s) scheduled on this date
              </p>
            </div>
            <button className="btn sm ghost" onClick={() => setViewMode("timeline")}>
              Switch to Doctor Timeline View →
            </button>
          </div>

          {dayEvents.length ? (
            <div style={{ display: "grid", gap: "10px" }}>
              {dayEvents.map(e => {
                const svc = getServiceCategory(e.reason);
                const { Icon } = svc;
                return (
                  <div
                    key={e.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 16px",
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0",
                      background: e.status === "Checked-in" ? "#f0f7ff" : "#fff",
                    }}
                  >
                    <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
                      <b style={{ fontSize: "16px", color: "var(--navy)", minWidth: "55px" }}>{e.time}</b>
                      <div style={{ background: svc.bg, padding: "8px", borderRadius: "8px", border: `1px solid ${svc.border}`, color: svc.color }}>
                        <SpeciesIcon species={e.species} size={20} />
                      </div>
                      <div>
                        <div style={{ fontWeight: "700", fontSize: "14.5px", display: "flex", alignItems: "center", gap: "8px" }}>
                          <span>{e.pet}</span>
                          <span style={{ fontWeight: "400", color: "#64748b" }}>({e.owner})</span>
                          <span style={{ fontSize: "11px", color: svc.color, fontWeight: "700", display: "flex", alignItems: "center", gap: "3px" }}>
                            <Icon size={12} /> {svc.label}
                          </span>
                        </div>
                        <div style={{ fontSize: "12.5px", color: "#64748b", marginTop: "2px" }}>
                          <b>Reason:</b> {e.reason} &bull; <b>Doctor:</b> {e.vet}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <Badge v={e.status} />
                      {me.role === "assistant" && e.status === "Scheduled" && (
                        <button className="btn sm" onClick={() => handleAction(e.appt, "Confirmed")}>Confirm</button>
                      )}
                      {me.role === "assistant" && ["Scheduled", "Confirmed"].includes(e.status) && (
                        <button className="btn sm gold" onClick={() => setCheckInAppt(e.appt)}>Check in</button>
                      )}
                      {me.role === "vet" && e.status === "Checked-in" && (
                        <button className="btn sm gold" onClick={() => {
                          moveAppt(setDb, e.appt.id, "In consultation", me);
                          setActiveSoap({ appt: e.appt, pet: e.petObj });
                        }}>
                          Start Consultation
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty sm" style={{ padding: "28px" }}>
              No clinic visits scheduled on this date.
            </div>
          )}
        </div>
      )}

      {/* ALL APPOINTMENTS MASTER QUEUE & LIST */}
      {viewMode === "list" && (
        <div className="card" style={{ padding: "18px 22px" }}>
          {/* Search & Filter Bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flex: 1, minWidth: "260px" }}>
              <input
                type="search"
                placeholder="Search patient, owner, reason, or date..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: "100%", maxWidth: "340px", padding: "7px 12px", fontSize: "13px", borderRadius: "8px", border: "1.5px solid #cbd5e1" }}
              />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ padding: "7px 10px", fontSize: "13px", borderRadius: "8px", border: "1.5px solid #cbd5e1" }}
              >
                <option value="">All Statuses</option>
                {["Scheduled", "Confirmed", "Checked-in", "In consultation", "Completed", "Cancelled", "No-show"].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                className="btn sm gold"
                onClick={() => setBookingSlot({ date: TODAY, time: "10:00", vetId: vetFilter || "v1" })}
                style={{ fontWeight: 700 }}
              >
                + Book New Appointment
              </button>
            </div>
          </div>

          {/* Master Appointments Table */}
          {(() => {
            let filtered = db.appts.filter(a => !vetFilter || a.vetId === vetFilter);
            if (statusFilter) filtered = filtered.filter(a => a.status === statusFilter);
            if (search.trim()) {
              const q = search.trim().toLowerCase();
              filtered = filtered.filter(a => {
                const pet = db.pets.find(p => p.id === a.petId) || {};
                const owner = db.owners.find(o => o.id === pet.ownerId || o.userId === pet.ownerId) || {};
                return (
                  (pet.name && pet.name.toLowerCase().includes(q)) ||
                  (owner.name && owner.name.toLowerCase().includes(q)) ||
                  (a.reason && a.reason.toLowerCase().includes(q)) ||
                  (a.date && a.date.includes(q))
                );
              });
            }
            filtered.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

            if (!filtered.length) {
              return <div className="empty sm">No appointments match the selected filter.</div>;
            }

            return (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" }}>
                      <th style={{ padding: "10px 8px" }}>Date &amp; Time</th>
                      <th style={{ padding: "10px 8px" }}>Patient</th>
                      <th style={{ padding: "10px 8px" }}>Owner &amp; Contact</th>
                      <th style={{ padding: "10px 8px" }}>Veterinarian</th>
                      <th style={{ padding: "10px 8px" }}>Service / Reason</th>
                      <th style={{ padding: "10px 8px" }}>Status</th>
                      <th style={{ padding: "10px 8px" }}>Billing</th>
                      <th style={{ padding: "10px 8px", textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(a => {
                      const pet = db.pets.find(p => p.id === a.petId) || {};
                      const owner = db.owners.find(o => o.id === pet.ownerId || o.userId === pet.ownerId) || {};
                      const isPaid = a.billingStatus === "Paid";
                      const vetName = (VETS.find(v => v[0] === a.vetId) || [])[1] || "Dr. Cruz";

                      return (
                        <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                            <b>{a.date}</b>
                            <small style={{ display: "block", color: "#64748b" }}>{a.time}</small>
                          </td>

                          <td style={{ padding: "10px 8px" }}>
                            <span
                              onClick={() => setCardPetId(pet.id || a.petId)}
                              style={{ fontWeight: 700, color: "var(--navy)", cursor: "pointer", textDecoration: "underline" }}
                              title="Click to open official Digital Vaccination Card"
                            >
                              {pet.name || "Patient"}
                            </span>
                            <small style={{ display: "block", color: "#64748b" }}>
                              {pet.species ? formatSpeciesLabel(pet.species) : "Pet"} {pet.breed ? `(${pet.breed})` : ""}
                            </small>
                          </td>

                          <td style={{ padding: "10px 8px" }}>
                            <b>{owner.name || "Walk-in Owner"}</b>
                            <small style={{ display: "block", color: "#64748b" }}>{owner.phone || "No phone"}</small>
                          </td>

                          <td style={{ padding: "10px 8px", color: "#334155" }}>
                            {vetName}
                          </td>

                          <td style={{ padding: "10px 8px", maxWidth: "220px" }}>
                            <div style={{ color: "#1e293b", fontWeight: 500 }}>{a.reason}</div>
                          </td>

                          <td style={{ padding: "10px 8px" }}>
                            <Badge v={a.status} />
                          </td>

                          <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                            <span style={{
                              fontSize: "11.5px",
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: "6px",
                              background: isPaid ? "#dcfce7" : "#fef3c7",
                              color: isPaid ? "#166534" : "#92400e"
                            }}>
                              {isPaid ? `✓ Paid (₱${a.amount})` : `Unbilled (₱${a.amount || 600})`}
                            </span>
                          </td>

                          <td style={{ padding: "10px 8px", textAlign: "right" }}>
                            <div style={{ display: "inline-flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                              <button
                                type="button"
                                className="btn sm ghost"
                                onClick={() => setCardPetId(pet.id || a.petId)}
                                title="Open Digital Vaccination Card"
                                style={{ padding: "3px 8px", fontSize: "11.5px" }}
                              >
                                💳 Card
                              </button>

                              {a.status === "Scheduled" && me.role === "assistant" && (
                                <button
                                  type="button"
                                  className="btn sm"
                                  onClick={() => handleAction(a, "Confirmed")}
                                  style={{ padding: "3px 8px", fontSize: "11.5px" }}
                                >
                                  Confirm
                                </button>
                              )}

                              {["Scheduled", "Confirmed"].includes(a.status) && me.role === "assistant" && (
                                <button
                                  type="button"
                                  className="btn sm gold"
                                  onClick={() => setCheckInAppt(a)}
                                  style={{ padding: "3px 8px", fontSize: "11.5px", fontWeight: 700 }}
                                >
                                  Check in
                                </button>
                              )}

                              <button
                                type="button"
                                className={`btn sm ${isPaid ? "ghost" : "gold"}`}
                                onClick={() => setBillingAppt(a)}
                                style={{ padding: "3px 8px", fontSize: "11.5px", fontWeight: isPaid ? 500 : 700 }}
                              >
                                {isPaid ? "Receipt" : "🧾 Bill / Pay"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}

      {/* Quick Booking Modal from Open Slot */}
      {bookingSlot && (
        <QuickBookModal
          slot={bookingSlot}
          db={db}
          onClose={() => setBookingSlot(null)}
          onBook={handleQuickBook}
        />
      )}

      {/* Check In Modal */}
      {checkInAppt && (
        <CheckInModal
          appt={checkInAppt}
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setCheckInAppt(null)}
          onCheckedIn={() => {
            setCheckInAppt(null);
            say && say("Patient checked in with vitals! Moved to Doctor Queue.");
          }}
        />
      )}

      {/* Doctor SOAP Consultation Modal */}
      {activeSoap && (
        <SoapConsultationModal
          appt={activeSoap.appt}
          pet={activeSoap.pet}
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setActiveSoap(null)}
          onSaved={() => {
            setActiveSoap(null);
            say && say("SOAP consultation saved! Visit completed.");
          }}
        />
      )}

      {/* Front Desk Billing Modal */}
      {billingAppt && (
        <BillingModal
          appt={billingAppt}
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setBillingAppt(null)}
          onPaid={(amt) => {
            say && say(`Payment of ₱${amt.toLocaleString()} processed successfully!`);
          }}
        />
      )}

      {/* Official Digital Vaccination Card Modal */}
      {cardPetId && (
        <PetCardModal
          petId={cardPetId}
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setCardPetId(null)}
          onBook={() => {
            setCardPetId(null);
            setBookingSlot({ date: TODAY, time: "10:00", vetId: vetFilter || "v1" });
          }}
        />
      )}
    </div>
  );
}

function QuickBookModal({ slot, db, onClose, onBook }) {
  const [petId, setPetId] = useState(db.pets[0] ? db.pets[0].id : "");
  const [vetId, setVetId] = useState(slot.vetId || "v1");
  const [date, setDate] = useState(slot.date || TODAY);
  const [time, setTime] = useState(slot.time || "09:00");
  const [service, setService] = useState("Consultation");
  const [reason, setReason] = useState("");

  const selectedPet = db.pets.find(p => p.id === petId) || {};
  const owner = db.owners.find(o => o.id === selectedPet.ownerId) || {};

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!petId) return;
    onBook(petId, service, reason || "General visit", vetId, date, time);
  };

  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: "min(540px, 100%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px", marginBottom: "16px" }}>
          <h3 style={{ margin: 0, fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Calendar size={20} color="var(--navy)" />
            <span>Book Clinic Visit</span>
          </h3>
          <button className="btn ghost sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gap: "12px" }}>
            <div className="fld">
              <label>Select Patient (Pet &amp; Owner)</label>
              <select value={petId} onChange={e => setPetId(e.target.value)} required>
                {db.pets.map(p => {
                  const o = db.owners.find(x => x.id === p.ownerId) || {};
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.species} &bull; {p.breed || "Mixed"}) — Owner: {o.name}
                    </option>
                  );
                })}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div className="fld">
                <label>Veterinarian</label>
                <select value={vetId} onChange={e => setVetId(e.target.value)}>
                  {VETS.map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              </div>

              <div className="fld">
                <label>Service Category</label>
                <select value={service} onChange={e => setService(e.target.value)}>
                  <option value="General Consultation">General Consultation</option>
                  <option value="Vaccination & Prophylaxis">Vaccination &amp; Booster</option>
                  <option value="Deworming Routine">Deworming Routine</option>
                  <option value="Diagnostic Bloodwork & Lab">Diagnostic Lab / X-Ray</option>
                  <option value="Surgery / Dental">Minor Surgery / Dental</option>
                  <option value="Health Certificate">Health Certificate</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div className="fld">
                <label>Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
              </div>

              <div className="fld">
                <label>Time Slot</label>
                <select value={time} onChange={e => setTime(e.target.value)}>
                  {TIME_SLOTS.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="fld">
              <label>Reason / Owner Symptoms</label>
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Annual booster, lethargy, skin itching..."
              />
            </div>
          </div>

          <div className="row end" style={{ marginTop: "18px", gap: "10px" }}>
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn gold" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Check size={16} />
              <b>Confirm Booking</b>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
