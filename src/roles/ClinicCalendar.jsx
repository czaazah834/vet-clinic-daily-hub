import { approvalVisit } from "../appointmentStatus.js";
import CancellationDialog from '../components/CancellationDialog.jsx';
import { intakeVisitSnapshot } from '../intakeVisit.js';
import LiveControl from '../components/LiveControl.jsx';
import { VaccinePicker, VaccineEstimate, useBookingCatalog } from '../components/VaccineBooking.jsx';
import { vaccineChoiceError, vaccineIdFromReason, vaccineReason, vaccinePriceLabel } from '../vaccineBooking.js';
import { PaginatedList, PaginatedTable } from "../components/Pagination.jsx";
import {useFollowingClinicDay} from "../useClinicDay.js";
import { checkInDateError } from "../intakeVisit.js";
import { useSubmissionReview } from "../components/SubmissionReview.jsx";
import { confirmedBooking } from "../receptionSaves.js";
import { completedVisitRecord } from "../vetQueue.js";
import { ConsultationDetailModal } from "./ConsultationsPage.jsx";
import { canBookAppointments } from "../appointmentPermissions.js";
import { prefill } from "./owner/ui.jsx";
import { openFollowUps } from "../clinicalWorkflow.js";
import { useAvailability } from "../useAvailability.js";
import { lastDay, today as bookingToday, SERVICES, openSlots, reservationCovers, addMin, durOf } from "../booking.js";
import { useRef, useState } from "react";
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
import { VETS, scope, petName, ownerName, dueState, moveAppt, LABEL, Badge, uid, addLog } from "../lib.jsx";
import { calendarDoctors } from "./calendarDoctors.js";
import "./clinic-calendar.css";
import { api } from "../api.js";
import { isVet } from "./clinicValidation.js";
import CheckInModal from "./CheckInModal.jsx";
import SoapConsultationModal from "./SoapConsultationModal.jsx";
import BillingModal from "./BillingModal.jsx";
import PetCardModal from "./PetCardModal.jsx";
import { formatSpeciesLabel } from "../preventiveSchedule.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const TIME_SLOTS = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
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
  const TODAY = bookingToday();
  const t = new Date(`${TODAY}T00:00:00`);
  const curYearMin = t.getFullYear();
  const curMonthMin = t.getMonth();
  const [cur, setCur] = useState({ y: curYearMin, m: curMonthMin });
  const isDoctor = isVet(me?.role);
  const canBook = canBookAppointments(me?.role);
  const [viewMode, setViewMode] = useState(me?.role === "owner" ? "month" : "timeline"); // 'timeline' | 'month' | 'list'
  const doctors = calendarDoctors(db, me, VETS);
  const [selectedVet, setVetFilter] = useState("");
  const vetFilter = isDoctor ? me?.vetId || me?.id : selectedVet;
  const visibleDoctors = doctors.filter(([id]) => !vetFilter || id === vetFilter);
  const [sel, setSel] = useFollowingClinicDay();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const bookingRequest = useRef(null);
  const confirmingRef = useRef(new Set());
  const [confirming, setConfirming] = useState({});
  const [actionError, setActionError] = useState("");
  const [startingId, setStartingId] = useState(null);
  const starting = useRef(false);
  const [selectedRecord, setSelectedRecord] = useState(null);

  const canGoPrevMonth = cur.y > curYearMin || (cur.y === curYearMin && cur.m > curMonthMin);
  const canGoNextMonth = cur.y < curYearMin + 1 || (cur.y === curYearMin + 1 && cur.m < 11);

  // Modals
  const [bookingSlot, setBookingSlot] = useState(() => { const start = prefill.data; prefill.data = null; return canBook && start ? {...start, time:"", vetId:""} : null; }); // { date, time, vetId }
  const [closingVisit,setClosingVisit] = useState(null);
  const [checkInAppt, setCheckInAppt] = useState(null);
  const [activeSoap, setActiveSoap] = useState(null);
  const [billingAppt, setBillingAppt] = useState(null);
  const [cardPetId, setCardPetId] = useState(null);
  const [cardAppt, setCardAppt] = useState(null);

  const slotsByVet = Object.fromEntries(visibleDoctors.map(([id]) => [id, openSlots(db, { vetId: id, date: sel, service: "vaccination" })]));
  const appts = db.appts.filter(a => (!vetFilter || a.vetId === vetFilter) && !["Cancelled","Rejected","No-show"].includes(a.status));

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
      vet: (doctors.find(v => v[0] === a.vetId) || [])[1] || "",
      appt: a,
      petObj: pet,
    });
  });

  const first = new Date(cur.y, cur.m, 1);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(cur.y, cur.m, 1 - first.getDay() + i));
  const moveMonth = n => {
    if (n < 0 && !canGoPrevMonth) return;
    if (n > 0 && !canGoNextMonth) return;
    const d = new Date(cur.y, cur.m + n, 1);
    setCur({ y: d.getFullYear(), m: d.getMonth() });
  };

  const moveDay = n => {
    const d = new Date(sel + "T00:00:00");
    d.setDate(d.getDate() + n);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setSel(next);
    setCur({ y: d.getFullYear(), m: d.getMonth() });
  };

  const dayEvents = (ev[sel] || []).slice().sort((a, b) => a.time.localeCompare(b.time));
  const niceDate = new Date(sel + "T00:00:00").toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const handleAction = async (a, action) => {
    if (confirmingRef.current.has(a.id)) return;
    confirmingRef.current.add(a.id);
    setActionError("");
    setConfirming(p => ({...p,[a.id]:true}));
    const saved = await moveAppt(setDb, a.id, action, me, setActionError, approvalVisit(db,a));
    confirmingRef.current.delete(a.id);
    setConfirming(p => ({...p,[a.id]:false}));
    if (saved) say && say(`${LABEL[action] || action} updated`);
  };

  const startConsultation = async (visit, pet) => {
    if (starting.current || !isDoctor) return;
    setActionError("");
    if (!pet?.id) return setActionError("Patient record not found. Refresh clinic records before retrying.");
    starting.current = true;
    setStartingId(visit.id);
    try {
      if (await moveAppt(setDb, visit.id, "In consultation", me, setActionError, visit)) {
        setActiveSoap({ appt: { ...visit, status: "In consultation" }, pet });
      }
    } finally {
      starting.current = false;
      setStartingId(null);
    }
  };

  const doctorActions = (visit, pet) => {
    if (!isDoctor) return null;
    if (visit.status === "Checked-in") return <button className="btn sm gold" disabled={!!startingId} onClick={() => startConsultation(visit, pet)}>{startingId === visit.id ? "Starting…" : "Start consultation"}</button>;
    if (visit.status === "In consultation") return <button className="btn sm gold" disabled={!!startingId} onClick={() => setActiveSoap({ appt: visit, pet })}>Resume SOAP notes</button>;
    if (visit.status === "Completed") return <button className="btn sm ghost" onClick={() => {
      setActionError("");
      const record = completedVisitRecord(db.records || [], visit);
      if (!record) return setActionError("Saved notes for this completed visit are unavailable. Refresh clinic records and try again.");
      setSelectedRecord(record);
    }}>View saved notes</button>;
    return null;
  };

  const manageAppointment = visit => me.role === "assistant" && ["Pending Approval", "Scheduled"].includes(visit.status)
    ? <><button className="btn sm ghost" onClick={() => setBookingSlot({...visit, editing:true})}>Reschedule / edit</button>
      <button className="btn danger sm" onClick={()=>{setActionError("");setClosingVisit({visit,status:"Cancelled"});}}>Cancel visit</button>
      {visit.status==="Pending Approval" && <button className="btn danger sm" onClick={()=>{setActionError("");setClosingVisit({visit,status:"Rejected"});}}>Reject request</button>}</> : null;

  // Quick booking submit saved to PostgreSQL backend
  const handleQuickBook = async (petId, serviceName, reasonText, targetVetId, targetDate, targetTime, followUpId, vaccineId) => {
    if (!canBook) throw new Error("Only owners and reception can book visits.");
    const previous = bookingSlot?.editing ? bookingSlot : null;
    if (previous && me.role !== "assistant") throw new Error("Reception manages appointment reassignment.");
    if (bookingRequest.current?.slot !== bookingSlot) bookingRequest.current = {slot:bookingSlot,id:"a_"+crypto.randomUUID()};
    const newApptId = previous?.id || bookingRequest.current.id;
    const reason = serviceName === "vaccination" ? reasonText : previous && previous.service === serviceName && previous.reason === reasonText ? reasonText
      : serviceName ? `${SERVICES[serviceName]?.label || serviceName}: ${reasonText}` : reasonText;
    const payload = {
      ...(previous ? {expectedVisit:intakeVisitSnapshot(previous)} : {}),
      id: newApptId, followUpId: followUpId || null, petId, vetId: targetVetId,
      date: targetDate, time: targetTime, service: serviceName, reason,
      ...(serviceName === "vaccination" ? {vaccineId} : {}),
      notes: previous?.notes || "",
      status: previous && previous.petId === petId && previous.vetId === targetVetId && previous.date === targetDate && previous.time === targetTime && previous.service === serviceName && (serviceName !== "vaccination" || previous.reason === reason) ? previous.status : "Pending Approval",
      actorName: me.name, actorRole: me.role,
    };
    const response = previous ? await api.put(`/api/appointments/${previous.id}`, payload) : await api.post("/api/appointments", payload);
    const newAppt = confirmedBooking(response, payload);

    setDb(p => ({
      ...p,
      appts: [...p.appts.filter(a => a.id !== newApptId), newAppt],
      log: addLog(p, me, `${me.name} ${previous ? "updated" : "scheduled"} appointment for ${petName(p, petId)} with ${(doctors.find(v => v[0] === targetVetId) || [])[1]} on ${targetDate} at ${targetTime}.`),
    }));

    // Auto-update Doctor Timeline to the booked date and focus on that slot
    setSel(targetDate);
    const dTarget = new Date(targetDate + "T00:00:00");
    if (!isNaN(dTarget.getTime())) {
      setCur({ y: dTarget.getFullYear(), m: dTarget.getMonth() });
    }
    if (me.role !== "owner") {
      setViewMode("timeline");
    }
    setBookingSlot(null);
    say && say(`Appointment ${previous ? "updated" : "booked"} for ${petName(db, petId)} on ${targetDate} at ${targetTime}!`);
  };

  return (
    <div className="clinic-calendar">
      {closingVisit && <CancellationDialog reject={closingVisit.status==="Rejected"} visit={closingVisit.visit} currentVisit={db.appts.find(a=>a.id===closingVisit.visit.id)} error={actionError} onClose={()=>setClosingVisit(null)}
        onSubmit={async cancelReason=>{if(await moveAppt(setDb,closingVisit.visit.id,closingVisit.status,me,setActionError,closingVisit.visit,{cancelReason})){setClosingVisit(null);say?.("Appointment "+closingVisit.status.toLowerCase());}}} />}
      {startingId && <p role="status">Starting consultation… Please wait for confirmation.</p>}
      {selectedRecord && <ConsultationDetailModal record={selectedRecord} db={db} setDb={setDb} me={me} onClose={() => setSelectedRecord(null)} />}
      {actionError && <p className="err" role="alert">{actionError}</p>}
      {/* Top Header Card */}
      <div className="card cc-toolbar">
        <div className="cc-controls">
          <div className="cc-date-controls">
            {viewMode === "month" ? (
              <>
                <button
                  className="btn ghost sm"
                  onClick={() => moveMonth(-1)}
                  disabled={!canGoPrevMonth}
                  style={{ opacity: canGoPrevMonth ? 1 : 0.35, cursor: canGoPrevMonth ? "pointer" : "not-allowed" }}
                  aria-label="Previous month"
                  title={canGoPrevMonth ? "Previous month" : "Cannot navigate to past months"}
                >
                  <ChevronLeft size={16} />
                </button>
                <h2 style={{ margin: 0, fontSize: "19px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Calendar size={20} color="var(--navy)" />
                  <span>{MONTHS[cur.m]} {cur.y}</span>
                </h2>
                <button
                  className="btn ghost sm"
                  onClick={() => moveMonth(1)}
                  disabled={!canGoNextMonth}
                  style={{ opacity: canGoNextMonth ? 1 : 0.35, cursor: canGoNextMonth ? "pointer" : "not-allowed" }}
                  aria-label="Next month"
                  title={canGoNextMonth ? "Next month" : "Booking permitted up to next calendar year"}
                >
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

          <div className="cc-view-controls">
            {/* View Mode Toggle */}
            <div className="cc-tabs" role="group" aria-label="Schedule view">
              {me.role !== "owner" && (
                <button
                  type="button"
                  aria-pressed={viewMode === "timeline"}
                  className={`btn sm ${viewMode === "timeline" ? "gold" : "ghost"}`}
                  style={{ padding: "4px 10px", fontSize: "12.5px", display: "flex", alignItems: "center", gap: "6px" }}
                  onClick={() => setViewMode("timeline")}
                >
                  <Columns size={15} />
                  <span>Day timeline</span>
                </button>
              )}
              <button
                type="button"
                aria-pressed={viewMode === "month"}
                className={`btn sm ${viewMode === "month" ? "gold" : "ghost"}`}
                style={{ padding: "4px 10px", fontSize: "12.5px", display: "flex", alignItems: "center", gap: "6px" }}
                onClick={() => setViewMode("month")}
              >
                <LayoutGrid size={15} />
                <span>Month</span>
              </button>
              <button
                type="button"
                aria-pressed={viewMode === "list"}
                className={`btn sm ${viewMode === "list" ? "gold" : "ghost"}`}
                style={{ padding: "4px 10px", fontSize: "12.5px", display: "flex", alignItems: "center", gap: "6px" }}
                onClick={() => setViewMode("list")}
              >
                <Calendar size={15} />
                <span>Appointments ({appts.length})</span>
              </button>
            </div>

            {/* Doctor Filter */}
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "600", margin: 0 }}>
              <User size={15} color="#64748b" />
              <select
                aria-label="Veterinarian"
                disabled={isDoctor}
                value={vetFilter}
                onChange={e => setVetFilter(e.target.value)}
                style={{ width: "auto", padding: "6px 10px", fontSize: "13px" }}
              >
                {!isDoctor && <option value="">All Veterinarians</option>}
                {doctors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>

            {canBook && (
              <button
                className="btn sm gold"
                onClick={() => setBookingSlot({ date: sel < TODAY ? TODAY : sel, time: "09:00", vetId: vetFilter || doctors[0]?.[0] })}
                style={{ display: "flex", alignItems: "center", gap: "5px" }}
              >
                <Plus size={16} />
                <span>Book Visit</span>
              </button>
            )}
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
              const isPast = k < TODAY;
              const loadCount = items.length;

              // Daily capacity meter status
              const loadBadge = isPast ? (
                <span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: "600" }}>Past</span>
              ) : loadCount === 0 ? null : loadCount <= 3 ? (
                <span style={{ fontSize: "10px", color: "#16a34a", fontWeight: "700" }}>Light ({loadCount})</span>
              ) : loadCount <= 7 ? (
                <span style={{ fontSize: "10px", color: "#d97706", fontWeight: "700" }}>Optimal ({loadCount})</span>
              ) : (
                <span style={{ fontSize: "10px", color: "#dc2626", fontWeight: "700" }}>Full ({loadCount})</span>
              );

              return (
                <button
                  key={k}
                  className={`ow-day${out ? " out" : ""}${isToday ? " today" : ""}${isSel ? " sel" : ""}`}
                  onClick={() => {
                    setSel(k);
                    if (out) setCur({ y: d.getFullYear(), m: d.getMonth() });
                  }}
                  style={{
                    minHeight: "88px",
                    textAlign: "left",
                    padding: "6px",
                    background: isPast ? "#f8fafc" : "#ffffff",
                    opacity: isPast && !isSel ? 0.75 : 1
                  }}
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
      {viewMode === "timeline" && me.role !== "owner" ? (
        /* Doctor Column Schedule (Hourly Timeline) */
        <div className="card cc-schedule">
          <div className="cc-schedule-heading">
            <div>
              <h3 style={{ margin: "0 0 2px", fontSize: "18px" }}>
                {isDoctor ? "Your daily schedule" : "Clinic daily schedule"}
              </h3>
              <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                {isDoctor ? "View your assigned visits and continue patient care. Reception manages bookings." : canBook ? "View each veterinarian’s day. Choose an open slot to book a visit." : "Review clinic capacity and appointments."}
              </p>
            </div>

            {/* Service Legends */}
            <div className="cc-legend" aria-label="Service categories">
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

          <div className="cc-day-summary">
            <div><Calendar size={20} /><span><strong>{dayEvents.length}</strong> {dayEvents.length === 1 ? "appointment" : "appointments"}</span></div>
            <div><Activity size={20} /><span><strong>{dayEvents.filter(e => ["Checked-in", "In consultation"].includes(e.status)).length}</strong> in clinic</span></div>
            <div><CheckCircle2 size={20} /><span><strong>{dayEvents.filter(e => e.status === "Completed").length}</strong> completed</span></div>
          </div>
          {dayEvents.length === 0 && <div className="cc-empty" role="status"><Calendar size={22} /><div><b>No appointments for this day</b><span>{isDoctor ? "Choose another date to review your assigned visits. Reception manages bookings." : canBook ? "Choose an open slot below to book the first visit." : "There are no visits to review for this date."}</span></div></div>}
          {/* Timeline Table */}
          <div className="cc-timeline-scroll" role="region" aria-label="Daily doctor timetable" tabIndex={0}>
            <PaginatedTable label="Doctor timeline" resetKey={[sel,vetFilter]} className="cc-timeline" style={{ minWidth: `${100 + visibleDoctors.length * 270}px` }}>
              <caption className="cc-sr-only">Appointments for {niceDate}</caption>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th scope="col" style={{ width: "100px", padding: "12px", textAlign: "center", borderRight: "1px solid #e2e8f0", fontSize: "13px", color: "var(--navy)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                      <Clock size={15} /> Time
                    </div>
                  </th>
                  {visibleDoctors.map(([id, name]) => (
                    <th scope="col" key={id} style={{ padding: "12px 16px", textAlign: "left", fontSize: "13.5px", color: "var(--navy)", borderRight: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ background: "#e0f2fe", padding: "6px", borderRadius: "6px", color: "#0369a1" }}>
                          <Stethoscope size={16} />
                        </div>
                        <div>
                          <b>{name}</b>
                          <small style={{ display: "block", color: "#64748b", fontWeight: "400", fontSize: "11.5px" }}>{dayEvents.filter(e => e.vetId === id).length} {dayEvents.filter(e => e.vetId === id).length === 1 ? "appointment" : "appointments"}</small>
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
                      <th scope="row" className="cc-time">{time}</th>

                      {/* Doctor Columns */}
                      {visibleDoctors.map(([vetId]) => {
                        const apptMatch = dayEvents.find(e => e.vetId === vetId && e.time === time);

                        if (apptMatch) {
                          const svc = getServiceCategory(apptMatch.reason);
                          const { Icon } = svc;
                          const iv = apptMatch.appt.intakeVitals;

                          return (
                            <td key={vetId} style={{ padding: "8px 12px", borderRight: "1px solid #e2e8f0" }}>
                              <div
                                className="cc-appointment"
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
                                  {me.role === "assistant" && apptMatch.status === "Pending Approval" && (
                                    <button
                                      className="btn sm"
                                      disabled={!!confirming[apptMatch.id]}
                                      onClick={() => handleAction(apptMatch.appt, "Scheduled")}
                                      style={{ fontSize: "12px", padding: "4px 8px" }}
                                    >
                                      {confirming[apptMatch.id] ? "Approving…" : "Approve"}
                                    </button>
                                  )}

                                  {me.role === "assistant" && apptMatch.status === "Scheduled" && (
                                    <button
                                      className="btn sm gold"
                                      onClick={() => setCheckInAppt(apptMatch.appt)}
                                      style={{ fontSize: "12px", padding: "4px 8px" }}
                                      disabled={!!checkInDateError(apptMatch.appt, bookingToday())}
                                      title={checkInDateError(apptMatch.appt, bookingToday()) || "Intake triage and record vitals"}
                                    >
                                      Check in
                                    </button>
                                  )}

                                  {manageAppointment(apptMatch.appt)}
                                  {doctorActions(apptMatch.appt, apptMatch.petObj)}
                                </div>
                              </div>
                            </td>
                          );
                        }

                        const continuing = dayEvents.find(e => e.vetId === vetId && reservationCovers(e.appt, time));
                        if (continuing) return <td key={vetId} style={{ padding: "8px 12px", background: "#f1f5f9" }}>Reserved until {addMin(continuing.time, durOf(continuing.appt))}</td>;

                        // Empty slot
                        return (
                          <td key={vetId} style={{ padding: "6px 12px", borderRight: "1px solid #e2e8f0" }}>
                            {canBook && slotsByVet[vetId]?.includes(time) ? (
                              <button
                                type="button"
                                className="btn ghost sm cc-open-slot"
                                aria-label={`Book ${time} with ${doctors.find(d => d[0] === vetId)?.[1]}`}
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
                                <span>Book visit</span>
                              </button>
                            ) : (
                              <div
                                className="cc-available"
                                style={{
                                  width: "100%",
                                  border: "1px dashed #e2e8f0",
                                  color: "#94a3b8",
                                  textAlign: "center",
                                  padding: "6px 8px",
                                  fontSize: "11px",
                                  borderRadius: "6px",
                                  background: "#f8fafc"
                                }}
                              >
                                {sel < bookingToday() ? "Past" : slotsByVet[vetId]?.includes(time) ? "Available" : "Unavailable"}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </PaginatedTable>
          </div>
        </div>
      ) : (
        /* Daily List below Month View */
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h3 style={{ margin: "0 0 4px", fontSize: "18px" }}>
                Visits on {niceDate} {sel === TODAY ? "(Today)" : ""}
              </h3>
              <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                {dayEvents.length} patient visit(s) scheduled on this date
              </p>
            </div>
            <button className="btn sm ghost" onClick={() => setViewMode("timeline")}>
              Switch to doctor timeline view
            </button>
          </div>

          {dayEvents.length ? (
            <PaginatedList label="Daily appointments" resetKey={[sel,vetFilter]} style={{ display: "grid", gap: "10px" }}>
              {dayEvents.map(e => {
                const svc = getServiceCategory(e.reason);
                const { Icon } = svc;
                return (
                  <div
                    key={e.id}
                    className="cc-day-visit"
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
                        <div style={{ fontWeight: "700", fontSize: "14.5px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
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
                      {me.role === "assistant" && e.status === "Pending Approval" && (
                        <button className="btn sm" disabled={!!confirming[e.id]} onClick={() => handleAction(e.appt, "Scheduled")}>{confirming[e.id] ? "Approving…" : "Approve"}</button>
                      )}
                      {me.role === "assistant" && e.status === "Scheduled" && (
                        <button className="btn sm gold" disabled={!!checkInDateError(e.appt, bookingToday())} title={checkInDateError(e.appt, bookingToday()) || "Record intake vitals"} onClick={() => setCheckInAppt(e.appt)}>Check in</button>
                      )}
                      {manageAppointment(e.appt)}
                      {doctorActions(e.appt, e.petObj)}
                    </div>
                  </div>
                );
              })}
            </PaginatedList>
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
                {["Pending Approval", "Scheduled", "Checked-in", "In consultation", "Completed", "Cancelled", "Rejected", "No-show"].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {canBook && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  className="btn sm gold"
                  onClick={() => setBookingSlot({ date: TODAY, time: "10:00", vetId: vetFilter || doctors[0]?.[0] })}
                  style={{ fontWeight: 700 }}
                >
                  + Book New Appointment
                </button>
              </div>
            )}
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
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", padding: "8px 14px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12.5px", color: "#475569" }}>
                  <span><b>Tip:</b> Click any appointment row to open the pet&rsquo;s official Digital Vaccination Card and review visit details.</span>
                  <span style={{ fontWeight: 600 }}>{filtered.length} appointment(s)</span>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <PaginatedTable label="Appointments" resetKey={[search,statusFilter,vetFilter]} style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" }}>
                        <th style={{ padding: "10px 10px" }}>Date &amp; Time</th>
                        <th style={{ padding: "10px 10px" }}>Patient</th>
                        <th style={{ padding: "10px 10px" }}>Owner &amp; Contact</th>
                        <th style={{ padding: "10px 10px" }}>Veterinarian</th>
                        <th style={{ padding: "10px 10px" }}>Service / Reason</th>
                        <th style={{ padding: "10px 10px" }}>Status</th>
                        <th style={{ padding: "10px 10px" }}>Billing</th>
                        {(isDoctor || me.role === "assistant") && <th style={{ padding: "10px 10px" }}>{isDoctor ? "Patient care" : "Scheduling"}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(a => {
                        const pet = db.pets.find(p => p.id === a.petId) || {};
                        const owner = db.owners.find(o => o.id === pet.ownerId || o.userId === pet.ownerId) || {};
                        const isPaid = a.billingStatus === "Paid";
                        const vetName = (doctors.find(v => v[0] === a.vetId) || [])[1] || "Veterinarian not recorded";

                        return (
                          <tr
                            key={a.id}
                            onClick={() => {
                              setCardAppt(a);
                              setCardPetId(a.petId);
                            }}
                            style={{
                              borderBottom: "1px solid #f1f5f9",
                              cursor: "pointer",
                              transition: "background 0.15s ease",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f9ff")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            title="Click row to open Digital Vaccination Card and manage actions"
                          >
                            <td style={{ padding: "11px 10px", whiteSpace: "nowrap" }}>
                              <b style={{ color: "var(--navy)" }}>{a.date}</b>
                              <small style={{ display: "block", color: "#64748b" }}>{a.time}</small>
                            </td>

                            <td style={{ padding: "11px 10px" }}>
                              <span style={{ fontWeight: 700, color: "var(--navy)", textDecoration: "underline" }}>
                                {pet.name || "Patient"}
                              </span>
                              <small style={{ display: "block", color: "#64748b" }}>
                                {pet.species ? formatSpeciesLabel(pet.species) : "Pet"} {pet.breed ? `(${pet.breed})` : ""}
                              </small>
                            </td>

                            <td style={{ padding: "11px 10px" }}>
                              <b>{owner.name || "Walk-in Owner"}</b>
                              <small style={{ display: "block", color: "#64748b" }}>{owner.phone || "No phone"}</small>
                            </td>

                            <td style={{ padding: "11px 10px", color: "#334155" }}>
                              {vetName}
                            </td>

                            <td style={{ padding: "11px 10px", maxWidth: "260px" }}>
                              <div style={{ color: "#1e293b", fontWeight: 500 }}>{a.reason}</div>{a.cancelReason && <small>{a.status === "Rejected" ? "Rejection" : "Cancellation"}: {a.cancelReason}</small>}<VaccineEstimate appointment={a} compact />
                            </td>

                            <td style={{ padding: "11px 10px" }}>
                              <Badge v={a.status} />
                            </td>

                            <td style={{ padding: "11px 10px", whiteSpace: "nowrap" }}>
                              {isPaid ? (
                                <span style={{
                                  fontSize: "11.5px",
                                  fontWeight: 700,
                                  padding: "2px 8px",
                                  borderRadius: "6px",
                                  background: "#dcfce7",
                                  color: "#166534"
                                }}>
                                  Paid (₱{a.amount})
                                </span>
                              ) : a.status === "Completed" ? (
                                <span style={{
                                  fontSize: "11.5px",
                                  fontWeight: 700,
                                  padding: "2px 8px",
                                  borderRadius: "6px",
                                  background: "#fef3c7",
                                  color: "#92400e"
                                }}>
                                  {a.billingStatus || "Unbilled"}
                                </span>
                              ) : (
                                <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                                  {a.billingStatus || "Unbilled"}
                                </span>
                              )}
                            </td>
                            {(isDoctor || me.role === "assistant") && <td style={{ padding: "11px 10px" }} onClick={e => e.stopPropagation()}>{manageAppointment(a)}{doctorActions(a, pet)}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </PaginatedTable>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Quick Booking Modal from Open Slot */}
      {canBook && bookingSlot && (
        <QuickBookModal
          doctors={Array.isArray(db.vets) ? db.vets.map(v => [v.id,v.name]) : doctors}
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
          appt={cardAppt}
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => {
            setCardPetId(null);
            setCardAppt(null);
          }}
          onBook={canBook ? () => {
            setCardPetId(null);
            setCardAppt(null);
            setBookingSlot({ date: TODAY, time: "10:00", vetId: vetFilter || doctors[0]?.[0] });
          } : undefined}
          onCheckIn={(a) => {
            setCardPetId(null);
            setCardAppt(null);
            setCheckInAppt(a);
          }}
          onBill={(a) => {
            setCardPetId(null);
            setCardAppt(null);
            setBillingAppt(a);
          }}
        />
      )}
    </div>
  );
}

function QuickBookModal({ slot, db, doctors, onClose, onBook }) {
  const TODAY = bookingToday();
  const [petId, setPetId] = useState(slot.petId || db.pets[0]?.id || "");
  const [vetId, setVetId] = useState(slot.vetId || doctors[0]?.[0] || "");
  const [date, setDate] = useState(slot.fromVaccineCard || slot.followUpId ? slot.date : slot.date && slot.date >= TODAY ? slot.date : TODAY);
  const [time, setTime] = useState(slot.time || "09:00");
  const [service, setService] = useState(slot.service || "checkup");
  const [reason, setReason] = useState(slot.reason || "");
  const [vaccineId,setVaccineId]=useState(vaccineIdFromReason(slot.reason) || (slot.service === 'vaccination' && slot.reason ? 'vet-review' : ''));
  const catalog=useBookingCatalog()?.data?.catalog || [];
  const [followUpId, setFollowUpId] = useState(slot.followUpId || "");
  const [dateErr, setDateErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const bookingFlight = useRef(false);

  const curYear = new Date().getFullYear();
  const maxBookingDate = lastDay();
  const availability = useAvailability({ vetId, date, service, excludeId:slot.editing ? slot.id : undefined });

  const review = useSubmissionReview([petId,vetId,date,time,service,reason,vaccineId,followUpId,slot,db.appts.find(a => a.id === slot.id),doctors]);
  const selectedPet = db.pets.find(p => p.id === petId) || {};
  const owner = db.owners.find(o => o.id === selectedPet.ownerId) || {};
  const followUp = db.records.find(r => r.id === followUpId && r.petId === petId);

  const validateDate = (val) => {
    if (!val) return "Please choose an appointment date.";
    if (val > maxBookingDate) return "Choose a date within the next 90 days.";
    if (val < TODAY) return "Appointments cannot be booked for past dates. Please select today or a future date.";
    const yr = parseInt(val.slice(0, 4), 10);
    if (isNaN(yr) || yr < curYear || yr > curYear + 1) {
      return `Invalid year (${yr}). Appointments can only be scheduled for ${curYear} or ${curYear + 1}.`;
    }
    return "";
  };

  const handleDateChange = (val) => {
    setDate(val);
    setDateErr(validateDate(val));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (bookingFlight.current) return;
    setSaveError("");
    if (!petId) return;
    if (!doctors.some(([id]) => id === vetId)) { setSaveError("Choose an active veterinarian."); return; }
    if (!availability.slots.includes(time)) { setDateErr("Choose an available time from the list."); availability.refresh(); return; }
    const err = validateDate(date);
    if (err) {
      setDateErr(err);
      return;
    }
    const dup = (db.appts || []).find(a => a.id !== (slot.editing ? slot.id : null) && a.petId === petId && a.date === date && a.time === time && !["Cancelled","Rejected","No-show"].includes(a.status));
    if (dup) {
      setDateErr(`${selectedPet.name || "Patient"} already has a scheduled visit at ${time} on this date.`);
      return;
    }
    const vaccineError=service === 'vaccination' ? vaccineChoiceError(vaccineId,selectedPet.species) : '';
    if(vaccineError){setSaveError(vaccineError);return;}
    const visitReason=service === 'vaccination' ? vaccineReason(vaccineId,vaccineId === 'vet-review' ? slot.reason : '') : reason.trim() || 'General visit';
    if (!await review.ask({title:slot.editing ? "Review appointment changes" : "Review clinic booking", confirmLabel:slot.editing ? "Save appointment changes" : "Confirm booking",
      description:"Check the patient and assignment. Reception must confirm changed appointments with the owner.",
      fields:[
        ["Patient",selectedPet.name],
        ["Owner",owner.name],
        ["Veterinarian",doctors.find(([id]) => id === vetId)?.[1]],
        ["Date and time",`${date} at ${time}`],
        ["Service",SERVICES[service]?.label],
        ["Reason",visitReason],
        ...(service === "vaccination" ? [["Estimated vaccine price",vaccinePriceLabel(vaccineId,catalog)]] : []),
        ["Saved owner note",slot.notes],
        ["Follow-up request",followUp ? `${followUp.followUpDate}: ${followUp.followUpReason}` : "Regular visit"]]
    })) return;
    bookingFlight.current = true;
    setSaving(true);
    try {
      await onBook(petId, service, visitReason, vetId, date, time, followUpId, vaccineId);
    } catch (error) {
      setSaveError(error.message);
      availability.refresh();
    } finally {
      bookingFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="quick-book-title" style={{ width: "min(540px, 100%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px", marginBottom: "16px" }}>
          <h3 id="quick-book-title" style={{ margin: 0, fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Calendar size={20} color="var(--navy)" />
            <span>{slot.editing ? "Manage appointment" : "Book Clinic Visit"}</span>
          </h3>
          <button className="btn ghost sm" disabled={saving} onClick={onClose} aria-label="Close booking">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {review.card}
          <fieldset disabled={saving} style={{border:0,padding:0,margin:0,minWidth:0}}>
          {slot.editing && <p className="ow-note">Change the veterinarian or schedule here. A changed assignment returns to Pending Approval for reception to approve with the owner. Saved owner notes and linked follow-up instructions are retained.</p>}
          {slot.vaccineDueDate && <p className="ow-note">Approved booster due: {slot.vaccineDueDate}. Choose an available clinic visit; this does not change the approved due date.</p>}
          <div style={{ display: "grid", gap: "12px" }}>
            <div className="fld">
              <label htmlFor="quick-book-pet">Select Patient (Pet &amp; Owner)</label>
              <LiveControl as="select" id="quick-book-pet" disabled={!!(slot.editing && slot.followUpId)} value={petId} onChange={e => { setPetId(e.target.value); setVaccineId(""); setFollowUpId(""); }} required>
                {db.pets.map(p => {
                  const o = db.owners.find(x => x.id === p.ownerId) || {};
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.species} &bull; {p.breed || "Mixed"}) — Owner: {o.name}
                    </option>
                  );
                })}
              </LiveControl>
            </div>

            <label>Follow-up request (optional)<LiveControl as="select" disabled={!!(slot.editing && slot.followUpId)} value={followUpId} onChange={e => setFollowUpId(e.target.value)}><option value="">Regular visit</option>{db.records.filter(r => r.petId === petId && (r.id === followUpId || openFollowUps(db,petId).some(x => x.id === r.id))).map(r => <option key={r.id} value={r.id}>{r.followUpDate} · {r.followUpReason}</option>)}</LiveControl></label>
            {followUp && <section aria-label="Selected follow-up instructions" className="ow-note"><b>{followUp.careStatus} · Target: {followUp.followUpDate}</b><p style={{whiteSpace:"pre-wrap"}}>{followUp.followUpReason}</p><small>Select an available visit time. Booking does not change the vet's target date.</small></section>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div className="fld">
                <label htmlFor="quick-book-vetId">Veterinarian</label>
                <LiveControl as="select" id="quick-book-vetId" value={vetId} onChange={e => setVetId(e.target.value)}>
                  {!doctors.some(([id]) => id === vetId) && <option value={vetId} disabled>Choose an active veterinarian</option>}
                  {doctors.map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </LiveControl>
              </div>

              <div className="fld">
                <label htmlFor="quick-book-service">Service Category</label>
                <LiveControl as="select" id="quick-book-service" value={service} onChange={e => {setService(e.target.value);setVaccineId("");}}>
                  {Object.entries(SERVICES).map(([key, item]) => <option key={key} value={key}>{item.label} ({item.dur} min)</option>)}
                </LiveControl>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div className="fld">
                <label htmlFor="quick-book-date">Date *</label>
                <LiveControl as="input"
                  id="quick-book-date"
                  type="date"
                  value={date}
                  min={TODAY}
                  max={maxBookingDate}
                  onChange={e => handleDateChange(e.target.value)}
                  className={dateErr ? "bad" : ""}
                  required
                />
                {dateErr && (
                  <span style={{ fontSize: "11px", color: "#dc2626", marginTop: "3px", display: "block", fontWeight: "600" }}>
                    {dateErr}
                  </span>
                )}
              </div>

              <div className="fld">
                <label htmlFor="quick-book-time">Time Slot</label>
                {availability.error && <p role="alert">{availability.error} <button type="button" onClick={availability.refresh}>Retry</button></p>}
                {availability.loading && <small>Checking availability…</small>}
                <LiveControl as="select" id="quick-book-time" value={availability.slots.includes(time) ? time : ""} onChange={e => setTime(e.target.value)}>
                  <option value="">Choose an available time</option>
                  {availability.slots.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </LiveControl>
              </div>
            </div>

            {service === 'vaccination' && <VaccinePicker id="quick-book-vaccine" value={vaccineId} onChange={setVaccineId} species={selectedPet.species} petSelected={!!petId} />}
            {service !== 'vaccination' && <div className="fld">
              <label htmlFor="quick-book-reason">Reason / Owner Symptoms</label>
              <LiveControl as="input"
                id="quick-book-reason"
                type="text"
                maxLength={300}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Lethargy, skin itching..."
              />
            </div>}
          </div>

          <div className="row end" style={{ marginTop: "18px", gap: "10px" }}>
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={saving || availability.loading || !!availability.error || !availability.slots.includes(time)} className="btn gold" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Check size={16} />
              <b>{saving ? "Saving booking…" : slot.editing ? "Review changes" : "Review booking"}</b>
            </button>
          </div>
          </fieldset>
          {saving && <p role="status">Saving booking… Please wait for confirmation.</p>}
          {saveError && <p role="alert" className="err">{saveError}</p>}
        </form>
      </div>
    </div>
  );
}
