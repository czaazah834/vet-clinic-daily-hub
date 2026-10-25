import DigitalVetCard from './DigitalVetCard.jsx';
import VitalsHistory from './VitalsHistory.jsx';
import { approvalVisit } from "../appointmentStatus.js";
import ClinicDialog from "../components/ClinicDialog.jsx";
import PetPortrait from "./PetPortrait.jsx";
import { today as bookingToday } from "../booking.js";
import ExistingPatientCheckInModal from "./ExistingPatientCheckInModal.jsx";
import { canBookAppointments } from "../appointmentPermissions.js";
import { useState, useRef } from "react";
import { PawPrint, Calendar, CheckCircle2, Clock, CreditCard, Receipt, X } from "lucide-react";
import { Badge, TODAY, ICON, I, moveAppt } from "../lib.jsx";
import { toSquare } from "./owner/ui.jsx";
import { auth, OFFLINE_MSG } from "../authApi.js";



export default function PetCardModal({ petId, appt, db, setDb, me, onClose, onBook, onCheckIn, onBill }) {
  const [walkIn, setWalkIn] = useState(false);
  const [actionError, setActionError] = useState("");
  const p = (db.pets || []).find(x => x.id === petId) || {};
  const o = (db.owners || []).find(x => x.id === p.ownerId) || {};
  const fileInputRef = useRef(null);

  if (!p.id) return null;
  if (walkIn) return <ExistingPatientCheckInModal db={db} setDb={setDb} me={me} initialPetId={p.id} onClose={() => setWalkIn(false)} onCheckIn={visit => { onClose(); onCheckIn?.(visit); }} />;

  const activeAppt = appt ? (db.appts || []).find(a => a.id === appt.id && a.petId === p.id) : (db.appts || []).find(a => a.petId === p.id && a.date === bookingToday() && !["Cancelled","Rejected","No-show"].includes(a.status));
  const savePhoto = async photo => {
    try {
      const r = await auth.petPhoto(p.id, photo);
      const updatedPet = r?.pet || { ...p, photo };
      setDb(d => ({
        ...d,
        pets: (d.pets || []).map(x => x.id === p.id ? { ...x, ...updatedPet, photo } : x)
      }));
    } catch (err) {
      console.warn("Photo save error:", err);
    }
  };

  const handlePhotoFileChange = async e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const squareBase64 = await toSquare(file);
      await savePhoto(squareBase64);
    } catch (_) {}
  };

  return (
    <ClinicDialog label="Patient health passport" onClose={onClose} style={{padding:16}}>
      <div className="modal staff-pet-card" style={{ width: "min(880px, 100%)", maxHeight: "92vh", overflowY: "auto", padding: "20px 24px" }}>
        
        {actionError && <p className="err" role="alert">{actionError}</p>}
        {/* Top Control Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "16px" }}>
          <div className="staff-pet-controls" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <PawPrint size={22} color="var(--navy)" />
            <h3 style={{ margin: 0, color: "var(--navy)", fontSize: "1.25rem" }}>
              {p.name}&rsquo;s Health Passport &amp; Digital Vaccination Card
            </h3>
            <span style={{ background: "#dcfce7", color: "#166534", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px" }}>
              Patient record
            </span>
          </div>

          <div className="staff-pet-controls" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              className="btn sm ghost"
              onClick={onClose}
              aria-label="Close" style={{ padding: "6px 10px" }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Appointment & Clinical Visit Actions Bar (shows when opened for an appointment) */}
        {activeAppt && (
          <div style={{
            background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
            border: "1.5px solid #cbd5e1",
            borderRadius: "14px",
            padding: "12px 18px",
            marginBottom: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px"
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--navy)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Calendar size={15} /> Visit: {activeAppt.date} at {activeAppt.time}
                </span>
                <Badge v={activeAppt.status} />
                {activeAppt.billingStatus === "Paid" ? (
                  <span style={{ background: "#dcfce7", color: "#166534", fontSize: "11.5px", fontWeight: 700, padding: "2px 8px", borderRadius: "6px" }}>
                    Paid (₱{activeAppt.amount})
                  </span>
                ) : activeAppt.status === "Completed" ? (
                  <span style={{ background: "#fef3c7", color: "#92400e", fontSize: "11.5px", fontWeight: 700, padding: "2px 8px", borderRadius: "6px" }}>
                    Ready for Checkout (₱{activeAppt.amount || 600})
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: "12.5px", color: "#475569", marginTop: "3px" }}>
                <b>Reason:</b> {activeAppt.reason || "General Consultation"} &bull; <b>Veterinarian:</b> {(db.vets || []).find(v => v.id === activeAppt.vetId)?.name || "Veterinarian not recorded"}
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              {/* If booked for TODAY */}
              {activeAppt.date === bookingToday() && (
                <>
                  {activeAppt.status === "Pending Approval" && me?.role === "assistant" && (
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => {
                        moveAppt(setDb, activeAppt.id, "Scheduled", me, setActionError, approvalVisit(db,activeAppt));
                      }}
                      style={{ fontWeight: 600 }}
                    >
                      Approve appointment
                    </button>
                  )}

                  {activeAppt.status === "Scheduled" && onCheckIn && ["assistant","vet"].includes(me?.role) && (
                    <button
                      type="button"
                      className="btn sm gold"
                      onClick={() => {
                        onClose();
                        onCheckIn(activeAppt);
                      }}
                      style={{ fontWeight: 700 }}
                      title="Record patient intake vitals and triage"
                    >
                      Check in &amp; Record Vitals
                    </button>
                  )}

                  {["Checked-in","In consultation"].includes(activeAppt.status) && onCheckIn && ["assistant","vet"].includes(me?.role) && (
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={() => {
                        onClose();
                        onCheckIn(activeAppt);
                      }}
                      title="Adjust recorded intake vitals"
                    >
                      Record another measurement
                    </button>
                  )}
                </>
              )}

              {/* A different clinic day requires rescheduling before initial arrival. */}
              {activeAppt.date !== bookingToday() && (
                <>
                  {activeAppt.status === "Pending Approval" && me?.role === "assistant" && (
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => {
                        moveAppt(setDb, activeAppt.id, "Scheduled", me, setActionError, approvalVisit(db,activeAppt));
                      }}
                      style={{ fontWeight: 600 }}
                    >
                      Approve request ({activeAppt.date})
                    </button>
                  )}

                  {activeAppt.status === "Scheduled" && ["assistant","vet"].includes(me?.role) && (
                    <span role="status" style={{fontSize:"12px",color:"#92400e"}}>
                      Check-in is only available on {activeAppt.date}. Use Manage appointment in the calendar to reschedule first.
                    </span>
                  )}
                  {["Checked-in","In consultation"].includes(activeAppt.status) && onCheckIn && ["assistant","vet"].includes(me?.role) && (
                    <button type="button" className="btn sm ghost" onClick={() => { onClose(); onCheckIn?.(activeAppt); }}>Record another measurement</button>
                  )}
                </>
              )}

              {/* Bill / Pay: strictly ONLY when appointment is Completed, or if Paid show Receipt */}
              {activeAppt.status === "Completed" && (me?.role === "assistant" || activeAppt.billingStatus === "Paid") && (
                <button
                  type="button"
                  className={`btn sm ${activeAppt.billingStatus === "Paid" ? "ghost" : "gold"}`}
                  onClick={() => {
                    onClose();
                    onBill && onBill(activeAppt);
                  }}
                  style={{ fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "6px" }}
                  title="Search clinic prices, invoice items, and record payment"
                >
                  <Receipt size={15} />
                  <span>{activeAppt.billingStatus === "Paid" ? "View Paid Receipt" : "Settle Bill / Checkout"}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* If no appointment exists for this pet */}
        {!activeAppt && me?.role === "assistant" && (
          <div style={{
            background: "#f8fafc",
            border: "1px dashed #cbd5e1",
            borderRadius: "14px",
            padding: "10px 16px",
            marginBottom: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px"
          }}>
            <span style={{ fontSize: "12.5px", color: "#64748b" }}>
              Patient has no active appointment on record today.
            </span>
            <div className="staff-pet-controls" style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => {
                  onClose();
                  onBook && onBook();
                }}
              >
                + Schedule Future Visit
              </button>
              <button
                type="button"
                className="btn sm gold"
                onClick={() => setWalkIn(true)}
                disabled={!onCheckIn}
                style={{ fontWeight: 700 }}
              >
                Check in as Today&rsquo;s Walk-in
              </button>
            </div>
          </div>
        )}

        <PetPortrait pet={p} inputRef={fileInputRef} onChange={handlePhotoFileChange} onRemove={() => savePhoto("")} />
        <DigitalVetCard key={p.id} petId={p.id} refreshKey={`${activeAppt?.billingStatus || ''}-${activeAppt?.status || ''}`} />

        <VitalsHistory petId={p.id} me={me} refreshKey={activeAppt?.intakeVitals} />

        {/* Action row */}
        <div className="staff-pet-controls" style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
          {onBook && canBookAppointments(me?.role) && (
            <button className="btn gold sm" onClick={() => { onClose(); onBook(p.id); }}>
              + Book Visit for {p.name}
            </button>
          )}
          <button className="btn ghost sm" onClick={onClose}>
            Close
          </button>
        </div>

      </div>
    </ClinicDialog>
  );
}

