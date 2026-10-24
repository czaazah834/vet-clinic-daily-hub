import { useState } from "react";
import {
  Stethoscope,
  Clock,
  Activity,
  CheckCircle2,
  Syringe,
  Thermometer,
  Scale,
  AlertTriangle,
  User,
  Calendar,
  FileText,
  ChartColumn,
} from "lucide-react";
import { I, M, Stats, Hero, TODAY, plus, moveAppt, petName, ownerName, ICON, Badge, dueState } from "../lib.jsx";
import SoapConsultationModal from "./SoapConsultationModal.jsx";
import ClinicCalendar from "./ClinicCalendar.jsx";
import ClientsAndPatientsPage from "./ClientsAndPatientsPage.jsx";
import ConsultationsPage from "./ConsultationsPage.jsx";

function Dash({ db, setDb, me, go, say }) {
  const [activeSoap, setActiveSoap] = useState(null); // { appt, pet }
  const [scope, setScope] = useState("all"); // 'all' (all clinic checked-in) | 'my' (assigned to this doctor)

  const isMyVet = (a) => {
    if (!a.vetId || a.vetId === "all") return true;
    if (a.vetId === me.id || a.vetId === me.vetId) return true;
    if ((me.name?.toLowerCase().includes("ana") || me.id === "u_vet_1") && (a.vetId === "v1" || a.vetId === "u_vet_1")) return true;
    if ((me.name?.toLowerCase().includes("ben") || me.id === "u_vet_2") && (a.vetId === "v2" || a.vetId === "u_vet_2")) return true;
    return false;
  };

  const todayAppts = (db.appts || []).filter(a => a.date === TODAY && a.status !== "Cancelled");
  const queue = (scope === "all" ? todayAppts : todayAppts.filter(isMyVet)).sort((a, b) => a.time.localeCompare(b.time));
  const waiting = queue.filter(a => a.status === "Checked-in");
  const inConsult = queue.filter(a => a.status === "In consultation");
  const completed = queue.filter(a => a.status === "Completed");
  const due = (db.vacc || []).filter(v => v.nextDue && !v.done && v.nextDue <= plus(14));

  const allWaiting = todayAppts.filter(a => a.status === "Checked-in");
  const myWaiting = todayAppts.filter(a => isMyVet(a) && a.status === "Checked-in");

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
        icons={["stethoscope", "dog"]}
      >
        <div className="row" style={{ flexWrap: "wrap", gap: "10px" }}>
          {waiting.length > 0 && (
            <button className="btn gold" onClick={() => startConsult(waiting[0])}>
              Start Next Consultation ({petName(db, waiting[0].petId)})
            </button>
          )}
          <button
            className="btn"
            onClick={() => go("cal")}
            style={{
              background: "#ffffff",
              color: "#1e3a8a",
              border: "1.5px solid #ffffff",
              fontWeight: 700,
              boxShadow: "0 2px 4px rgba(0,0,0,0.08)"
            }}
          >
            View Schedule Calendar
          </button>
          <button
            className="btn"
            onClick={() => go("pets")}
            style={{
              background: "#ffffff",
              color: "#1e3a8a",
              border: "1.5px solid #ffffff",
              fontWeight: 700,
              boxShadow: "0 2px 4px rgba(0,0,0,0.08)"
            }}
          >
            Search Patient EMR
          </button>
        </div>
      </Hero>

      <Stats
        items={[
          ["stethoscope", queue.length, "Total Patients Today"],
          ["clock", waiting.length, "Waiting in Queue"],
          ["file", inConsult.length, "In Consultation"],
          ["check", completed.length, "Completed Today"],
          ["syringe", due.length, "Vaccines Due Soon"],
        ]}
      />

      {/* Real-time Clinical Queue */}
      <section className="card" style={{ marginTop: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px" }}>Today&apos;s Clinical Patient Queue</h3>
            <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
              Patients checked in by Front Desk appear here live for clinical examination and SOAP consultation notes.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ display: "inline-flex", background: "#f1f5f9", padding: "3px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <button
                type="button"
                onClick={() => setScope("all")}
                style={{
                  padding: "5px 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                  background: scope === "all" ? "var(--navy)" : "transparent",
                  color: scope === "all" ? "#fff" : "#475569",
                  transition: "all 0.15s ease",
                }}
              >
                All Clinic Waiting ({allWaiting.length})
              </button>
              <button
                type="button"
                onClick={() => setScope("my")}
                style={{
                  padding: "5px 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                  background: scope === "my" ? "var(--navy)" : "transparent",
                  color: scope === "my" ? "#fff" : "#475569",
                  transition: "all 0.15s ease",
                }}
              >
                My Assigned ({myWaiting.length})
              </button>
            </div>
            <span style={{ fontSize: "12px", background: "#e0f2fe", color: "#0369a1", padding: "6px 10px", borderRadius: "8px", fontWeight: "600" }}>
              Dr. {me.name}
            </span>
          </div>
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
                    <span style={{ fontSize: "24px", marginTop: "2px" }}><I e={ICON[p.species] || "paw"} size={24} /></span>
                    <div>
                      <div style={{ fontWeight: "700", fontSize: "15px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span>{p.name}</span>
                        <span style={{ fontWeight: "400", color: "#64748b", fontSize: "13px" }}>({p.breed || p.species} &bull; Owner: {o.name})</span>
                        {hasAllergy && (
                          <span style={{ fontSize: "11px", background: "#fef2f2", color: "#dc2626", padding: "2px 6px", borderRadius: "4px", fontWeight: "700" }}>
                            ALLERGIC: {p.allergies.join(", ")}
                          </span>
                        )}
                        {iv?.triageLevel && iv.triageLevel !== "Routine" && (
                          <span style={{
                            fontSize: "11px",
                            background: iv.triageLevel === "Emergency" ? "#fee2e2" : "#fef3c7",
                            color: iv.triageLevel === "Emergency" ? "#991b1b" : "#92400e",
                            padding: "2px 7px",
                            borderRadius: "4px",
                            fontWeight: "700",
                            display: "flex",
                            alignItems: "center",
                            gap: "3px"
                          }}>
                            <AlertTriangle size={12} /> TRIAGE: {iv.triageLevel.toUpperCase()}
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
                            border: "1px solid rgba(0,0,0,0.06)",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px"
                          }}>
                            <Thermometer size={12} /> {iv.temp}°C &bull; {iv.tempAnalysis?.label || "Normal"}
                          </span>

                          {/* Weight badge */}
                          <span style={{
                            padding: "3px 8px",
                            borderRadius: "6px",
                            fontWeight: 600,
                            background: iv.weightAnalysis?.status === "ideal" ? "#ecfdf5" : "#fffbeb",
                            color: iv.weightAnalysis?.status === "ideal" ? "#047857" : "#b45309",
                            border: "1px solid rgba(0,0,0,0.06)",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px"
                          }}>
                            <Scale size={12} /> {iv.weight} kg &bull; {iv.weightAnalysis?.label || "Normal"}
                            {iv.weightAnalysis?.trend && ` (${iv.weightAnalysis.trend})`}
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
    { k: "home", l: "Clinical Queue", i: "stethoscope", dash: 1, sub: "Live patient queue, SOAP consultation notes and EMR records." },
    { k: "cal", l: "Doctor Schedule", i: "calendar", Page: ClinicCalendar, sub: "Clinic appointment calendar and timetable." },
    { k: "pets", l: "Patient EMR & Masterlist", i: "paw", Page: ClientsAndPatientsPage, sub: "Digital medical records, patient profiles, and official vaccination cards." },
    { k: "records", l: "SOAP Consultations", i: "file", Page: ConsultationsPage, sub: "Certified SOAP consultation notes, clinical diagnoses, and prescriptions." },
    M("vacc", "Vaccination Station", "syringe", "vacc", "Administer vaccines and track calculated booster dates."),
    { k: "owners", hide: true, Page: ClientsAndPatientsPage },
    { k: "reports", l: "Clinical Reports", i: "chart", rep: 1, sub: "Filter and print clinic consultation summaries." },
  ],
};
