import {HistoryControls,useHistoryComplete} from "../ClinicHistory.jsx";
import { useState } from "react";
import {
  FileText,
  Search,
  User,
  Calendar,
  Stethoscope,
  Pill,
  Syringe,
  Printer,
  X,
  Clock,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Phone,
  ShieldCheck,
  ChevronRight
} from "lucide-react";
import { TODAY, ICON, I, petName, ownerName } from "../lib.jsx";
import { formatSpeciesLabel } from "../preventiveSchedule.js";
import { isVet } from "./clinicValidation.js";
import { consultationAppointment } from "../vetQueue.js";
import PetCardModal from "./PetCardModal.jsx";
import SoapConsultationModal from "./SoapConsultationModal.jsx";

export function ConsultationDetailModal({ record, db, setDb, me, onClose, onEdit }) {
  const historyComplete=useHistoryComplete();
  const [cardPetId, setCardPetId] = useState(null);
  const pet = (db.pets || []).find(p => p.id === record.petId) || {};
  const owner = (db.owners || []).find(o => o.id === pet.ownerId || o.userId === pet.ownerId) || {};
  const vetName = (db.vets || []).find(v => v.id === record.vetId)?.name || "Veterinarian not recorded";

  // Find corresponding appointment if any
  const appt = consultationAppointment(db.appts || [], record);
  const iv = appt?.intakeVitals;

  // Find any vaccines administered on this date for this pet
  const vaccsGiven = (db.vacc || db.vaccs || []).filter(v => v.petId === pet.id && v.date === record.date && v.done && v.vetId);

  // Parse lines of prescription for medical Rx format
  const rxLines = (record.prescription || "")
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);

  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()} style={{ zIndex: 1060, display: "grid", placeItems: "center", padding: "16px" }}>
      <div className="modal" style={{ width: "min(780px, 100%)", maxHeight: "94vh", overflowY: "auto", padding: "26px 30px" }}>
        <HistoryControls auto />
        
        {/* Top Header Toolbar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #e2e8f0", paddingBottom: "14px", marginBottom: "18px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span style={{ background: "#dbeafe", color: "#1e40af", padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>
                Official Medical EMR Record
              </span>
              <span style={{ fontSize: "12px", color: "#64748b" }}>Case ID: <b>REC-{record.id.slice(-6).toUpperCase()}</b></span>
              {(!isVet(me?.role) || !onEdit) && (
                <span style={{ background: "#f1f5f9", color: "#475569", padding: "2px 7px", borderRadius: "4px", fontSize: "11px", fontWeight: 600 }}>
                  Read-Only Clinical View
                </span>
              )}
            </div>
            <h3 style={{ margin: "0 0 2px", color: "var(--navy)", fontSize: "1.35rem", display: "flex", alignItems: "center", gap: "8px" }}>
              <Stethoscope size={22} color="var(--navy)" />
              <span>SOAP Clinical Consultation: <b>{pet.name || "Patient"}</b></span>
            </h3>
            <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
              Examined on <b>{record.date}</b> &bull; Attending Veterinarian: <b>{vetName}</b>
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              type="button"
              className="btn sm ghost"
              disabled={!historyComplete} title={!historyComplete?"Load all saved history before printing a complete clinical record.":undefined} onClick={() => window.print()}
              style={{ display: "flex", alignItems: "center", gap: "5px" }}
              title="Print medical certificate / consultation summary"
            >
              <Printer size={15} /> Print EMR
            </button>
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

        {/* Patient Profile Masthead */}
        <div style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          padding: "14px 18px",
          marginBottom: "18px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "12px"
        }}>
          <div>
            <span style={{ fontSize: "11px", textTransform: "uppercase", color: "#64748b", fontWeight: 700 }}>Patient Details</span>
            <div style={{ fontWeight: 700, fontSize: "14.5px", color: "var(--navy)", marginTop: "2px" }}>
              {pet.name} ({formatSpeciesLabel(pet.species)})
            </div>
            <div style={{ fontSize: "12px", color: "#475569" }}>
              Breed: {pet.breed || "Not recorded"} &bull; Sex: {pet.sex || "Unknown"}
            </div>
          </div>

          <div>
            <span style={{ fontSize: "11px", textTransform: "uppercase", color: "#64748b", fontWeight: 700 }}>Client &amp; Contact</span>
            <div style={{ fontWeight: 700, fontSize: "14px", color: "#1e293b", marginTop: "2px" }}>
              {owner.name || "Not recorded"}
            </div>
            <div style={{ fontSize: "12px", color: "#475569" }}>
              Phone: {owner.phone || "No phone"} &bull; {owner.address || "Address not recorded"}
            </div>
          </div>

          <div>
            <span style={{ fontSize: "11px", textTransform: "uppercase", color: "#64748b", fontWeight: 700 }}>Health Passport</span>
            <div style={{ marginTop: "3px" }}>
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => setCardPetId(pet.id)}
                style={{ padding: "3px 8px", fontSize: "11.5px", background: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8", fontWeight: 700 }}
              >
                Card #{pet.vaccinationCardId || "VACC-UNISSUED"} <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {/* SOAP Medical Breakdown */}
        <div style={{ display: "grid", gap: "16px" }}>

          {/* S - Subjective */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 16px", background: "#ffffff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px", color: "#1e3a8a", fontWeight: 700, fontSize: "13.5px" }}>
              <span style={{ background: "#dbeafe", color: "#1e40af", width: "22px", height: "22px", borderRadius: "4px", display: "grid", placeItems: "center", fontSize: "12px", fontWeight: 800 }}>S</span>
              <span>Subjective (Chief Complaint &amp; Clinical History)</span>
            </div>
            <p style={{ margin: 0, fontSize: "13.5px", color: "#334155", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {record.symptoms || "Not recorded"}
            </p>
          </div>

          {/* O - Objective */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 16px", background: "#ffffff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px", color: "#065f46", fontWeight: 700, fontSize: "13.5px" }}>
              <span style={{ background: "#d1fae5", color: "#065f46", width: "22px", height: "22px", borderRadius: "4px", display: "grid", placeItems: "center", fontSize: "12px", fontWeight: 800 }}>O</span>
              <span>Objective (Vitals &amp; Physical Examination)</span>
            </div>

            {/* Vitals summary cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px", marginBottom: "10px" }}>
              <div style={{ background: "#f8fafc", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Weight</span>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--navy)" }}>
                  {iv?.weight != null ? `${iv.weight} kg` : "Not recorded"}
                </div>
              </div>
              <div style={{ background: "#f8fafc", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Body Temp</span>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#166534" }}>
                  {iv?.temp != null ? `${iv.temp}°C` : "Not recorded"}
                </div>
              </div>
              <div style={{ background: "#f8fafc", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Triage Level</span>
                <div style={{ fontSize: "14px", fontWeight: 700, color: iv?.triageLevel === "Emergency" ? "#b91c1c" : "#1e40af" }}>
                  {iv?.triageLevel || "Not recorded"}
                </div>
              </div>
            </div>

            <p style={{ margin: 0, fontSize: "13px", color: "#334155", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {record.objective || "Not recorded"}
            </p>
          </div>

          {/* A - Assessment (Diagnosis) */}
          <div style={{ border: "1.5px solid #bfdbfe", borderRadius: "10px", padding: "14px 16px", background: "#eff6ff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px", color: "#1e40af", fontWeight: 700, fontSize: "13.5px" }}>
              <span style={{ background: "#1e40af", color: "#ffffff", width: "22px", height: "22px", borderRadius: "4px", display: "grid", placeItems: "center", fontSize: "12px", fontWeight: 800 }}>A</span>
              <span>Assessment &amp; Veterinary Diagnosis</span>
            </div>
            <div style={{ fontSize: "15px", fontWeight: 700, color: "#1e3a8a", margin: "2px 0 4px" }}>
              {record.diagnosis || "Not recorded"}
            </div>
          </div>

          {/* P - Plan & Treatments */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 16px", background: "#ffffff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px", color: "#854d0e", fontWeight: 700, fontSize: "13.5px" }}>
              <span style={{ background: "#fef08a", color: "#854d0e", width: "22px", height: "22px", borderRadius: "4px", display: "grid", placeItems: "center", fontSize: "12px", fontWeight: 800 }}>P</span>
              <span>Plan (In-Clinic Procedures &amp; Care Rendered)</span>
            </div>
            <p style={{ margin: 0, fontSize: "13.5px", color: "#334155", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {record.treatment || "Not recorded"}
            </p>
          </div>

          {/* Rx - Official Prescription Pad */}
          <div style={{ border: "1.5px solid #86efac", borderRadius: "12px", padding: "16px", background: "#f0fdf4" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", borderBottom: "1px solid #bbf7d0", paddingBottom: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontFamily: "serif", fontSize: "22px", fontWeight: 800, color: "#166534" }}>Rx</span>
                <b style={{ color: "#166534", fontSize: "14px" }}>Veterinary Prescription &amp; Home Administration</b>
              </div>
              <span style={{ fontSize: "11px", background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "6px", fontWeight: 700 }}>
                Saved prescription
              </span>
            </div>

            {rxLines.length ? (
              <div style={{ display: "grid", gap: "8px" }}>
                {rxLines.map((line, idx) => (
                  <div key={idx} style={{ background: "#ffffff", padding: "10px 12px", borderRadius: "8px", border: "1px solid #bbf7d0", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <Pill size={16} color="#15803d" style={{ marginTop: "2px", flexShrink: 0 }} />
                    <div style={{ fontSize: "13px", color: "#1e293b", lineHeight: 1.4 }}>
                      {line}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "#64748b", fontSize: "12.5px", fontStyle: "italic" }}>
                No prescription recorded.
              </div>
            )}
          </div>

          {/* Administered Vaccines During Consult (if any) */}
          {vaccsGiven.length > 0 && (
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "12px 14px", background: "#f8fafc" }}>
              <b style={{ color: "var(--navy)", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                <Syringe size={16} color="#2563eb" /> Certified Vaccines Recorded on This Date
              </b>
              <div style={{ display: "grid", gap: "6px" }}>
                {vaccsGiven.map(v => (
                  <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#ffffff", padding: "8px 12px", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "12.5px" }}>
                    <div>
                      <b>{v.vaccine}</b> <span style={{ color: "#64748b" }}>({v.brand || "Brand not recorded"} &bull; Lot: {v.batch || "Not recorded"})</span>
                    </div>
                    <span style={{ fontSize: "11.5px", color: "#15803d", fontWeight: 700 }}>
                      Next Booster: {v.nextDue || "Not recorded"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "22px", paddingTop: "14px", borderTop: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: "12px", color: "#64748b" }}>
            Recorded veterinarian: <b>{vetName}</b>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            {isVet(me?.role) && onEdit && (
              <button
                type="button"
                className="btn sm gold"
                onClick={() => {
                  onClose();
                  onEdit(record);
                }}
              >
                Edit SOAP Note
              </button>
            )}
            <button type="button" className="btn sm ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

      </div>

      {/* Pet Card Modal Popup */}
      {cardPetId && (
        <PetCardModal
          petId={cardPetId}
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setCardPetId(null)}
        />
      )}
    </div>
  );
}

export default function ConsultationsPage({ db, setDb, me, go, say }) {
  const [search, setSearch] = useState("");
  const [vetFilter, setVetFilter] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [editingConsult, setEditingConsult] = useState(null);

  const records = db.records || [];
  const pets = db.pets || [];
  const owners = db.owners || [];

  const filtered = records.filter(r => {
    if (vetFilter && r.vetId !== vetFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const pet = pets.find(p => p.id === r.petId) || {};
    const owner = owners.find(o => o.id === pet.ownerId || o.userId === pet.ownerId) || {};

    return (
      (r.diagnosis && r.diagnosis.toLowerCase().includes(q)) ||
      (r.treatment && r.treatment.toLowerCase().includes(q)) ||
      (r.prescription && r.prescription.toLowerCase().includes(q)) ||
      (r.symptoms && r.symptoms.toLowerCase().includes(q)) ||
      (r.date && r.date.includes(q)) ||
      (pet.name && pet.name.toLowerCase().includes(q)) ||
      (owner.name && owner.name.toLowerCase().includes(q)) ||
      (owner.phone && owner.phone.includes(q))
    );
  }).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      {/* Top Banner Toolbar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "14px",
        marginBottom: "16px",
        flexWrap: "wrap",
        background: "#ffffff",
        padding: "14px 18px",
        borderRadius: "14px",
        border: "1px solid #e2e8f0",
        boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
      }}>
        <div>
          <h3 style={{ margin: "0 0 2px", color: "var(--navy)", fontSize: "1.25rem", display: "flex", alignItems: "center", gap: "8px" }}>
            <FileText size={20} color="var(--navy)" />
            <span>Veterinary Consultations &amp; Medical EMR Records</span>
          </h3>
          <span style={{ fontSize: "12.5px", color: "#64748b" }}>
            Certified SOAP consultation notes, clinical diagnoses, medical treatments, and veterinary prescriptions.
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--navy)", background: "#eff6ff", padding: "6px 12px", borderRadius: "8px", border: "1px solid #bfdbfe" }}>
            {db.totals?.consultations ?? records.length} Consultations on file · {records.length} loaded
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{
        background: "#ffffff",
        padding: "12px 18px",
        borderRadius: "12px",
        border: "1px solid #e2e8f0",
        marginBottom: "16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        flexWrap: "wrap"
      }}>
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: "420px" }}>
          <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input
            type="search"
            placeholder="Search diagnosis, medication, patient, owner..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", padding: "8px 12px 8px 36px", fontSize: "13px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600, color: "#475569", margin: 0 }}>
            <User size={14} />
            <select
              value={vetFilter}
              onChange={e => setVetFilter(e.target.value)}
              style={{ padding: "6px 10px", fontSize: "12.5px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
            >
              <option value="">All Attending Veterinarians</option>
              {(db.vets || []).map(({id, name}) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* Main Consultations Ledger Table */}
      <section className="card" style={{ padding: "0", overflow: "hidden" }}>
        <div style={{ padding: "12px 18px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "12.5px", color: "#475569" }}>
            <b>Tip:</b> Click any consultation row to open the complete <b>Medical SOAP Chart &amp; Veterinary Rx Pad</b>.
          </span>
          <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--navy)" }}>
            {filtered.length} record(s) found
          </span>
        </div>

        {filtered.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "#f8fafc", color: "#475569", borderBottom: "2px solid #e2e8f0" }}>
                  <th style={{ padding: "12px 14px" }}>Date &amp; Time</th>
                  <th style={{ padding: "12px 14px" }}>Patient Profile</th>
                  <th style={{ padding: "12px 14px" }}>Registered Owner</th>
                  <th style={{ padding: "12px 14px" }}>Assessment / Diagnosis</th>
                  <th style={{ padding: "12px 14px" }}>Medications (Rx)</th>
                  <th style={{ padding: "12px 14px" }}>Attending Doctor</th>
                  <th style={{ padding: "12px 14px", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const pet = pets.find(p => p.id === r.petId) || {};
                  const owner = owners.find(o => o.id === pet.ownerId || o.userId === pet.ownerId) || {};
                  const vetInfo = [r.vetId, (db.vets || []).find(v => v.id === r.vetId)?.name || "Veterinarian not recorded"];
                  const hasRx = r.prescription && r.prescription.trim().length > 0;

                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedRecord(r)}
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        cursor: "pointer",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#f0f9ff")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      title="Click to open Medical EMR & Prescription details"
                    >
                      {/* Date */}
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        <b style={{ color: "#1e293b" }}>{r.date}</b>
                      </td>

                      {/* Patient */}
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ color: "var(--navy)" }}><I e={ICON[pet.species] || "paw"} size={16} /></span>
                          <div>
                            <b style={{ color: "var(--navy)" }}>{pet.name || "Patient"}</b>
                            <div style={{ fontSize: "11.5px", color: "#64748b" }}>
                              {pet.breed || pet.species} {pet.weight ? `(${pet.weight} kg)` : ""}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Owner */}
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ color: "#334155", fontWeight: 600 }}>{owner.name || "Walk-in Client"}</span>
                        <div style={{ fontSize: "11.5px", color: "#64748b" }}>{owner.phone || "No phone"}</div>
                      </td>

                      {/* Diagnosis */}
                      <td style={{ padding: "12px 14px", maxWidth: "260px" }}>
                        <div style={{
                          display: "inline-block",
                          background: "#eff6ff",
                          color: "#1e40af",
                          border: "1px solid #bfdbfe",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          fontWeight: 700,
                          fontSize: "12px"
                        }}>
                          {r.diagnosis || "Not recorded"}
                        </div>
                        {r.treatment && (
                          <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "3px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                            {r.treatment}
                          </div>
                        )}
                      </td>

                      {/* Prescription badge */}
                      <td style={{ padding: "12px 14px" }}>
                        {hasRx ? (
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            background: "#f0fdf4",
                            color: "#166534",
                            border: "1px solid #bbf7d0",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 700
                          }}>
                            <Pill size={12} /> Prescribed
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: "11.5px" }}>None</span>
                        )}
                      </td>

                      {/* Attending Vet */}
                      <td style={{ padding: "12px 14px", color: "#475569", whiteSpace: "nowrap" }}>
                        {vetInfo[1]}
                      </td>

                      {/* Action */}
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        <button
                          type="button"
                          className="btn sm ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRecord(r);
                          }}
                          style={{
                            padding: "4px 10px",
                            fontSize: "12px",
                            fontWeight: 600,
                            color: "var(--navy)",
                            border: "1px solid #bfdbfe",
                            background: "#eff6ff",
                            borderRadius: "6px"
                          }}
                        >
                          View EMR <ChevronRight size={14} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty sm" style={{ padding: "32px 16px", textAlign: "center" }}>
            No consultation records found matching your search.
          </div>
        )}
      </section>

      {/* Selected Consultation Detail Modal */}
      {selectedRecord && (
        <ConsultationDetailModal
          record={selectedRecord}
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setSelectedRecord(null)}
          onEdit={(rec) => {
            setSelectedRecord(null);
            setEditingConsult(rec);
          }}
        />
      )}

      {/* Edit SOAP Note Modal if launched by doctor */}
      {editingConsult && (
        <SoapConsultationModal
          appt={(db.appts || []).find(a => a.id === editingConsult.apptId) || null}
          pet={(db.pets || []).find(p => p.id === editingConsult.petId) || {}}
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setEditingConsult(null)}
          onSaved={(newRec) => {
            setEditingConsult(null);
            say && say(`SOAP Consultation updated for ${newRec.id}!`);
          }}
        />
      )}
    </div>
  );
}

