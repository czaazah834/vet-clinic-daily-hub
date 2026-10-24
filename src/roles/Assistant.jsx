import { useState, useEffect, useRef } from "react";
import {
  Calendar,
  Clock,
  User,
  Stethoscope,
  Syringe,
  AlertTriangle,
  PawPrint,
  ConciergeBell,
  Thermometer,
  Scale,
  Sparkles,
} from "lucide-react";
import { M, Stats, Hero, TODAY, plus, moveAppt, petName, ownerName, Badge, dueState, ICON, I, uid } from "../lib.jsx";
import { api } from "../api.js";
import InClinicRegistration from "./InClinicRegistration.jsx";
import BillingModal from "./BillingModal.jsx";
import ClinicCalendar from "./ClinicCalendar.jsx";
import CheckInModal from "./CheckInModal.jsx";
import PetApprovalModal from "./PetApprovalModal.jsx";
import PetRequestsPage from "./PetRequestsPage.jsx";
import AssistantVaccinationManager from "./AssistantVaccinationManager.jsx";
import PetCardModal from "./PetCardModal.jsx";
import { formatSpeciesLabel } from "../preventiveSchedule.js";

function Dash({ db, setDb, me, go, say }) {
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [showExistingWalkIn, setShowExistingWalkIn] = useState(false);
  const [billingAppt, setBillingAppt] = useState(null);
  const [checkInAppt, setCheckInAppt] = useState(null);
  const [reviewReq, setReviewReq] = useState(null);
  const [cardPetId, setCardPetId] = useState(null);
  const [cardAppt, setCardAppt] = useState(null);

  const pendingReqs = (db.petRequests || []).filter(r => r.status === "Pending");
  const q = db.appts.filter(a => a.date === TODAY && a.status !== "Cancelled").sort((a, b) => a.time.localeCompare(b.time));
  const waiting = q.filter(a => a.status === "Checked-in");
  const inConsult = q.filter(a => a.status === "In consultation");
  const completed = q.filter(a => a.status === "Completed");
  const calls = db.vacc.filter(v => v.nextDue && !v.done && v.nextDue <= plus(14));

  // Auto-detect when doctor completes consultation and automatically launch billing
  const prevCompletedRef = useRef(null);
  useEffect(() => {
    const unbilledCompleted = q.filter(a => a.status === "Completed" && a.billingStatus !== "Paid");
    if (prevCompletedRef.current === null) {
      prevCompletedRef.current = unbilledCompleted.map(a => a.id);
      return;
    }
    const newlyCompleted = unbilledCompleted.find(a => !prevCompletedRef.current.includes(a.id));
    if (newlyCompleted && !billingAppt) {
      const pet = db.pets?.find(p => p.id === newlyCompleted.petId) || {};
      if (typeof say === "function") {
        say(`🔔 Doctor finished consultation for ${pet.name || "Patient"}! Proceeding directly to billing checkout...`);
      }
      setBillingAppt(newlyCompleted);
    }
    prevCompletedRef.current = unbilledCompleted.map(a => a.id);
  }, [q, billingAppt, db.pets, say]);

  return (
    <>
      <Hero
        title="Front Desk &amp; Clinic Operations"
        text="Register walk-in owners and patients, manage arrival check-ins, oversee appointments and handle billing."
        icons={["bell", "cat"]}
      >
        <div className="row" style={{ flexWrap: "wrap", gap: "12px", marginTop: "14px" }}>
          <button
            className="btn gold"
            onClick={() => setShowWalkIn(true)}
            style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}
          >
            <ConciergeBell size={16} /> + Register New Walk-in
          </button>
          <button
            className="btn"
            onClick={() => setShowExistingWalkIn(true)}
            style={{ display: "flex", alignItems: "center", gap: "6px", background: "#f0fdf4", color: "#166534", border: "1.5px solid #86efac", fontWeight: 700 }}
            title="Express check-in for existing online or registered patients"
          >
            <Sparkles size={16} /> ⚡ Check-in Existing Patient
          </button>
          <button
            className="btn"
            onClick={() => go("cal")}
            style={{ display: "flex", alignItems: "center", gap: "6px", background: "#fff", color: "#1e3a8a", border: "1px solid #bfdbfe", fontWeight: 700 }}
          >
            <Calendar size={16} /> Appointments &amp; Calendar
          </button>
          {pendingReqs.length > 0 && (
            <button
              className="btn gold"
              onClick={() => go("pet-requests")}
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <PawPrint size={16} /> Review Pet Requests ({pendingReqs.length})
            </button>
          )}
        </div>
      </Hero>

      <Stats
        items={[
          ["calendar", q.length, "Total Visits Today"],
          ["bell", waiting.length, "Checked-in (In Queue)"],
          ["stethoscope", inConsult.length, "In Consultation"],
          ["paw", pendingReqs.length, "Online Pet Requests"],
          ["phone", calls.length, "Vaccine Reminders Due"],
        ]}
      />

      {/* Pending Online Pet Registrations Banner */}
      {pendingReqs.length > 0 && (
        <section className="card" style={{ marginTop: "16px", border: "2px solid #86efac", background: "#f0fdf4" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ background: "#dcfce7", padding: "8px", borderRadius: "10px", color: "#166534" }}>
                <Sparkles size={24} />
              </div>
              <div>
                <h3 style={{ margin: "0 0 2px", color: "#166534", fontSize: "17px" }}>
                  Pending Online Pet Registrations ({pendingReqs.length})
                </h3>
                <span style={{ fontSize: "12.5px", color: "#15803d" }}>
                  Owners registered new pets online. Front desk approval will automatically issue their digital vaccination card and calculate booster schedules.
                </span>
              </div>
            </div>
            <button
              className="btn gold sm"
              onClick={() => setReviewReq(pendingReqs[0])}
              style={{ fontWeight: 700 }}
            >
              Review &amp; Issue Cards ({pendingReqs.length})
            </button>
          </div>

          <div style={{ display: "grid", gap: "8px" }}>
            {pendingReqs.map(r => {
              const o = db.owners.find(x => x.id === r.ownerId) || {};
              return (
                <div
                  key={r.id}
                  style={{
                    background: "#fff",
                    padding: "12px 16px",
                    borderRadius: "10px",
                    border: "1px solid #bbf7d0",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "10px"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "24px" }}><I e={r.species || "paw"} size={24} /></span>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <b style={{ fontSize: "15px", color: "var(--navy)" }}>{r.name}</b>
                        <span style={{ fontSize: "12px", background: "#f1f5f9", padding: "2px 8px", borderRadius: "6px", color: "#475569" }}>
                          {r.species} &bull; {r.breed || "Mixed"} &bull; {r.sex}
                        </span>
                        {r.weight && (
                          <span style={{ fontSize: "12px", color: "#64748b" }}>
                            {r.weight} kg
                          </span>
                        )}
                      </div>
                      <small style={{ color: "#64748b", display: "block", marginTop: "2px" }}>
                        Owner: <b>{o.name || "Owner"}</b> ({o.phone || o.email || "No contact"}) &bull; Requested on: <b>{r.requestedAt || TODAY}</b>
                        {r.notes ? ` &bull; "${r.notes}"` : ""}
                      </small>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      className="btn sm gold"
                      onClick={() => setReviewReq(r)}
                      title="Review details, automated vaccine protocol, and issue digital vaccination card"
                    >
                      Review &amp; Issue Vaccine Card
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="two" style={{ marginTop: "16px" }}>
        {/* Today's Queue & Arrival Check-in */}
        <section className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 style={{ margin: 0 }}>Today&apos;s Arrival Queue ({q.length})</h3>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Date: {TODAY}</span>
          </div>

          {q.length ? (
            <div style={{ display: "grid", gap: "8px" }}>
              {q.map(a => {
                const pet = db.pets.find(p => p.id === a.petId) || {};
                const owner = db.owners.find(o => o.id === pet.ownerId || o.id === a.ownerId || o.id === (pet.ownerId && pet.ownerId.replace(/^o(\d+)/, 'o_$1')) || o.id?.replace(/^o_(\d+)/, 'o$1') === pet.ownerId) || {};
                const isPaid = a.billingStatus === "Paid";
                const iv = a.intakeVitals;
                const petDisplayName = pet.name || a.petName || "Patient";

                return (
                  <div className="li" key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", border: "1px solid #e2e8f0", borderRadius: "10px", background: a.status === "Checked-in" ? "#f0fdf4" : a.status === "In consultation" ? "#eff6ff" : "#fff", gap: "10px", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <b style={{ color: "var(--navy)", minWidth: "48px" }}>{a.time}</b>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="btn-link"
                            onClick={() => {
                              setCardPetId(pet.id || a.petId);
                              setCardAppt(a);
                            }}
                            style={{ fontWeight: 700, fontSize: "14px", color: "var(--navy)", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}
                            title="Click to view Digital Vaccination Card and manage visit"
                          >
                            {petDisplayName}
                          </button>
                          <span style={{ color: "#64748b", fontSize: "12px" }}>
                            {pet.species ? `· ${pet.species}${pet.breed ? ` (${pet.breed})` : ""}` : ""}
                            {owner.name ? ` · Owner: ${owner.name}` : a.ownerName ? ` · Owner: ${a.ownerName}` : ""}
                          </span>
                          {iv?.triageLevel && iv.triageLevel !== "Routine" && (
                            <span style={{
                              background: iv.triageLevel === "Emergency" ? "#fee2e2" : "#fef3c7",
                              color: iv.triageLevel === "Emergency" ? "#991b1b" : "#92400e",
                              fontWeight: 700,
                              fontSize: "11px",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              display: "flex",
                              alignItems: "center",
                              gap: "3px"
                            }}>
                              <AlertTriangle size={12} /> {iv.triageLevel}
                            </span>
                          )}
                        </div>
                        <small style={{ display: "block", color: "#475569" }}>{a.reason}</small>

                        {iv && (
                          <div style={{ marginTop: "4px", display: "flex", gap: "6px", flexWrap: "wrap", fontSize: "11px" }}>
                            <span style={{
                              background: iv.tempAnalysis?.status === "normal" ? "#ecfdf5" : "#fef2f2",
                              color: iv.tempAnalysis?.status === "normal" ? "#047857" : "#b91c1c",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontWeight: 600,
                              border: "1px solid rgba(0,0,0,0.06)",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px"
                            }}>
                              <Thermometer size={12} /> {iv.temp}°C · {iv.tempAnalysis?.label || "Normal"}
                            </span>
                            <span style={{
                              background: iv.weightAnalysis?.status === "ideal" ? "#ecfdf5" : "#fffbeb",
                              color: iv.weightAnalysis?.status === "ideal" ? "#047857" : "#b45309",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontWeight: 600,
                              border: "1px solid rgba(0,0,0,0.06)",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px"
                            }}>
                              <Scale size={12} /> {iv.weight} kg · {iv.weightAnalysis?.label || "Normal"}
                            </span>
                            {iv.weightAnalysis?.trend && (
                              <span style={{ background: "#f8fafc", color: "#475569", padding: "2px 6px", borderRadius: "4px" }}>
                                {iv.weightAnalysis.trend}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                      <Badge v={a.status} />

                      <button
                        className="btn sm ghost"
                        onClick={() => {
                          setCardPetId(pet.id || a.petId);
                          setCardAppt(a);
                        }}
                        title="View Official Digital Vaccination Card and manage visit"
                        style={{ display: "flex", alignItems: "center", gap: "4px" }}
                      >
                        💳 Card
                      </button>

                      {a.status === "Scheduled" && (
                        <button
                          className="btn sm"
                          onClick={() => {
                            moveAppt(setDb, a.id, "Confirmed", me);
                            say("Appointment confirmed");
                          }}
                        >
                          Confirm
                        </button>
                      )}

                      {["Scheduled", "Confirmed"].includes(a.status) && (
                        <button
                          className="btn sm gold"
                          title="Arrival Check-in & Automated Vitals Intake"
                          onClick={() => setCheckInAppt(a)}
                        >
                          Check in
                        </button>
                      )}

                      {a.status === "Checked-in" && (
                        <button
                          className="btn sm ghost"
                          title="Review or adjust patient intake vitals"
                          onClick={() => setCheckInAppt(a)}
                        >
                          Edit Vitals
                        </button>
                      )}

                      {a.status === "Completed" && (
                        <button
                          className={`btn sm ${isPaid ? "ghost" : "gold"}`}
                          onClick={() => setBillingAppt(a)}
                          title="Search clinic price catalog, create invoice, and settle bill"
                        >
                          {isPaid ? "Receipt (Paid)" : "🧾 Bill / Checkout"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty sm">No appointments or walk-ins scheduled today.</div>
          )}
        </section>

        {/* Vaccine Reminder Calls */}
        <section className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 style={{ margin: 0 }}>Vaccine Reminder List ({calls.length})</h3>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Due within 14 days</span>
          </div>

          {calls.length ? (
            <div style={{ display: "grid", gap: "8px" }}>
              {calls.map(v => {
                const p = db.pets.find(x => x.id === v.petId) || {};
                const o = db.owners.find(x => x.id === p.ownerId || x.id === (p.ownerId && p.ownerId.replace(/^o(\d+)/, 'o_$1')) || x.id?.replace(/^o_(\d+)/, 'o$1') === p.ownerId) || {};
                return (
                  <div className="li" key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: "10px", gap: "8px", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => setCardPetId(p.id || v.petId)}
                          style={{ fontWeight: 700, fontSize: "13.5px", color: "var(--navy)", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}
                          title="Click to view Digital Vaccination Card"
                        >
                          {p.name || "Patient"}
                        </button>
                        <small style={{ color: "#64748b" }}>
                          {p.species ? `· ${p.species}` : ""}{o.name ? ` (${o.name})` : ""}
                        </small>
                      </div>
                      <small style={{ display: "block", color: "#475569" }}>
                        {v.vaccine} &bull; Due: <b>{v.nextDue}</b> &bull; Call: <b>{o.phone || "No phone"}</b>
                      </small>
                    </div>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <Badge v={dueState(v.nextDue)} />
                      <button
                        className="btn sm ghost"
                        onClick={() => setCardPetId(p.id || v.petId)}
                        title="View Official Digital Vaccination Card"
                      >
                        💳 Card
                      </button>
                      <button
                        className="btn ghost sm"
                        onClick={() => say(`Logged reminder for ${o.name || "owner"} (${p.name || "pet"})`)}
                      >
                        Log Call
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty sm">All patient vaccinations are up to date!</div>
          )}
        </section>
      </div>

      {showWalkIn && (
        <InClinicRegistration
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setShowWalkIn(false)}
          onRegistered={(owner, pet) => {
            say(`Walk-in registered: ${owner.name} & ${pet.name}. Portal invite sent!`);
          }}
        />
      )}

      {billingAppt && (
        <BillingModal
          appt={billingAppt}
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setBillingAppt(null)}
          onPaid={(amt) => say(`Payment of ₱${amt} recorded!`)}
        />
      )}

      {checkInAppt && (
        <CheckInModal
          appt={checkInAppt}
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setCheckInAppt(null)}
          onCheckedIn={(vitals) => {
            setCheckInAppt(null);
            say(`Patient checked in with vitals! Moved to Doctor Queue.`);
          }}
        />
      )}

      {reviewReq && (
        <PetApprovalModal
          request={reviewReq}
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setReviewReq(null)}
          onProcessed={(action, newPet, cardId) => {
            setReviewReq(null);
            if (action === "approved") {
              say(`Pet approved! Digital Vaccination Card #${cardId} automatically created.`);
            } else {
              say("Pet registration request declined.");
            }
          }}
        />
      )}

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
          onBook={() => {
            setCardPetId(null);
            setCardAppt(null);
            go("cal");
          }}
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

      {showExistingWalkIn && (
        <ExistingPatientCheckInModal
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setShowExistingWalkIn(false)}
          onCheckIn={(newAppt) => {
            setShowExistingWalkIn(false);
            setCheckInAppt(newAppt);
          }}
          say={say}
        />
      )}
    </>
  );
}

function ExistingPatientCheckInModal({ db, setDb, me, onClose, onCheckIn, say }) {
  const [search, setSearch] = useState("");
  const [selectedPetId, setSelectedPetId] = useState("");
  const [reason, setReason] = useState("Walk-in Consultation & Routine Exam");
  const [vetId, setVetId] = useState("v1");

  const filteredPets = (db.pets || []).filter(p => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const owner = (db.owners || []).find(o => o.id === p.ownerId) || {};
    return (
      (p.name || "").toLowerCase().includes(term) ||
      (p.species || "").toLowerCase().includes(term) ||
      (p.breed || "").toLowerCase().includes(term) ||
      (owner.name || "").toLowerCase().includes(term) ||
      (owner.phone || "").includes(term)
    );
  });

  const selectedPet = (db.pets || []).find(p => p.id === selectedPetId);
  const selectedOwner = selectedPet ? (db.owners || []).find(o => o.id === selectedPet.ownerId) : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPetId) return;

    const timeStr = new Date().toLocaleTimeString("en-PH", { hour12: false, hour: "2-digit", minute: "2-digit" });
    const payload = {
      petId: selectedPetId,
      vetId: vetId || "v1",
      date: TODAY,
      time: timeStr,
      reason: reason.trim() || "Walk-in Consultation",
      status: "Scheduled",
      billingStatus: "Unbilled",
      amount: 600,
      actorName: me?.name || "Assistant",
      actorRole: me?.role || "assistant"
    };

    let newAppt = null;
    try {
      const res = await api.post("/api/appointments", payload);
      newAppt = res?.appointment || { id: "a_" + uid(), ...payload };
    } catch (_) {
      newAppt = { id: "a_" + uid(), ...payload };
    }

    setDb(prev => ({
      ...prev,
      appts: [newAppt, ...(prev.appts || [])],
      log: addLog(prev, me, `Registered walk-in check-in for existing pet ${selectedPet.name} (Owner: ${selectedOwner?.name || "Client"}).`)
    }));

    say(`Checked in ${selectedPet.name} for today's walk-in visit!`);
    onClose();
    onCheckIn(newAppt);
  };

  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()} style={{ zIndex: 1050, display: "grid", placeItems: "center", padding: "16px" }}>
      <div className="modal" style={{ width: "min(540px, 100%)", maxHeight: "90vh", overflowY: "auto", padding: "22px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px" }}>
          <h3 style={{ margin: 0, fontSize: "18px", color: "var(--navy)", display: "flex", alignItems: "center", gap: "8px" }}>
            <Sparkles size={20} color="#059669" /> Fast Walk-in Check-in (Existing Patient)
          </h3>
          <button type="button" className="btn sm ghost" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Search Registered Patient or Owner</label>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by pet name, breed, or owner mobile..."
              style={{ width: "100%", padding: "7px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
            />
          </div>

          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Select Patient *</label>
            <select
              value={selectedPetId}
              onChange={e => setSelectedPetId(e.target.value)}
              required
              style={{ width: "100%", padding: "8px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
            >
              <option value="">Choose patient...</option>
              {filteredPets.map(p => {
                const o = (db.owners || []).find(x => x.id === p.ownerId) || {};
                return (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.species} ({p.breed || "Mixed"}) — Owner: {o.name || "Client"} {o.phone ? `(${o.phone})` : ""}
                  </option>
                );
              })}
            </select>
          </div>

          {selectedPet && (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "10px 14px", borderRadius: "8px", marginBottom: "14px", fontSize: "12.5px" }}>
              <b>Selected:</b> {selectedPet.name} ({selectedPet.breed || selectedPet.species}, {selectedPet.weight} kg) &bull; Owner: <b>{selectedOwner?.name || "Client"}</b> ({selectedOwner?.phone || "No phone"})
            </div>
          )}

          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Visit Reason *</label>
            <input
              type="text"
              required
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Walk-in Vaccination, Sickness / Cough, Routine Check-up"
              style={{ width: "100%", padding: "7px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
            />
          </div>

          <div className="row end" style={{ gap: "8px" }}>
            <button type="button" className="btn ghost sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn gold sm" disabled={!selectedPetId} style={{ fontWeight: 700 }}>
              Queue &amp; Measure Vitals →
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const assistant = {
  portal: "Front Desk & Operations",
  Dash,
  menu: [
    { k: "home", l: "Front Desk", i: "bell", dash: 1, sub: "Today’s arrival queue, walk-in registration, and reminders." },
    { k: "pet-requests", l: "Online Pet Requests", i: "paw", Page: PetRequestsPage, sub: "Review and approve online pet registrations with automated vaccination cards." },
    { k: "cal", l: "Appointments & Calendar", i: "calendar", Page: ClinicCalendar, sub: "Unified calendar schedules, slot booking, and appointments management." },
    M("owners", "Client Masterlist", "user", "owners", "Registered pet owners and primary contact details."),
    M("pets", "Patient Masterlist", "paw", "pets", "All animal patients and profiles."),
    { k: "vacc", l: "Vaccination Cards", i: "syringe", Page: AssistantVaccinationManager, sub: "Manage official pet vaccination cards, log doctor-administered shots, and track boosters." },
    M("records", "Consultations", "file", "records", "Read-only view of veterinary consultation notes."),
  ],
};
