import LiveControl from '../components/LiveControl.jsx';
import { api } from "../api.js";
import { useRef, useState } from "react";
import { Syringe, CheckCircle2, X } from "lucide-react";
import { addLog, I } from "../lib.jsx";
import { assessWeight } from "./vitals.js";
import { calculateAge, generateAutomatedVaccineSchedule } from "./vaccineProtocols.js";
import { approvedRegistration, reviewedRequest, registrationReviewChanged } from "../registrationReview.js";

export default function PetApprovalModal({ request, db, setDb, me, onClose, onProcessed }) {
  const inFlight = useRef(false);
  const [conflict, setConflict] = useState(false);
  const changed = registrationReviewChanged(request, db.petRequests);
  const canReview = request.status === "Pending" && !changed && !conflict;
  const close = () => { if (!inFlight.current) onClose(); };
  const [mode, setMode] = useState("review"); // 'review' | 'decline'
  const [declineReason, setDeclineReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState("");

  const owner = db.owners.find(o => o.id === request.ownerId) || {};
  const age = calculateAge(request.birth);
  const weightAnalysis = assessWeight(request.weight, request.species, request.breed);


  // Generate automated preview schedule
  const previewSchedule = generateAutomatedVaccineSchedule(
    {...request, vaccinationCardId:"preview"},
    "temp-id",
    me.name
  );

  const handleApprove = async () => {
    if (inFlight.current || !canReview) return;
    inFlight.current = true;
    setSaveError(""); setSubmitting(true);
    let result;
    try {
      const data = await api.post(`/api/pet-requests/${request.id}/approve`, {revision:request.revision ?? 0});
      result = approvedRegistration(data);
    } catch (err) {
      setSaveError(err.message);
      if (err.status === 409) setConflict(true);
      inFlight.current = false; setSubmitting(false);
      return;
    }
    setDb(p => {
      const ids = new Set(result.vacc.map(v => v.id));
      const vacc = [...result.vacc, ...(p.vacc || p.vaccs || []).filter(v => !ids.has(v.id))];
      return {...p,
        pets:[...(p.pets || []).filter(pet => pet.id !== result.pet.id), result.pet],
        vacc, vaccs:vacc,
        appts:result.appointment ? [...p.appts.filter(a => a.id !== result.appointment.id), result.appointment] : p.appts,
        petRequests:(p.petRequests || []).map(r => r.id === request.id && (r.revision ?? 0) <= result.request.revision ? result.request : r),
        log:addLog(p, me, `Approved registration for ${result.pet.name}. Issued vaccination card ${result.cardId}; suggested protocols await veterinarian review.`)
      };
    });
    inFlight.current = false; setSubmitting(false);
    onProcessed && onProcessed("approved", result.pet, result.cardId);
  };

  const handleDecline = async e => {
    e.preventDefault();
    if (inFlight.current || !canReview || !declineReason.trim()) return;
    inFlight.current = true;
    setSaveError(""); setSubmitting(true);
    let result;
    try {
      const data = await api.post(`/api/pet-requests/${request.id}/decline`, {reason:declineReason.trim(),revision:request.revision ?? 0});
      if (!data?.success || !data.request || data.request.status !== "Declined") throw new Error("The clinic did not confirm the decision. Refresh the request before continuing.");
      result = reviewedRequest(data.request);
    } catch (err) {
      setSaveError(err.message);
      if (err.status === 409) setConflict(true);
      inFlight.current = false; setSubmitting(false);
      return;
    }
    setDb(p => ({...p,
      petRequests:(p.petRequests || []).map(r => r.id === request.id && (r.revision ?? 0) <= result.revision ? result : r),
      log:addLog(p, me, `Declined registration for ${request.name}. Reason: ${result.declineReason}`)
    }));
    inFlight.current = false; setSubmitting(false);
    onProcessed && onProcessed("declined", null, null);
  };

  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ width: "min(720px, 100%)", maxHeight: "94vh" }}>
        {(changed || conflict) && <p className="err" role="alert">This request changed or was already processed. Close this review and reopen the latest request before making a decision.</p>}
        {request.status !== "Pending" && <section role="status"><b>Registration {request.status}</b>{request.declineReason && <p style={{whiteSpace:"pre-wrap"}}>{request.declineReason}</p>}<p>{request.status === "Declined" ? "The owner must correct and resubmit this request before it can be reviewed again." : "This registration has already been processed."}</p></section>}
        {saveError && <p className="err" role="alert">{saveError}</p>}
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px", marginBottom: "14px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "var(--navy)" }}><I e={request.species || "paw"} size={22} /></span>
              <span>Online Pet Registration Review</span>
            </h3>
            <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
              Submitted online by Pet Owner: <b>{owner.name}</b> ({owner.phone || "No phone"}) &bull; Requested: {request.requestedAt || "Not recorded"}
            </p>
          </div>
          <button className="btn ghost sm" onClick={close}><X size={16} /></button>
        </div>

        {mode === "decline" ? (
          <form onSubmit={handleDecline}>
            <div style={{ background: "#fef2f2", padding: "14px", borderRadius: "10px", border: "1px solid #fecaca", marginBottom: "16px" }}>
              <h4 style={{ margin: "0 0 6px", color: "#991b1b", fontSize: "15px" }}>Decline Pet Registration</h4>
              <p style={{ margin: 0, fontSize: "13px", color: "#b91c1c" }}>
                Provide a helpful reason to <b>{owner.name}</b>. The decision and correction instructions will appear in their portal.
              </p>
            </div>

            <div className="fld full" style={{ marginBottom: "16px" }}>
              <label>
                <b>Reason for Declining</b><i> *</i>
                <LiveControl as="textarea"
                  rows={3}
                  value={declineReason}
                  onChange={e => setDeclineReason(e.target.value)}
                  maxLength={500}
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
              <button type="submit" className="btn danger" disabled={!declineReason.trim() || submitting || !canReview}>
                Confirm decline
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

            {request.photo && <img src={request.photo} alt={`${request.name} submitted by owner`} style={{width:120,height:120,objectFit:"cover",borderRadius:12,marginBottom:16}} />}

            {/* Automated Vaccination Card Generation Box */}
            {request.status === "Pending" && <div style={{ background: "#f0fdf4", padding: "16px", borderRadius: "12px", border: "1px solid #86efac", marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ background: "#dcfce7", padding: "6px", borderRadius: "8px", color: "#166534" }}>
                    <Syringe size={18} />
                  </div>
                  <div>
                    <b style={{ color: "#166534", fontSize: "14px" }}>Automated Digital Vaccination Card Generation</b>
                    <small style={{ display: "block", color: "#15803d" }}>
                      The server assigns the official card number after approval. These suggestions require veterinarian review and do not certify any administered dose or booster date.
                    </small>
                  </div>
                </div>
                <span style={{ background: "#dcfce7", color: "#15803d", fontWeight: "700", padding: "4px 8px", borderRadius: "6px", fontSize: "12px", border: "1px solid #86efac" }}>
                  Card number assigned after approval
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
                        Suggested protocol · Vet review needed
                      </span>
                      <small style={{ display: "block", color: "#64748b", marginTop: "2px" }}>
                        {v.notes.replace(/^Automatically scheduled upon online registration approval by [^.]+\. /, "")}
                      </small>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontWeight: "700", color: "#047857" }}>
                        Suggested date: {v.nextDue}
                      </span>
                      <small style={{ display: "block", color: "#64748b", fontSize: "11px" }}>
                        {v.doseOf > 1 ? `Dose ${v.doseNo} of ${v.doseOf}` : "Single/Annual dose"}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </div>}

            {/* Modal Actions */}
            <div className="row end" style={{ gap: "10px", marginTop: "14px" }}>
              {request.status === "Pending" && <button
                type="button"
                className="btn ghost danger"
                disabled={submitting || !canReview}
                onClick={() => setMode("decline")}
              >
                Decline Request...
              </button>}
              <button type="button" className="btn ghost" onClick={close}>
                Close
              </button>
              {request.status === "Pending" && <button
                type="button"
                className="btn gold"
                onClick={handleApprove}
                disabled={submitting || !canReview}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <CheckCircle2 size={16} aria-hidden="true" />
                <b>Approve pet and issue vaccination card</b>
              </button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

