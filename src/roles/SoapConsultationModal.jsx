import { useState } from "react";
import { TODAY, uid, INTERVAL, petName, ownerName, addLog, ICON } from "../lib.jsx";

export default function SoapConsultationModal({ appt, pet, db, setDb, me, onClose, onSaved }) {
  const [tab, setTab] = useState("soap"); // 'soap' | 'emr'
  const owner = db.owners.find(o => o.id === pet.ownerId) || {};
  const prevRecords = db.records.filter(r => r.petId === pet.id).sort((a, b) => b.date.localeCompare(a.date));
  const prevVaccs = db.vacc.filter(v => v.petId === pet.id).sort((a, b) => b.date.localeCompare(a.date));

  // SOAP fields
  const [f, setF] = useState({
    date: TODAY,
    symptoms: appt?.reason ? `Chief Complaint: ${appt.reason}` : "",
    objective: `Temp: 38.5°C, Weight: ${pet.weight || ""} kg. Heart rate and respiration normal.`,
    diagnosis: "",
    treatment: "",
    prescription: "",
    weight: pet.weight ? String(pet.weight) : "",
    // Vaccine administration
    giveVaccine: false,
    vaccine: "Anti-rabies",
    brand: "Defensor 3",
    batch: "LOT-" + new Date().getFullYear() + "-01",
    vaccineNotes: "Administered subcutaneously during consultation.",
  });

  const [errs, setErrs] = useState({});

  const set = (k, v) => {
    setF(p => ({ ...p, [k]: v }));
    if (errs[k]) setErrs(p => ({ ...p, [k]: "" }));
  };

  const getBoosterDate = (vaccineName) => {
    const days = INTERVAL[vaccineName] || 365;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const handleSubmit = (ev) => {
    ev.preventDefault();
    const e = {};
    if (!f.diagnosis.trim()) e.diagnosis = "Assessment / Diagnosis is required";
    if (!f.treatment.trim()) e.treatment = "Plan / Treatment is required";

    if (Object.keys(e).length) {
      setErrs(e);
      return;
    }

    const consultId = uid();
    const newRecord = {
      id: consultId,
      petId: pet.id,
      vetId: me.vetId || "v1",
      apptId: appt ? appt.id : null,
      date: f.date,
      symptoms: f.symptoms.trim(),
      objective: f.objective.trim(),
      diagnosis: f.diagnosis.trim(),
      treatment: f.treatment.trim(),
      prescription: f.prescription.trim(),
    };

    let newVacc = null;
    if (f.giveVaccine) {
      const boosterDue = getBoosterDate(f.vaccine);
      newVacc = {
        id: "v" + uid(),
        petId: pet.id,
        vaccine: f.vaccine,
        brand: f.brand.trim() || "Standard",
        batch: f.batch.trim() || "N/A",
        date: f.date,
        nextDue: boosterDue,
        notes: f.vaccineNotes.trim(),
      };
    }

    setDb(p => {
      // 1. Records
      const nextRecords = [newRecord, ...p.records];

      // 2. Vaccines
      let nextVacc = p.vacc;
      if (newVacc) {
        nextVacc = [
          newVacc,
          ...p.vacc.map(v => (v.petId === pet.id && v.vaccine === newVacc.vaccine ? { ...v, done: true } : v)),
        ];
      }

      // 3. Weight update if changed
      let nextPets = p.pets;
      if (f.weight && !isNaN(+f.weight) && +f.weight > 0) {
        const kg = +f.weight;
        nextPets = p.pets.map(x =>
          x.id === pet.id
            ? {
                ...x,
                weight: kg,
                weights: [...(x.weights || []), { date: f.date, kg, by: "clinic" }],
              }
            : x
        );
      }

      // 4. Mark appointment completed
      const nextAppts = p.appts.map(a =>
        appt && a.id === appt.id ? { ...a, status: "Completed", billingStatus: "Unbilled", amount: 650 } : a
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
          `Veterinarian ${me.name} saved SOAP consultation for ${pet.name}. Diagnosis: ${newRecord.diagnosis}.${
            newVacc ? ` Administered ${newVacc.vaccine} (${newVacc.brand}, batch ${newVacc.batch}), next booster due ${newVacc.nextDue}.` : ""
          } Visit completed.`
        ),
      };
    });

    onSaved && onSaved(newRecord);
  };

  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: "min(760px, 100%)", maxHeight: "94vh" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px", marginBottom: "14px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>{ICON[pet.species] || "🐾"}</span>
              <span>SOAP Consultation &amp; EMR: <b>{pet.name}</b></span>
            </h3>
            <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
              <b>Owner:</b> {owner.name} ({owner.phone}) &bull; <b>Breed:</b> {pet.breed || pet.species} &bull; <b>Sex:</b> {pet.sex}
            </p>
          </div>
          <button className="btn ghost sm" onClick={onClose}>✕</button>
        </div>

        {/* Allergy Alert Banner if any */}
        {(pet.allergies && pet.allergies.length > 0) ? (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "10px 14px", borderRadius: "10px", marginBottom: "14px", display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "20px" }}>⚠️</span>
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

              <div className="fld full" style={{ gridColumn: "1/-1" }}>
                <label>
                  <b>Prescription &amp; Home Care Medication</b>
                  <textarea
                    rows={2}
                    value={f.prescription}
                    onChange={e => set("prescription", e.target.value)}
                    placeholder="Medications, dosage, frequency, days supply, follow-up advice..."
                  />
                </label>
              </div>

              {/* Vaccine Administration During Consultation */}
              <div style={{ gridColumn: "1/-1", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "14px", borderRadius: "12px", marginTop: "4px" }}>
                <label style={{ display: "flex", gap: "10px", alignItems: "center", cursor: "pointer", fontWeight: "700", color: "#166534" }}>
                  <input
                    type="checkbox"
                    checked={f.giveVaccine}
                    onChange={e => set("giveVaccine", e.target.checked)}
                  />
                  <span>Administer Vaccine During Visit (Auto-calculates next booster due date)</span>
                </label>

                {f.giveVaccine && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "12px" }}>
                    <div className="fld">
                      <label>Vaccine Type<i> *</i></label>
                      <select value={f.vaccine} onChange={e => set("vaccine", e.target.value)}>
                        <option value="Anti-rabies">Anti-rabies (Annual)</option>
                        <option value="5-in-1">5-in-1 DHPP (Annual)</option>
                        <option value="Kennel cough">Kennel cough (Annual)</option>
                        <option value="Feline 4-in-1">Feline 4-in-1 (Annual)</option>
                        <option value="Deworming">Deworming (Quarterly - 90 Days)</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="fld">
                      <label>Calculated Booster Due Date</label>
                      <input
                        type="date"
                        value={getBoosterDate(f.vaccine)}
                        readOnly
                        style={{ background: "#f8fafc", fontWeight: "600", color: "#15803d" }}
                      />
                    </div>

                    <div className="fld">
                      <label>Vaccine Brand</label>
                      <input
                        type="text"
                        placeholder="e.g. Defensor 3, Vanguard"
                        value={f.brand}
                        onChange={e => set("brand", e.target.value)}
                      />
                    </div>

                    <div className="fld">
                      <label>Batch / Lot Number</label>
                      <input
                        type="text"
                        placeholder="e.g. LOT-2026-X8"
                        value={f.batch}
                        onChange={e => set("batch", e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="row end" style={{ marginTop: "20px", gap: "10px" }}>
              <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn gold">Save SOAP Note &amp; Complete Visit</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

