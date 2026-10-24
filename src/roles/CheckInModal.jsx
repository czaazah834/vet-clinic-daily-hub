import { useState } from "react";
import {
  Thermometer,
  Scale,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Flame,
  Snowflake,
  Clock,
  Check,
  Dog,
  Cat,
  Rabbit,
  Bird,
  PawPrint,
  X,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { TODAY, addLog, ICON, petName, ownerName, I } from "../lib.jsx";
import { assessWeight, assessTemp, SPECIES_DEFAULTS } from "./vitals.js";
import { computeWeightBracket, normalizeSpecies } from "../preventiveSchedule.js";
import { api } from "../api.js";

export default function CheckInModal({ appt, db, setDb, me, onClose, onCheckedIn }) {
  const pet = (db.pets && appt ? db.pets.find(p => p.id === appt.petId) : null) || {};
  const owner = (db.owners && pet.ownerId ? db.owners.find(o => o.id === pet.ownerId) : null) || {};

  const species = normalizeSpecies(pet.species);
  const speciesConfig = SPECIES_DEFAULTS[species] || SPECIES_DEFAULTS.Other;
  const lastWeight = pet.weight || (pet.weights && pet.weights.length ? pet.weights[pet.weights.length - 1].kg : null);

  const [weight, setWeight] = useState("");
  const [temp, setTemp] = useState("");
  const [triage, setTriage] = useState("Routine");
  const [serviceReason, setServiceReason] = useState(appt?.reason || "Routine Consultation & Exam");
  const [notes, setNotes] = useState("");
  const [fasted, setFasted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [valErr, setValErr] = useState("");

  const externalVaccs = (db.vacc || db.vaccs || []).filter(v => 
    v.petId === pet.id && (v.recorded_by?.includes("External") || v.brand?.includes("External") || v.protocol_type?.includes("External") || v.protocolType?.includes("External"))
  );

  const weightAnalysis = assessWeight(weight, species, pet.breed || "", lastWeight);
  const tempAnalysis = assessTemp(temp, species);

  const handleStepWeight = (delta) => {
    const cur = parseFloat(weight) || 5.0;
    const next = Math.max(0.1, +(cur + delta).toFixed(1));
    setWeight(String(next));
  };

  const handleStepTemp = (delta) => {
    const cur = parseFloat(temp) || 38.5;
    const next = +(cur + delta).toFixed(1);
    setTemp(String(next));
  };

  const normSpecies = normalizeSpecies(pet.species);
  const clinicalBracket = computeWeightBracket(weight, pet.species, pet.birth);

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const w = parseFloat(weight);
    const t = parseFloat(temp);

    if (isNaN(w) || w < 0.05 || w > 120) {
      setValErr("Please enter a valid patient weight between 0.05 kg and 120 kg.");
      return;
    }
    if (isNaN(t) || t < 33 || t > 45) {
      setValErr("Please enter a valid body temperature between 33°C and 45°C.");
      return;
    }
    setValErr("");

    const intakeVitals = {
      weight: !isNaN(w) ? w : null,
      temp: !isNaN(t) ? t : null,
      weightAnalysis,
      tempAnalysis,
      clinicalBracket,
      triageLevel: triage,
      notes: (notes || "").trim(),
      fasted,
      checkedInAt: new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }),
      checkedInBy: me?.name || "Assistant",
    };

    const isEarlyArrival = appt.date !== TODAY;
    const arrivalTime = new Date().toLocaleTimeString("en-PH", { hour12: false, hour: "2-digit", minute: "2-digit" });

    const patchPayload = {
      status: "Checked-in",
      reason: serviceReason.trim() || appt.reason,
      intakeVitals,
      actorName: me?.name || "Assistant",
      actorRole: me?.role || "assistant"
    };
    if (isEarlyArrival) {
      patchPayload.date = TODAY;
      patchPayload.time = arrivalTime;
    }

    setSaving(true);
    // 1. Persist directly to PostgreSQL Neon DB
    try {
      await api.patch(`/api/appointments/${appt.id}/status`, patchPayload);
    } catch (err) {
      setValErr(err.message);
      setSaving(false);
      return;
    }

    setDb(p => {
      // 1. Update appointment status & intake data
      const nextAppts = p.appts.map(a =>
        a.id === appt.id
          ? {
              ...a,
              date: isEarlyArrival ? TODAY : a.date,
              time: isEarlyArrival ? arrivalTime : a.time,
              status: "Checked-in",
              reason: serviceReason.trim() || a.reason,
              intakeVitals,
            }
          : a
      );

      // 2. Automatically log pet weight for today
      let nextPets = p.pets;
      if (!isNaN(w) && w > 0) {
        nextPets = p.pets.map(x =>
          x.id === pet.id
            ? {
                ...x,
                weight: w,
                weights: [...(x.weights || []).filter(item => item.date !== TODAY), { date: TODAY, kg: w, by: "frontdesk_checkin" }],
              }
            : x
        );
      }

      const alertNotes = [
        tempAnalysis?.alert ? `Temp: ${tempAnalysis.flag} (${t}°C)` : null,
        weightAnalysis?.status !== "ideal" ? `Weight: ${weightAnalysis?.label}` : null,
        triage !== "Routine" ? `Triage: ${triage}` : null,
      ]
        .filter(Boolean)
        .join("; ");

      return {
        ...p,
        appts: nextAppts,
        pets: nextPets,
        log: addLog(
          p,
          me,
          `Front Desk checked in ${pet.name} (${owner.name}). Vitals: ${w} kg (${weightAnalysis?.status || "recorded"}), ${t}°C (${tempAnalysis?.status || "recorded"}). ${alertNotes ? `[${alertNotes}]` : ""} Patient moved to doctor queue.`
        ),
      };
    });

    setSaving(false);
    onCheckedIn && onCheckedIn(intakeVitals);
  };

  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: "min(640px, 100%)", maxHeight: "94vh" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px", marginBottom: "14px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "19px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "var(--navy)" }}><I e={ICON[species] || "paw"} size={22} /></span>
              <span>Front Desk Patient Check-In &amp; Triage</span>
            </h3>
            <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
              <b>Patient:</b> {pet.name || "Patient"} ({pet.breed || species}) &bull; <b>Owner:</b> {owner.name || "—"} ({owner.phone || "—"})
            </p>
          </div>
          <button className="btn ghost sm" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Allergy Alert if any */}
        {pet.allergies && pet.allergies.length > 0 && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "8px 12px", borderRadius: "8px", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertTriangle size={18} color="#dc2626" />
            <b style={{ color: "#991b1b", fontSize: "13px" }}>Known Allergies:</b>
            <span style={{ color: "#dc2626", fontSize: "13px" }}>{pet.allergies.join(", ")}</span>
          </div>
        )}

        {/* Early Arrival Notice if booked for a different date */}
        {appt.date !== TODAY && (
          <div style={{ background: "#eff6ff", border: "1.5px solid #93c5fd", padding: "10px 14px", borderRadius: "10px", marginBottom: "14px", fontSize: "12.5px", color: "#1e40af", display: "flex", alignItems: "center", gap: "10px" }}>
            <Clock size={18} color="#2563eb" />
            <div>
              <b>Early Walk-in Arrival:</b> Patient was booked for <b>{appt.date}</b>. Checking in now will move their visit to <b>Today ({TODAY})</b> and queue them directly for the doctor.
            </div>
          </div>
        )}

        <form onSubmit={submit}>
          <div style={{ display: "grid", gap: "14px" }}>
            {/* 1. Automated Kilogram / Weight Section */}
            <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <b style={{ color: "var(--navy)", fontSize: "14px" }}>1. Patient Weight (Automated Breed Assessment)</b>
                {lastWeight && (
                  <span style={{ fontSize: "12px", color: "#64748b" }}>
                    Last recorded: <b>{lastWeight} kg</b>
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <div style={{ flex: "1" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={weight}
                      onChange={e => setWeight(e.target.value)}
                      style={{ fontSize: "18px", fontWeight: "700", padding: "8px 12px", width: "120px" }}
                    />
                    <span style={{ fontWeight: "700", color: "#475569" }}>kg</span>
                    <button type="button" className="btn ghost sm" onClick={() => handleStepWeight(-0.5)}>-0.5</button>
                    <button type="button" className="btn ghost sm" onClick={() => handleStepWeight(-0.1)}>-0.1</button>
                    <button type="button" className="btn ghost sm" onClick={() => handleStepWeight(+0.1)}>+0.1</button>
                    <button type="button" className="btn ghost sm" onClick={() => handleStepWeight(+0.5)}>+0.5</button>
                  </div>
                </div>

                {weightAnalysis && (
                  <div style={{ textAlign: "right" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 10px",
                        borderRadius: "99px",
                        fontSize: "12px",
                        fontWeight: "700",
                        background: weightAnalysis.color + "22",
                        color: weightAnalysis.color,
                        border: `1px solid ${weightAnalysis.color}`,
                      }}
                    >
                      {weightAnalysis.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Automated Feedback */}
              {weightAnalysis && (
                <div style={{ marginTop: "10px", fontSize: "12.5px", color: "#475569" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Ideal Range for {pet.breed || pet.species}: <b>{weightAnalysis.idealRange}</b></span>
                    {weightAnalysis.trend && <b style={{ color: "#0369a1" }}>{weightAnalysis.trend}</b>}
                  </div>
                  {weightAnalysis.warning && (
                    <div style={{ marginTop: "4px", color: weightAnalysis.color, fontWeight: "600", display: "flex", alignItems: "center", gap: "5px" }}>
                      <AlertTriangle size={14} /> {weightAnalysis.warning}
                    </div>
                  )}
                </div>
              )}

              {/* VCMS Clinical Weight Bracket & Pharmacy Verification for Vet Assistant */}
              {clinicalBracket && normSpecies === "Canine" && (
                <div style={{ marginTop: "12px", background: "#fff", border: "1.5px solid #fed7aa", borderRadius: "10px", padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                    <Scale size={15} color="#9a3412" />
                    <b style={{ color: "#9a3412", fontSize: "12.5px", textTransform: "uppercase" }}>
                      Clinical Dispensing Brackets ({clinicalBracket.kg} kg Weighed)
                    </b>
                  </div>

                  {clinicalBracket.heartwormAlert && (
                    <div style={{ background: "#fef2f2", border: "1px solid #f87171", color: "#991b1b", padding: "6px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <ShieldAlert size={14} />
                      <span>{clinicalBracket.heartwormAlert}</span>
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px" }}>
                    <div style={{ background: "#f8fafc", padding: "6px 8px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                      <span style={{ color: "#334155", fontWeight: 700 }}>NexGard Spectra: </span>
                      {clinicalBracket.nexgard && (
                        <span style={{ background: clinicalBracket.nexgard.color, color: "#fff", padding: "1px 6px", borderRadius: "4px", fontWeight: 700 }}>
                          {clinicalBracket.nexgard.box}
                        </span>
                      )}
                    </div>
                    <div style={{ background: "#f8fafc", padding: "6px 8px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                      <span style={{ color: "#334155", fontWeight: 700 }}>Simparica Trio: </span>
                      {clinicalBracket.simparica && (
                        <span style={{ background: "#2563eb", color: "#fff", padding: "1px 6px", borderRadius: "4px", fontWeight: 700 }}>
                          {clinicalBracket.simparica.box}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Species Toxicity Interceptors for Front Desk */}
              {normSpecies === "Lagomorph" && (
                <div style={{ marginTop: "10px", background: "#fef2f2", border: "1px solid #f87171", borderRadius: "8px", padding: "8px 10px", color: "#991b1b", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <ShieldAlert size={15} />
                  <span><b>Clinical Toxicology Interceptor:</b> Strict ban on Fipronil (Frontline) due to fatal rabbit neurotoxicity.</span>
                </div>
              )}
              {normSpecies === "Feline" && (
                <div style={{ marginTop: "10px", background: "#fef2f2", border: "1px solid #f87171", borderRadius: "8px", padding: "8px 10px", color: "#991b1b", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <ShieldAlert size={15} />
                  <span><b>Clinical Toxicology Interceptor:</b> Completely restrict formulas containing Permethrin on felines.</span>
                </div>
              )}
            </div>

            {/* 2. Automated Body Temperature Section */}
            <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <b style={{ color: "var(--navy)", fontSize: "14px" }}>2. Body Temperature (Automated Clinical Pyrexia Check)</b>
                <span style={{ fontSize: "12px", color: "#64748b" }}>
                  Normal {pet.species}: <b>{speciesConfig.tempMin} – {speciesConfig.tempMax}°C</b>
                </span>
              </div>

              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <div style={{ flex: "1" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <input
                      type="number"
                      step="0.1"
                      min="35.0"
                      max="44.0"
                      value={temp}
                      onChange={e => setTemp(e.target.value)}
                      style={{ fontSize: "18px", fontWeight: "700", padding: "8px 12px", width: "120px" }}
                    />
                    <span style={{ fontWeight: "700", color: "#475569" }}>°C</span>
                    <button type="button" className="btn ghost sm" onClick={() => handleStepTemp(-0.2)}>-0.2</button>
                    <button type="button" className="btn ghost sm" onClick={() => handleStepTemp(+0.2)}>+0.2</button>
                    <button
                      type="button"
                      className="btn ghost sm"
                      title="Set to standard normal baseline with lesser manual input"
                      onClick={() => setTemp(String(speciesConfig.normalTempPreset))}
                      style={{ background: "#e0f2fe", color: "#0369a1", borderColor: "#bae6fd" }}
                    >
                      Use measured normal ({speciesConfig.normalTempPreset}°C)
                    </button>
                  </div>
                </div>

                {tempAnalysis && (
                  <div style={{ textAlign: "right" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 10px",
                        borderRadius: "99px",
                        fontSize: "12px",
                        fontWeight: "700",
                        background: tempAnalysis.color + "22",
                        color: tempAnalysis.color,
                        border: `1px solid ${tempAnalysis.color}`,
                      }}
                    >
                      {tempAnalysis.flag}
                    </span>
                  </div>
                )}
              </div>

              {/* Automated Temperature Warning Banners */}
              {tempAnalysis && (
                <div style={{ marginTop: "10px", fontSize: "12.5px" }}>
                  {tempAnalysis.status === "high_fever" ? (
                    <div style={{ padding: "8px 12px", background: "#fef2f2", border: "1px solid #f87171", borderRadius: "8px", color: "#991b1b", fontWeight: "700", display: "flex", alignItems: "center", gap: "8px" }}>
                      <Flame size={16} color="#dc2626" />
                      <span>HIGH FEVER DETECTED ({temp}°C)! This patient will be flagged with critical priority in Dr. Queue.</span>
                    </div>
                  ) : tempAnalysis.status === "mild_fever" ? (
                    <div style={{ padding: "8px 12px", background: "#fffbeb", border: "1px solid #fde047", borderRadius: "8px", color: "#854d0e", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
                      <AlertTriangle size={16} color="#ea580c" />
                      <span>Mild Pyrexia / Elevated Temperature ({temp}°C). Normal range is {speciesConfig.tempMin}–{speciesConfig.tempMax}°C.</span>
                    </div>
                  ) : tempAnalysis.status === "hypothermia" ? (
                    <div style={{ padding: "8px 12px", background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: "8px", color: "#1e40af", fontWeight: "700", display: "flex", alignItems: "center", gap: "8px" }}>
                      <Snowflake size={16} color="#2563eb" />
                      <span>Subnormal Temperature / Hypothermia Warning ({temp}°C). Provide thermal blanket.</span>
                    </div>
                  ) : (
                    <div style={{ color: "#16a34a", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
                      <CheckCircle2 size={16} color="#16a34a" />
                      <span>{tempAnalysis.advice}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Visit Purpose Confirmation & External Guide Indicator */}
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "12px 14px", borderRadius: "10px", marginBottom: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <label style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--navy)", margin: 0 }}>
                  Confirmed Reason / Purpose for Today&rsquo;s Visit
                </label>
                {externalVaccs.length > 0 && (
                  <span style={{ fontSize: "11px", background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", padding: "2px 7px", borderRadius: "6px", fontWeight: 700 }} title="Has prior records from outside clinic">
                    {externalVaccs.length} External Dose(s) on File
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                {[
                  "Routine Consultation & Exam",
                  normSpecies === "Feline" ? "Vaccination: FVRCP (4-in-1)" : "Vaccination: DHPP (5-in-1)",
                  "Vaccination: Anti-Rabies Core",
                  "Routine Deworming",
                  "Flea & Tick Prevention",
                  "Grooming & Sanitary",
                  "Emergency / Critical"
                ].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setServiceReason(preset);
                      if (preset.includes("Emergency")) setTriage("Emergency");
                    }}
                    style={{
                      fontSize: "11.5px",
                      padding: "3px 8px",
                      borderRadius: "6px",
                      border: serviceReason === preset ? "1.5px solid #2563eb" : "1px solid #cbd5e1",
                      background: serviceReason === preset ? "#eff6ff" : "#fff",
                      color: serviceReason === preset ? "#1e40af" : "#475569",
                      fontWeight: serviceReason === preset ? 700 : 500,
                      cursor: "pointer"
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={serviceReason}
                onChange={e => setServiceReason(e.target.value)}
                placeholder="Confirm or clarify what patient needs today..."
                style={{ width: "100%", padding: "7px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
              />
            </div>

            {/* 3. Triage Level & Quick Intake Notes */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div className="fld">
                <label>Triage Priority Level</label>
                <select value={triage} onChange={e => setTriage(e.target.value)}>
                  <option value="Routine">Routine / Standard (Normal Queue)</option>
                  <option value="Priority">Priority / Unwell (Visible Alert)</option>
                  <option value="Emergency">Emergency / Critical (Immediate Queue)</option>
                </select>
              </div>

              <div className="fld">
                <label>Fasting Status (If for procedure/surgery)</label>
                <select value={fasted ? "yes" : "no"} onChange={e => setFasted(e.target.value === "yes")}>
                  <option value="no">No / Fed normally today</option>
                  <option value="yes">Yes / Fasted (NPO &gt; 8 hours)</option>
                </select>
              </div>

              <div className="fld" style={{ gridColumn: "1/-1" }}>
                <label>Front Desk Intake Observations / Owner Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Owner reports vomiting since morning; active and drinking water..."
                />
              </div>
            </div>
          </div>

          {valErr && (
            <p className="err" role="alert" style={{ marginTop: "12px", marginBottom: "0" }}>
              {valErr}
            </p>
          )}

          <div className="row end" style={{ marginTop: "20px", gap: "10px" }}>
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn gold" disabled={saving}>
              Complete Check-In &amp; Send to Doctor Queue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

