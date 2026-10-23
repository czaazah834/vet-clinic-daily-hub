import { useState } from "react";
import { I, M, Stats, Hero, TODAY, plus, moveAppt, petName, ownerName, ICON, Badge, dueState } from "../lib.jsx";
import SoapConsultationModal from "./SoapConsultationModal.jsx";
import ClinicCalendar from "./ClinicCalendar.jsx";

function Dash({ db, setDb, me, go, say }) {
  const [activeSoap, setActiveSoap] = useState(null); // { appt, pet }

  const vid = me.vetId || "v1";
  const queue = db.appts.filter(a => a.vetId === vid && a.date === TODAY && a.status !== "Cancelled").sort((a, b) => a.time.localeCompare(b.time));
  const waiting = queue.filter(a => a.status === "Checked-in");
  const inConsult = queue.filter(a => a.status === "In consultation");
  const completed = queue.filter(a => a.status === "Completed");
  const due = db.vacc.filter(v => v.nextDue && !v.done && v.nextDue <= plus(14));

  const startConsult = (a) => {
    const pet = db.pets.find(p => p.id === a.petId);
    if (!pet) return say("Patient record not found.");
    moveAppt(setDb, a.id, "In consultation", me);
    setActiveSoap({ appt: a, pet });
  };

  const openEmr = (petId) => {
    const pet = db.pets.find(p => p.id === petId);
    if (!pet) return;
    const a = queue.find(x => x.petId === petId) || null;
    setActiveSoap({ appt: a, pet });
  };

  return (
    <>
      <Hero
        title={`Clinical Desk · ${me.name}`}
        text={`You have ${waiting.length} checked-in patient(s) waiting in your queue today.`}
        emoji="🩺🐶"
      >
        <div className="row" style={{ flexWrap: "wrap", gap: "10px" }}>
          {waiting.length > 0 && (
            <button className="btn gold" onClick={() => startConsult(waiting[0])}>
              Start Next Consultation ({petName(db, waiting[0].petId)})
            </button>
          )}
          <button className="btn ghost" onClick={() => go("cal")}>
            View Schedule Calendar
          </button>
          <button className="btn ghost" onClick={() => go("pets")}>
            Search Patient EMR
          </button>
        </div>
      </Hero>

      <Stats
        items={[
          ["🩺", queue.length, "Total Patients Today"],
          ["⏳", waiting.length, "Waiting in Queue"],
          ["🔬", inConsult.length, "In Consultation"],
          ["✅", completed.length, "Completed Today"],
          ["💉", due.length, "Vaccines Due Soon"],
        ]}
      />

      {/* Real-time Clinical Queue */}
      <section className="card" style={{ marginTop: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px" }}>Today&apos;s Clinical Patient Queue</h3>
            <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
              Patients checked in by Front Desk appear here ready for examination and SOAP consultation notes.
            </p>
          </div>
          <span style={{ fontSize: "12.5px", background: "#f1f5f9", padding: "6px 10px", borderRadius: "8px", fontWeight: "600" }}>
            Doctor: {me.name}
          </span>
        </div>

        {queue.length ? (
          <div style={{ display: "grid", gap: "10px" }}>
            {queue.map(a => {
              const p = db.pets.find(x => x.id === a.petId) || {};
              const o = db.owners.find(x => x.id === p.ownerId) || {};
              const hasAllergy = p.allergies && p.allergies.length > 0;
              const iv = a.intakeVitals;

              return (
                <div
                  key={a.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 16px",
                    borderRadius: "12px",
                    border: iv?.triageLevel === "Emergency"
                      ? "2px solid #ef4444"
                      : a.status === "Checked-in"
                      ? "2px solid #93c5fd"
                      : "1px solid #e2e8f0",
                    background: iv?.triageLevel === "Emergency"
                      ? "#fff5f5"
                      : a.status === "Checked-in"
                      ? "#eff6ff"
                      : a.status === "In consultation"
                      ? "#fffbeb"
                      : "#fff",
                  }}
                >
                  <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                    <b style={{ color: "var(--navy)", fontSize: "16px", minWidth: "50px", marginTop: "4px" }}>{a.time}</b>
                    <span style={{ fontSize: "24px", marginTop: "2px" }}><I e={ICON[p.species] || "🐾"} size={24} /></span>
                    <div>
                      <div style={{ fontWeight: "700", fontSize: "15px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span>{p.name}</span>
                        <span style={{ fontWeight: "400", color: "#64748b", fontSize: "13px" }}>({p.breed || p.species} &bull; Owner: {o.name})</span>
                        {hasAllergy && (
                          <span style={{ fontSize: "11px", background: "#fef2f2", color: "#dc2626", padding: "2px 6px", borderRadius: "4px", fontWeight: "700" }}>
                            ⚠ ALLERGIC: {p.allergies.join(", ")}
                          </span>
                        )}
                        {iv?.triageLevel && iv.triageLevel !== "Routine" && (
                          <span style={{
                            fontSize: "11px",
                            background: iv.triageLevel === "Emergency" ? "#fee2e2" : "#fef3c7",
                            color: iv.triageLevel === "Emergency" ? "#991b1b" : "#92400e",
                            padding: "2px 7px",
                            borderRadius: "4px",
                            fontWeight: "700"
                          }}>
                            🚨 TRIAGE: {iv.triageLevel.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "12.5px", color: "#475569", marginTop: "2px" }}>
                        <b>Chief Complaint:</b> {a.reason}
                      </div>

                      {/* Automated Intake Vitals from Front Desk */}
                      {iv ? (
                        <div style={{ marginTop: "6px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", fontSize: "12px" }}>
                          {/* Temperature badge */}
                          <span style={{
                            padding: "3px 8px",
                            borderRadius: "6px",
                            fontWeight: 600,
                            background: iv.tempAnalysis?.status === "normal"
                              ? "#ecfdf5"
                              : iv.tempAnalysis?.status === "high-fever" || iv.tempAnalysis?.status === "hypothermia"
                              ? "#fee2e2"
                              : "#fffbeb",
                            color: iv.tempAnalysis?.status === "normal"
                              ? "#047857"
                              : iv.tempAnalysis?.status === "high-fever" || iv.tempAnalysis?.status === "hypothermia"
                              ? "#991b1b"
                              : "#b45309",
                            border: "1px solid rgba(0,0,0,0.06)"
                          }}>
                            🌡️ {iv.temp}°C &bull; {iv.tempAnalysis?.label || "Normal"}
                          </span>

                          {/* Weight badge */}
                          <span style={{
                            padding: "3px 8px",
                            borderRadius: "6px",
                            fontWeight: 600,
                            background: iv.weightAnalysis?.status === "ideal" ? "#ecfdf5" : "#fffbeb",
                            color: iv.weightAnalysis?.status === "ideal" ? "#047857" : "#b45309",
                            border: "1px solid rgba(0,0,0,0.06)"
                          }}>
                            ⚖️ {iv.weight} kg &bull; {iv.weightAnalysis?.label || "Normal"}
                            {iv.weightDelta && ` (${iv.weightDelta})`}
                          </span>

                          {iv.triageNotes && (
                            <span style={{ color: "#64748b", fontStyle: "italic" }}>
                              &ldquo;{iv.triageNotes}&rdquo;
                            </span>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: "11.5px", color: "#94a3b8", marginTop: "3px" }}>
                          <i>Awaiting front desk intake vitals</i>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <Badge v={a.status} />

                    {a.status === "Checked-in" && (
                      <button className="btn sm gold" onClick={() => startConsult(a)}>
                        Start Consultation
                      </button>
                    )}

                    {a.status === "In consultation" && (
                      <button className="btn sm gold" onClick={() => setActiveSoap({ appt: a, pet: p })}>
                        Resume SOAP Notes
                      </button>
                    )}

                    {a.status === "Completed" && (
                      <button className="btn sm ghost" onClick={() => openEmr(p.id)}>
                        View EMR
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty sm">No patients scheduled in your queue today.</div>
        )}
      </section>

      {/* Modal: Full EMR & SOAP Consultation Console */}
      {activeSoap && (
        <SoapConsultationModal
          appt={activeSoap.appt}
          pet={activeSoap.pet}
          db={db}
          setDb={setDb}
          me={me}
          onClose={() => setActiveSoap(null)}
          onSaved={(record) => {
            setActiveSoap(null);
            say(`SOAP Consultation saved for ${activeSoap.pet.name}! Visit completed.`);
          }}
        />
      )}
    </>
  );
}

export const vet = {
  portal: "Veterinarian Clinical Desk",
  Dash,
  menu: [
    { k: "home", l: "Clinical Queue", i: "🩺", dash: 1, sub: "Live patient queue, SOAP consultation notes and EMR records." },
    { k: "cal", l: "Doctor Schedule", i: "📅", Page: ClinicCalendar, sub: "Clinic appointment calendar and timetable." },
    M("pets", "Patient EMR", "🐾", "pets", "Digital medical records, breed history, weight, and allergies."),
    M("records", "SOAP Consultations", "📋", "records", "Record diagnoses, treatments, and prescriptions."),
    M("vacc", "Vaccination Station", "💉", "vacc", "Administer vaccines and track calculated booster dates."),
    M("owners", "Client Contacts", "👤", "owners", "Read-only access to pet owner contact information."),
    { k: "reports", l: "Clinical Reports", i: "📊", rep: 1, sub: "Filter and print clinic consultation summaries." },
  ],
};
