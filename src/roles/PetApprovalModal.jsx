import { api } from "../api.js";
import { useState } from "react";
import { Syringe, CheckCircle2, ShieldCheck, PawPrint, X, Sparkles } from "lucide-react";
import { TODAY, uid, addLog, ICON, I, petName, ownerName } from "../lib.jsx";
import { assessWeight } from "./vitals.js";
import { calculateAge, generateCardId, generateAutomatedVaccineSchedule, CLINICAL_PROTOCOLS } from "./vaccineProtocols.js";
import { outbox } from "../devOutbox.js";

export default function PetApprovalModal({ request, db, setDb, me, onClose, onProcessed }) {
  const [mode, setMode] = useState("review"); // 'review' | 'decline'
  const [declineReason, setDeclineReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState("");

  const owner = db.owners.find(o => o.id === request.ownerId) || {};
  const age = calculateAge(request.birth);
  const weightAnalysis = assessWeight(request.weight, request.species, request.breed);
  const cardId = generateCardId();
  const protocols = CLINICAL_PROTOCOLS[request.species] || CLINICAL_PROTOCOLS.Other;

  // Generate automated preview schedule
  const previewSchedule = generateAutomatedVaccineSchedule(
    { ...request, vaccinationCardId: cardId },
    "temp-id",
    me.name
  );

  const handleApprove = async () => {
    if (submitting) return;
    setSaveError("");
    setSubmitting(true);
    let assignedCardId = cardId;
    let newPet = null;
    let newVaccRecords = [];
    let preScheduledAppt = null;

    try {
      const data = await api.post(`/api/pet-requests/${request.id}/approve`, {});
      if (!data?.pet) throw new Error("The clinic did not confirm approval.");
      if (data.success) {
        assignedCardId = data.cardId || assignedCardId;
        if (data.appointment) preScheduledAppt = data.appointment;
        const rawPet = data.pet;
        if (rawPet) {
          newPet = {
            id: rawPet.id,
            ownerId: rawPet.owner_id,
            name: rawPet.name,
            species: rawPet.species,
            speciesOther: rawPet.species_other || "",
            breed: rawPet.breed,
            sex: rawPet.sex,
            birth: rawPet.birth ? String(rawPet.birth).slice(0, 10) : "",
            weight: parseFloat(rawPet.weight),
            color: rawPet.color || "",
            neutered: rawPet.neutered || "Not sure",
            allergies: rawPet.allergies || [],
            vaccinationCardId: rawPet.vaccination_card_id || assignedCardId,
            notes: rawPet.notes || "",
            registeredAt: TODAY,
            approvedBy: me.name,
            weights: [{ date: TODAY, kg: parseFloat(rawPet.weight) }]
          };
        }
        if (data.vaccs && data.vaccs.length) {
          newVaccRecords = data.vaccs.map(v => ({
            id: v.id,
            petId: v.pet_id || v.petId,
            cardId: v.card_id || v.cardId || assignedCardId,
            vaccine: v.vaccine,
            brand: v.brand || "",
            batch: v.batch || "",
            date: v.date ? String(v.date).slice(0, 10) : TODAY,
            nextDue: v.next_due ? String(v.next_due).slice(0, 10) : (v.nextDue || null),
            doseNo: v.dose_no || v.doseNo,
            doseOf: v.dose_of || v.doseOf,
            done: Boolean(v.done),
            automated: Boolean(v.automated),
            protocolType: v.protocol_type || v.protocolType || "",
            notes: v.notes || "",
            vetId: v.vet_id || v.vetId || "",
            recordedBy: v.recorded_by || v.recordedBy || me.name
          }));
        }
      }
    } catch (err) {
      setSaveError(err.message);
      setSubmitting(false);
      return;
    }

    setDb(p => {
      // 1. Add pet
      const nextPets = [...(p.pets || []).filter(x => x.id !== newPet.id), newPet];

      // 2. Add automated vaccination records
      const nextVacc = [...(newVaccRecords || []), ...(p.vacc || p.vaccs || [])];

      // 3. Update request status to Approved
      const nextReqs = (p.petRequests || []).map(r =>
        r.id === request.id
          ? { ...r, status: "Approved", approvedAt: TODAY, approvedBy: me.name, petId: newPet.id, cardId: assignedCardId }
          : r
      );

      // 4. Log audit event
      const nextLog = addLog(
        p,
        me,
        `Front Desk Assistant ${me.name} approved online pet registration for "${newPet.name}" (${owner.name}). Issued Digital Vaccination Card #${assignedCardId} with ${newVaccRecords.length} automated scheduled vaccine protocols.`
      );

      const nextAppts = preScheduledAppt
        ? [...(p.appts || []).filter(a => a.id !== preScheduledAppt.id), preScheduledAppt]
        : (p.appts || []);

      return {
        ...p,
        pets: nextPets,
        vacc: nextVacc,
        vaccs: nextVacc,
        appts: nextAppts,
        petRequests: nextReqs,
        log: nextLog,
      };
    });

    // 5. Send automated SMS/Email notification to Pet Owner Portal
    try {
      outbox.push({
        id: uid(),
        to: owner.email || "owner@example.com",
        phone: owner.phone || "",
        type: "pet_approved",
        subject: `${newPet.name}'s Digital Vaccination Card is Ready!`,
        sentAt: new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }),
        body: `Hello ${owner.name}! PawCare Front Desk has approved your pet ${newPet.name}. Your pet's official Digital Vaccination Card #${assignedCardId} has been generated with automated booster schedules. You can now book appointments and view vaccination history in your Pet Owner Portal.`,
      });
    } catch {
      // safe fallback
    }

    setSubmitting(false);
    onProcessed && onProcessed("approved", newPet, assignedCardId);
  };

  const handleDecline = async (e) => {
    e.preventDefault();
    if (!declineReason.trim()) return;

    if (submitting) return;
    setSaveError("");
    setSubmitting(true);
    try {
      await api.post(`/api/pet-requests/${request.id}/decline`, { reason: declineReason.trim() });
    } catch (err) {
      setSaveError(err.message);
      setSubmitting(false);
      return;
    }

    setDb(p => ({
      ...p,
      petRequests: (p.petRequests || []).map(r =>
        r.id === request.id
          ? { ...r, status: "Declined", declineReason: declineReason.trim(), reviewedBy: me.name, reviewedAt: TODAY }
          : r
      ),
      log: addLog(
        p,
        me,
        `Front Desk Assistant ${me.name} declined pet request for "${request.name}" (${owner.name}). Reason: ${declineReason.trim()}`
      ),
    }));

    setSubmitting(false);
    onProcessed && onProcessed("declined", null, null);
  };

  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: "min(720px, 100%)", maxHeight: "94vh" }}>
        {saveError && <p className="err" role="alert">{saveError}</p>}
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px", marginBottom: "14px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "var(--navy)" }}><I e={request.species || "paw"} size={22} /></span>
              <span>Online Pet Registration Review</span>
            </h3>
            <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
              Submitted online by Pet Owner: <b>{owner.name}</b> ({owner.phone || "No phone"}) &bull; Requested: {request.requestedAt || TODAY}
            </p>
          </div>
          <button className="btn ghost sm" onClick={onClose}><X size={16} /></button>
        </div>

        {mode === "decline" ? (
          <form onSubmit={handleDecline}>
            <div style={{ background: "#fef2f2", padding: "14px", borderRadius: "10px", border: "1px solid #fecaca", marginBottom: "16px" }}>
              <h4 style={{ margin: "0 0 6px", color: "#991b1b", fontSize: "15px" }}>Decline Pet Registration</h4>
              <p style={{ margin: 0, fontSize: "13px", color: "#b91c1c" }}>
                Provide a helpful reason to <b>{owner.name}</b> so they know what needs updating before resubmitting.
              </p>
            </div>

            <div className="fld full" style={{ marginBottom: "16px" }}>
              <label>
                <b>Reason for Declining</b><i> *</i>
                <textarea
                  rows={3}
                  value={declineReason}
                  onChange={e => setDeclineReason(e.target.value)}
                  placeholder="e.g. Duplicate pet profile already exists; please verify birth date; phone number unverified..."
                  required
                />
              </label>
            </div>

            {/* Quick reason chips */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "20px" }}>
              {[
                "Duplicate profile already on file",
                "Please verify exact birth date",
                "Please contact clinic directly for special breeds",
                "Weight appears incorrect for age",
              ].map(reason => (
                <button
                  type="button"
                  key={reason}
                  className="btn ghost sm"
                  style={{ fontSize: "11.5px" }}
                  onClick={() => setDeclineReason(reason)}
                >
                  + {reason}
                </button>
              ))}
            </div>

            <div className="row end" style={{ gap: "10px" }}>
              <button type="button" className="btn ghost" onClick={() => setMode("review")}>Back to Review</button>
              <button type="submit" className="btn danger" disabled={!declineReason.trim() || submitting}>
                Confirm Decline &amp; Notify Owner
              </button>
            </div>
          </form>
        ) : (
          <div>
            {/* Pet Details Card */}
            <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "12px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: "17px", color: "var(--navy)" }}>{request.name}</h4>
                  <span style={{ fontSize: "13px", color: "#64748b" }}>
                    {request.species} &bull; {request.breed || "Mixed"} &bull; {request.sex} &bull; Spayed/Neutered: {request.neutered}
                  </span>
                </div>
                {weightAnalysis && (
                  <span style={{
                    padding: "3px 8px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 700,
                    background: weightAnalysis.color + "22",
                    color: weightAnalysis.color,
                    border: `1px solid ${weightAnalysis.color}`,
                  }}>
                    {weightAnalysis.label} ({request.weight} kg)
                  </span>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "13px", color: "#334155", marginTop: "10px" }}>
                <div><b>Birth Date:</b> {request.birth} ({age.weeks} weeks / {age.months} months old)</div>
                <div><b>Color / Markings:</b> {request.color || "None specified"}</div>
                {request.notes && (
                  <div style={{ gridColumn: "1/-1", background: "#fff", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", marginTop: "4px" }}>
                    <b>Owner Notes:</b> &ldquo;{request.notes}&rdquo;
                  </div>
                )}
              </div>
            </div>

            {/* Automated Vaccination Card Generation Box */}
            <div style={{ background: "#f0fdf4", padding: "16px", borderRadius: "12px", border: "1px solid #86efac", marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ background: "#dcfce7", padding: "6px", borderRadius: "8px", color: "#166534" }}>
                    <Syringe size={18} />
                  </div>
                  <div>
                    <b style={{ color: "#166534", fontSize: "14px" }}>Automated Digital Vaccination Card Generation</b>
                    <small style={{ display: "block", color: "#15803d" }}>
                      System automatically initializes official card ID and recommended vaccine protocols based on {request.species} guidelines.
                    </small>
                  </div>
                </div>
                <span style={{ background: "#dcfce7", color: "#15803d", fontWeight: "700", padding: "4px 8px", borderRadius: "6px", fontSize: "12px", border: "1px solid #86efac" }}>
                  Card #{cardId}
                </span>
              </div>

              {/* Vaccine Schedule Preview List */}
              <div style={{ display: "grid", gap: "8px", marginTop: "12px" }}>
                {previewSchedule.map((v, i) => (
                  <div
                    key={i}
                    style={{
                      background: "#fff",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #bbf7d0",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "12.5px"
                    }}
                  >
                    <div>
                      <b style={{ color: "var(--navy)" }}>{v.vaccine}</b>
                      <span style={{ marginLeft: "8px", fontSize: "11px", background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", color: "#475569" }}>
                        {v.brand} &bull; {v.protocolType}
                      </span>
                      <small style={{ display: "block", color: "#64748b", marginTop: "2px" }}>
                        {v.notes.replace(/^Automatically scheduled upon online registration approval by [^.]+\. /, "")}
                      </small>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontWeight: "700", color: "#047857" }}>
                        Due: {v.nextDue}
                      </span>
                      <small style={{ display: "block", color: "#64748b", fontSize: "11px" }}>
                        {v.doseOf > 1 ? `Dose ${v.doseNo} of ${v.doseOf}` : "Single/Annual dose"}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="row end" style={{ gap: "10px", marginTop: "14px" }}>
              <button
                type="button"
                className="btn ghost danger"
                onClick={() => setMode("decline")}
              >
                Decline Request...
              </button>
              <button type="button" className="btn ghost" onClick={onClose}>
                Close
              </button>
              <button
                type="button"
                className="btn gold"
                onClick={handleApprove}
                disabled={submitting}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <CheckCircle2 size={16} aria-hidden="true" />
                <b>Approve pet and issue vaccination card</b>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

