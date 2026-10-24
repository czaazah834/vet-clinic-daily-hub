import PrescriptionBuilder from "./PrescriptionBuilder.jsx";
import { calculateSupply } from "../prescription.js";
import { boosterDate, VACCINE_SERVICE } from "../clinicalWorkflow.js";
import { useEffect, useState } from "react";
import { Stethoscope, Activity, AlertTriangle, X, Calendar, Pill } from "lucide-react";
import { TODAY, plus, uid, petName, ownerName, addLog, ICON, I } from "../lib.jsx";
import { api } from "../api.js";

export default function SoapConsultationModal({ appt, pet, db, setDb, me, onClose, onSaved }) {
  const [tab, setTab] = useState("soap"); // 'soap' | 'emr'
  const owner = db.owners.find(o => o.id === pet.ownerId) || {};
  const followUpRequest = db.records.find(r => r.id === appt?.followUpId);
  const prevRecords = db.records.filter(r => r.petId === pet.id).sort((a, b) => b.date.localeCompare(a.date));
  const prevVaccs = db.vacc.filter(v => v.petId === pet.id).sort((a, b) => b.date.localeCompare(a.date));

  // SOAP fields initialized with Assistant's Intake Vitals if present
  const iv = appt?.intakeVitals;
  const initialWeight = iv?.weight ? String(iv.weight) : pet.weight ? String(pet.weight) : "";
  const initialTemp = iv?.temp ? `${iv.temp}°C` : "not measured";
  const tempRemark = iv?.tempAnalysis ? ` (${iv.tempAnalysis.label})` : "";
  const weightRemark = iv?.weightAnalysis ? ` (${iv.weightAnalysis.label})` : "";
  const triageRemark = iv?.triageLevel && iv.triageLevel !== "Routine" ? ` [TRIAGE: ${iv.triageLevel.toUpperCase()}]` : "";

  const [f, setF] = useState({
    date: TODAY,
    symptoms: appt?.reason ? `Chief Complaint: ${appt.reason}${triageRemark}` : "",
    objective: `Temp: ${initialTemp}${tempRemark}, Weight: ${initialWeight ? `${initialWeight} kg` : "—"}${weightRemark}.`,
    diagnosis: "",
    treatment: "",
    prescription: "",
    weight: initialWeight,
    // Vaccine administration
    giveVaccine: false,
    vaccine: "Anti-rabies",
    doseNo: "",
    doseOf: "",
    intervalDays: "",
    scheduleApproved: false,
    brand: "",
    batch: "",
    vaccineNotes: "Administered subcutaneously during consultation.",
    // Clinical Follow-up Scheduling
    scheduleFollowUp: false,
    careStatus: "Follow-up required",
    followUpDays: "7",
    followUpDate: plus(7),
    followUpReason: `Clinical Follow-up & Post-treatment Re-check for ${pet.name}`,
  });

  const [prescriptionItems, setPrescriptionItems] = useState([]);
  const [performedServices, setPerformedServices] = useState([]);
  const [serviceCatalog, setServiceCatalog] = useState([]);
  const [catalogError, setCatalogError] = useState('');
  const [catalogAttempt, retryCatalog] = useState(0);
  useEffect(() => {
    let active = true;
    api.get('/api/services/prices').then(r => { if (active) { setServiceCatalog(r.catalog.filter(p => p.id.startsWith('srv_') && !p.requiresPrescription)); setCatalogError(''); } }).catch(e => { if (active) setCatalogError(e.message); });
    return () => { active = false; };
  }, [catalogAttempt]);
  const [errs, setErrs] = useState({});

  const set = (k, v) => {
    setF(p => ({ ...p, [k]: v, ...(["date","vaccine","intervalDays","brand","batch","doseNo","doseOf"].includes(k) ? {scheduleApproved:false} : {}) }));
    if (k === "diagnosis") {
      setErrs(p => ({ ...p, diagnosis: !v.trim() ? "Assessment / Diagnosis is required" : "" }));
    } else if (k === "treatment") {
      setErrs(p => ({ ...p, treatment: !v.trim() ? "Plan / Treatment is required" : "" }));
    } else if (errs[k]) {
      setErrs(p => ({ ...p, [k]: "" }));
    }
  };

  const handleFollowUpDaysChange = (days) => {
    const d = parseInt(days, 10) || 7;
    setF(p => ({
      ...p,
      followUpDays: String(d),
      followUpDate: plus(d)
    }));
  };

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (loading) return;
    const e = {};
    if (!serviceCatalog.length || catalogError) e.save = "Load the official service catalog before finalizing.";
    let selectedItems;
    try {
      selectedItems = prescriptionItems.map(p => {
        if (p.dose) { const supply = calculateSupply(p.dose); return {...p, quantity:supply.quantity, instructions:supply.directions}; }
        if (!Number.isInteger(p.quantity) || p.quantity < 1 || p.quantity > 1000 || !p.instructions.trim()) throw new Error('Complete the directions and supply quantity for each selected product.');
        return p;
      });
    } catch (err) { e.prescription = err.message; }
    if (!f.diagnosis.trim()) e.diagnosis = "Assessment / Diagnosis is required";
    if (!f.treatment.trim()) e.treatment = "Plan / Treatment is required";
    if (f.giveVaccine) {
      if (!Number.isInteger(+f.doseNo) || +f.doseNo < 1 || +f.doseOf < +f.doseNo || !Number.isInteger(+f.doseOf) || +f.doseOf > 20) e.vaccine = "Enter the administered dose number and total planned doses (1–20).";
      if (!boosterDate(f.date, f.intervalDays) || !f.scheduleApproved) e.vaccine = "Enter and approve the booster interval for this patient.";
      if (!f.vaccine) e.vaccine = "Please select the administered biological / vaccine.";
      if (!f.brand.trim()) e.brand = "Vaccine manufacturer brand name is required.";
      if (!f.batch.trim()) e.batch = "Lot / Batch number is required for official certification.";
    }
    if (f.scheduleFollowUp) {
      if (!f.followUpReason.trim()) e.followUpReason = "Enter follow-up instructions.";
      if (!f.followUpDate || f.followUpDate < TODAY) e.followUpDate = "Follow-up date must be today or in the future.";
    }

    if (Object.keys(e).length) {
      setErrs(e);
      return;
    }

    setLoading(true);
    const consultId = uid();
    const effectiveVetId = me.vetId || me.id || "v1";

    const newRecord = {
      id: consultId,
      petId: pet.id,
      vetId: effectiveVetId,
      apptId: appt ? appt.id : null,
      date: f.date,
      symptoms: f.symptoms.trim(),
      objective: f.objective.trim(),
      diagnosis: f.diagnosis.trim(),
      treatment: f.treatment.trim(),
      prescription: f.prescription.trim(),
      prescriptionItems: selectedItems,
      performedServices,
      careStatus: f.scheduleFollowUp ? f.careStatus : "Routine care",
      followUpDate: f.scheduleFollowUp ? f.followUpDate : null,
      followUpReason: f.scheduleFollowUp ? f.followUpReason.trim() : "",
    };

    let newVacc = null;
    if (f.giveVaccine) {
      const boosterDue = boosterDate(f.date, f.intervalDays);
      newVacc = {
        id: "v" + uid(),
        petId: pet.id,
        vaccine: f.vaccine,
        brand: f.brand.trim() || "Defensor 3",
        batch: f.batch.trim() || `LOT-${new Date().getFullYear()}-01`,
        date: f.date,
        nextDue: boosterDue,
        doseNo: Number(f.doseNo),
        doseOf: Number(f.doseOf),
        intervalDays: Number(f.intervalDays),
        scheduleApproved: f.scheduleApproved,
        notes: f.vaccineNotes.trim(),
        done: true
      };
    }

    // Finalize the linked clinical data together, or leave the form open on failure.
    const followUpNote = f.scheduleFollowUp
      ? `\nFollow-up requested for ${f.followUpDate}: ${f.followUpReason.trim()}. Reception to confirm scheduling.` : "";
    newRecord.treatment += followUpNote;
    let saved;
    try {
      saved = await api.post("/api/consultations", {
        ...newRecord,
        ...(f.weight ? { weight: Number(f.weight) } : {}),
        vaccination: newVacc,
      });
    } catch (err) {
      setErrs(p => ({ ...p, save: err.message }));
      setLoading(false);
      return;
    }

    newRecord.performedServices = saved.invoiceItems.filter(i => i.source === "performed");
    newRecord.prescription = saved.prescription;
    newRecord.prescriptionItems = saved.prescriptionItems;

    // 5. Update In-Memory / React State
    setDb(p => {
      const nextRecords = [newRecord, ...(p.records || [])];
      let nextVacc = p.vacc || [];
      if (newVacc) {
        nextVacc = [
          newVacc,
          ...nextVacc.map(v => (v.petId === pet.id && v.vaccine === newVacc.vaccine ? { ...v, done: true } : v)),
        ];
      }

      let nextPets = p.pets || [];
      if (f.weight && !isNaN(+f.weight) && +f.weight > 0) {
        const kg = +f.weight;
        nextPets = nextPets.map(x =>
          x.id === pet.id
            ? {
                ...x,
                weight: kg,
                weights: [...(x.weights || []), { date: f.date, kg, by: `Dr. ${me.name}` }],
              }
            : x
        );
      }

      let nextAppts = (p.appts || []).map(a =>
        appt && a.id === appt.id ? { ...a, status: "Completed", billingStatus: "Unbilled", invoiceItems: saved.invoiceItems } : a
      );

      return {
        ...p,
        records: nextRecords,
        vacc: nextVacc,
        pets: nextPets,
        appts: nextAppts,
        log: addLog(
          p,
          me,
          `Veterinarian ${me.name} completed consultation for ${pet.name}. Diagnosis: ${newRecord.diagnosis}.${
            newVacc ? ` Administered ${newVacc.vaccine} (${newVacc.brand}, batch ${newVacc.batch}), next booster due ${newVacc.nextDue}.` : ""
          }${f.scheduleFollowUp ? ` Follow-up requested for ${f.followUpDate}; reception to confirm booking.` : ""} Sent to Front Desk for billing & checkout.`
        ),
      };
    });

    setLoading(false);
    onSaved && onSaved(newRecord);
  };

  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal clinical-soap" style={{ width: "min(760px, 100%)", maxHeight: "94vh" }}>
        <style>{`.clinical-soap input[type=checkbox]{width:auto;flex:0 0 auto}.clinical-soap .service-check{display:flex;align-items:flex-start;gap:8px;margin-bottom:8px}.clinical-soap .tabs{flex-wrap:wrap}.clinical-soap .tabs button{white-space:normal;max-width:100%;min-width:0}`}</style>
        {followUpRequest && <div className="ow-note info"><b>Linked {followUpRequest.careStatus}</b><p>Target: {followUpRequest.followUpDate} · {followUpRequest.followUpReason}</p></div>}
        {(appt?.handoffs || []).length > 0 && <section className="ow-note info" aria-label="Veterinarian handoff instructions" style={{overflowWrap:'anywhere'}}>
          <b>Care handoff history</b>
          {appt.handoffs.map((h,i)=><div key={i}><p><b>{h.from} → {h.to}</b> · {new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(new Date(h.at))}</p><p style={{whiteSpace:'pre-wrap'}}>{h.note}</p></div>)}
        </section>}
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px", marginBottom: "14px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "var(--navy)" }}><I e={pet.species || "paw"} size={22} /></span>
              <span>SOAP Consultation &amp; EMR: <b>{pet.name}</b></span>
            </h3>
            <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
              <b>Owner:</b> {owner.name} ({owner.phone}) &bull; <b>Breed:</b> {pet.breed || pet.species} &bull; <b>Sex:</b> {pet.sex}
            </p>
          </div>
          <button className="btn ghost sm" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Allergy Alert Banner if any */}
        {(pet.allergies && pet.allergies.length > 0) ? (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "10px 14px", borderRadius: "10px", marginBottom: "14px", display: "flex", alignItems: "center", gap: "10px" }}>
            <AlertTriangle size={20} color="#dc2626" />
            <div>
              <b style={{ color: "#991b1b", fontSize: "13.5px" }}>CLINICAL ALLERGY ALERT:</b>
              <span style={{ color: "#b91c1c", fontSize: "13px", marginLeft: "6px" }}>{pet.allergies.join(", ")}</span>
            </div>
          </div>
        ) : null}

        {/* Tab switch */}
        <div className="tabs" style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <button
            type="button"
            className={`btn sm ${tab === "soap" ? "gold" : "ghost"}`}
            onClick={() => setTab("soap")}
          >
            SOAP Clinical Notes
          </button>
          <button
            type="button"
            className={`btn sm ${tab === "emr" ? "gold" : "ghost"}`}
            onClick={() => setTab("emr")}
          >
            Digital EMR History ({prevRecords.length} Consultations, {prevVaccs.length} Vaccines)
          </button>
        </div>

        {tab === "emr" ? (
          <div style={{ maxHeight: "55vh", overflowY: "auto", paddingRight: "4px" }}>
            <h4 style={{ margin: "0 0 10px", fontSize: "15px", color: "var(--navy)" }}>Past Consultation History</h4>
            {prevRecords.length ? (
              <div style={{ display: "grid", gap: "12px", marginBottom: "20px" }}>
                {prevRecords.map(r => (
                  <div key={r.id} className="card" style={{ padding: "14px", border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <b style={{ color: "var(--navy)", fontSize: "14px" }}>{r.diagnosis}</b>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>{r.date}</span>
                    </div>
                    {r.symptoms && <p style={{ margin: "0 0 4px", fontSize: "12.5px" }}><b>Subjective:</b> {r.symptoms}</p>}
                    {r.objective && <p style={{ margin: "0 0 4px", fontSize: "12.5px" }}><b>Objective:</b> {r.objective}</p>}
                    <p style={{ margin: "0 0 4px", fontSize: "12.5px" }}><b>Plan / Treatment:</b> {r.treatment}</p>
                    {r.prescription && <p style={{ margin: "0 0 4px", fontSize: "12.5px", color: "#1d4ed8" }}><b>Prescription:</b> {r.prescription}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "20px" }}>No past consultation records on file.</p>
            )}

            <h4 style={{ margin: "0 0 10px", fontSize: "15px", color: "var(--navy)" }}>Vaccination History</h4>
            {prevVaccs.length ? (
              <div style={{ display: "grid", gap: "8px" }}>
                {prevVaccs.map(v => (
                  <div key={v.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px" }}>
                    <span><b>{v.vaccine}</b> {v.brand ? `(${v.brand})` : ""}</span>
                    <span>Administered: {v.date} &bull; Next Booster: <b>{v.nextDue || "—"}</b></span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "#64748b", fontSize: "13px" }}>No vaccinations logged.</p>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {iv && (
              <div style={{
                background: iv.tempAnalysis?.status === "high-fever" || iv.tempAnalysis?.status === "hypothermia" || iv.triageLevel === "Emergency"
                  ? "#fef2f2"
                  : "#f0fdf4",
                border: "1px solid " + (iv.triageLevel === "Emergency" ? "#fca5a5" : "#bbf7d0"),
                borderRadius: "10px",
                padding: "10px 14px",
                marginBottom: "14px",
                fontSize: "13px"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <b style={{ color: "var(--navy)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Activity size={16} /> Front Desk Intake Vitals
                  </b>
                  {iv.triageLevel && (
                    <span style={{
                      fontWeight: 700,
                      fontSize: "11px",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: iv.triageLevel === "Emergency" ? "#fee2e2" : iv.triageLevel === "Priority" ? "#fef3c7" : "#e2e8f0",
                      color: iv.triageLevel === "Emergency" ? "#991b1b" : iv.triageLevel === "Priority" ? "#92400e" : "#334155"
                    }}>
                      Triage: {iv.triageLevel.toUpperCase()}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", color: "#334155" }}>
                  <span><b>Temperature:</b> {iv.temp}°C ({iv.tempAnalysis?.label || "Normal"})</span>
                  <span><b>Weight:</b> {iv.weight} kg ({iv.weightAnalysis?.label || "Ideal"})</span>
                  {iv.weightAnalysis?.trend && <span><b>Change:</b> {iv.weightAnalysis.trend}</span>}
                  {iv.recordedAt && <span style={{ color: "#64748b" }}>Logged at: {iv.recordedAt}</span>}
                </div>
                {iv.triageNotes && (
                  <div style={{ marginTop: "4px", fontSize: "12px", color: "#475569" }}>
                    <b>Assistant Notes:</b> &ldquo;{iv.triageNotes}&rdquo;
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div className="fld full" style={{ gridColumn: "1/-1" }}>
                <label>
                  <b>S - Subjective (Chief Complaint &amp; History)</b><i> *</i>
                  <textarea
                    rows={2}
                    value={f.symptoms}
                    onChange={e => set("symptoms", e.target.value)}
                    placeholder="Patient symptoms, onset, behavioral observations, owner complaint..."
                  />
                </label>
              </div>

              <div className="fld full" style={{ gridColumn: "1/-1" }}>
                <label>
                  <b>O - Objective (Physical Exam &amp; Vitals)</b><i> *</i>
                  <textarea
                    rows={2}
                    value={f.objective}
                    onChange={e => set("objective", e.target.value)}
                    placeholder="Body temperature, heart rate, hydration, mucous membranes, lymph nodes..."
                  />
                </label>
              </div>

              <div className="fld">
                <label>Patient Weight Today (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={f.weight}
                  onChange={e => set("weight", e.target.value)}
                  placeholder="e.g. 14.8"
                />
              </div>

              <div className="fld">
                <label>Consultation Date</label>
                <input
                  type="date"
                  value={f.date}
                  onChange={e => set("date", e.target.value)}
                />
              </div>

              <div className="fld full" style={{ gridColumn: "1/-1" }}>
                <label>
                  <b>A - Assessment (Diagnosis)</b><i> *</i>
                  <textarea
                    rows={2}
                    value={f.diagnosis}
                    onChange={e => set("diagnosis", e.target.value)}
                    placeholder="Clinical diagnosis, differential diagnosis, condition assessment..."
                    className={errs.diagnosis ? "bad" : ""}
                  />
                </label>
                {errs.diagnosis && <span className="err">{errs.diagnosis}</span>}
              </div>

              <div className="fld full" style={{ gridColumn: "1/-1" }}>
                <label>
                  <b>P - Plan (Treatment &amp; In-Clinic Procedures)</b><i> *</i>
                  <textarea
                    rows={2}
                    value={f.treatment}
                    onChange={e => set("treatment", e.target.value)}
                    placeholder="Procedures performed, fluids administered, wound treatment, instructions..."
                    className={errs.treatment ? "bad" : ""}
                  />
                </label>
                {errs.treatment && <span className="err">{errs.treatment}</span>}
              </div>

              <fieldset style={{gridColumn:"1/-1"}}><legend>Confirm services performed</legend>
                <p>Select only services actually performed. Each selection is added to billing once at the fixed clinic price. Recorded vaccines below are included automatically.</p>
                {catalogError ? <p role="alert">{catalogError} <button type="button" onClick={() => retryCatalog(n => n + 1)}>Retry prices</button></p> : !serviceCatalog.length ? <p>Loading services…</p> : serviceCatalog.map(p => {
                  const automatic = f.giveVaccine && VACCINE_SERVICE[f.vaccine] === p.id;
                  return <label key={p.id} className="service-check"><input type="checkbox" checked={automatic || performedServices.includes(p.id)} disabled={automatic} onChange={e => setPerformedServices(prev => e.target.checked ? [...prev,p.id] : prev.filter(id => id !== p.id))} /> {p.name} · ₱{p.price.toLocaleString()}{automatic ? ' · Included from administration' : ''}</label>;
                })}
              </fieldset>
              <div style={{gridColumn: "1/-1"}}><PrescriptionBuilder items={prescriptionItems} onChange={setPrescriptionItems} notes={f.prescription} onNotes={v => set("prescription", v)} error={errs.prescription} /></div>

              {/* Vaccine Administration During Consultation */}
              <div style={{ gridColumn: "1/-1", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "14px", borderRadius: "12px", marginTop: "4px" }}>
                <label style={{ display: "flex", gap: "10px", alignItems: "center", cursor: "pointer", fontWeight: "700", color: "#166534" }}>
                  <input
                    type="checkbox"
                    checked={f.giveVaccine}
                    onChange={e => set("giveVaccine", e.target.checked)}
                  />
                  <span>Record administration and approve the next booster schedule</span>
                </label>

                {f.giveVaccine && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "12px" }}>
                    <div className="fld">
                      <label>Vaccine Type<i> *</i></label>
                      <select value={f.vaccine} onChange={e => set("vaccine", e.target.value)}>
                        <option value="Anti-rabies">Anti-rabies</option>
                        <option value="5-in-1">5-in-1 DHPP</option>
                        <option value="Kennel cough">Kennel cough</option>
                        <option value="Feline 4-in-1">Feline 4-in-1</option>
                        <option value="Deworming">Deworming</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="fld">
                      <label htmlFor="booster-interval">Vet-selected interval (days)<i> *</i></label>
                      <input id="booster-interval" type="number" min="1" max="3650" step="1" value={f.intervalDays} onChange={e => set("intervalDays", e.target.value)} />
                      <label htmlFor="booster-due">Calculated Booster Due Date</label>
                      <input
                        type="date"
                        id="booster-due"
                        value={boosterDate(f.date, f.intervalDays)}
                        readOnly
                        style={{ background: "#f8fafc", fontWeight: "600", color: "#15803d" }}
                      />
                    </div>

                    <label>Dose number in current series<input type="number" min="1" max="20" step="1" value={f.doseNo} onChange={e => set("doseNo", e.target.value)} /></label>
                    <label>Total planned doses in series<input type="number" min="1" max="20" step="1" value={f.doseOf} onChange={e => set("doseOf", e.target.value)} /></label>
                    <div style={{gridColumn:"1/-1"}}>
                      <p>Administration: {f.date} · Birth date: {pet.birth || 'Not recorded'}. Review prior doses in Digital EMR History before selecting the interval.</p>
                      <label className="service-check"><input type="checkbox" checked={f.scheduleApproved} onChange={e => set("scheduleApproved", e.target.checked)} /> I approve this interval for the patient's species, age, prior doses and the administered product.</label>
                      {!VACCINE_SERVICE[f.vaccine] && <p>No fixed catalog price is configured for this vaccine. Its administration is recorded without an automatic vaccine charge.</p>}
                      {errs.vaccine && <p className="err">{errs.vaccine}</p>}
                    </div>
                    <div className="fld">
                      <label>Vaccine Brand</label>
                      <input
                        type="text"
                        placeholder="e.g. Defensor 3, Vanguard"
                        value={f.brand}
                        onChange={e => set("brand", e.target.value)}
                      />
                      {errs.brand && <span className="err">{errs.brand}</span>}
                    </div>

                    <div className="fld">
                      <label>Batch / Lot Number</label>
                      <input
                        type="text"
                        placeholder="e.g. LOT-2026-X8"
                        value={f.batch}
                        onChange={e => set("batch", e.target.value)}
                      />
                      {errs.batch && <span className="err">{errs.batch}</span>}
                    </div>
                  </div>
                )}
              </div>

              {/* Follow-up Appointment Scheduler */}
              <div style={{ gridColumn: "1/-1", background: "#f8fafc", border: "1px solid #cbd5e1", padding: "14px", borderRadius: "12px", marginTop: "4px" }}>
                <label style={{ display: "flex", gap: "10px", alignItems: "center", cursor: "pointer", fontWeight: "700", color: "#1e3a8a" }}>
                  <input
                    type="checkbox"
                    checked={f.scheduleFollowUp}
                    onChange={e => set("scheduleFollowUp", e.target.checked)}
                  />
                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Calendar size={16} /> Request Clinical Follow-up / Re-check Visit
                  </span>
                </label>

                {f.scheduleFollowUp && (
                  <div style={{ marginTop: "12px" }}>
                    <label>Care status <select value={f.careStatus} onChange={e => set("careStatus", e.target.value)}><option>Follow-up required</option><option>Recheck required</option></select></label>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
                      {[
                        { label: "In 3 Days", days: 3 },
                        { label: "In 7 Days (1 Wk)", days: 7 },
                        { label: "In 14 Days (2 Wks)", days: 14 },
                        { label: "In 1 Month (30 Days)", days: 30 },
                      ].map(preset => (
                        <button
                          key={preset.days}
                          type="button"
                          className={`btn sm ${f.followUpDays === String(preset.days) ? "primary" : "ghost"}`}
                          style={{ fontSize: "12px", padding: "4px 10px" }}
                          onClick={() => handleFollowUpDaysChange(preset.days)}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px" }}>
                      <div className="fld">
                        <label>Target Follow-up Date<i> *</i></label>
                        <input
                          type="date"
                          value={f.followUpDate}
                          min={TODAY}
                          onChange={e => set("followUpDate", e.target.value)}
                        />
                        {errs.followUpDate && <p className="err" role="alert">{errs.followUpDate}</p>}
                      </div>
                      <div className="fld">
                        <label>Follow-up Reason / Clinical Instructions</label>
                        <input
                          type="text"
                          maxLength={2000} value={f.followUpReason}
                          onChange={e => set("followUpReason", e.target.value)}
                          placeholder="e.g. Suture removal, wound check, ear cytology re-eval..."
                        />
                        {errs.followUpReason && <p className="err" role="alert">{errs.followUpReason}</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {errs.save && <p className="err" role="alert">{errs.save}</p>}
            <div className="row end" style={{ marginTop: "20px", gap: "10px" }}>
              <button type="button" className="btn ghost" onClick={onClose} disabled={loading}>Cancel</button>
              <button type="submit" className="btn gold" disabled={loading || !serviceCatalog.length || !!catalogError} style={{ fontWeight: 700 }}>
                {loading ? "Saving to EMR & Database..." : "Save SOAP Note & Complete Visit"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
