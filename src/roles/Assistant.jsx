import { useState } from "react";
import { M, Stats, Hero, TODAY, plus, moveAppt, petName, ownerName, Badge, dueState, ICON } from "../lib.jsx";
import InClinicRegistration from "./InClinicRegistration.jsx";
import BillingModal from "./BillingModal.jsx";
import ClinicCalendar from "./ClinicCalendar.jsx";
import CheckInModal from "./CheckInModal.jsx";

function Dash({ db, setDb, me, go, say }) {
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [billingAppt, setBillingAppt] = useState(null);
  const [checkInAppt, setCheckInAppt] = useState(null);

  const q = db.appts.filter(a => a.date === TODAY && a.status !== "Cancelled").sort((a, b) => a.time.localeCompare(b.time));
  const waiting = q.filter(a => a.status === "Checked-in");
  const inConsult = q.filter(a => a.status === "In consultation");
  const completed = q.filter(a => a.status === "Completed");
  const calls = db.vacc.filter(v => v.nextDue && !v.done && v.nextDue <= plus(14));

  return (
    <>
      <Hero
        title="Front Desk &amp; Clinic Operations"
        text="Register walk-in owners and patients, manage arrival check-ins, oversee appointments and handle billing."
        emoji="🛎️🐱"
      >
        <div className="row" style={{ flexWrap: "wrap", gap: "10px" }}>
          <button className="btn gold" onClick={() => setShowWalkIn(true)}>
            + Register Walk-in (Owner &amp; Pet)
          </button>
          <button className="btn" onClick={() => go("appts")}>
            + Book Appointment
          </button>
          <button className="btn ghost" onClick={() => go("cal")}>
            Interactive Calendar
          </button>
        </div>
      </Hero>

      <Stats
        items={[
          ["📅", q.length, "Total Visits Today"],
          ["🛎️", waiting.length, "Checked-in (In Queue)"],
          ["🩺", inConsult.length, "In Consultation"],
          ["✅", completed.length, "Completed Visits"],
          ["📞", calls.length, "Vaccine Reminders Due"],
        ]}
      />

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
                const owner = db.owners.find(o => o.id === pet.ownerId) || {};
                const isPaid = a.billingStatus === "Paid";
                const iv = a.intakeVitals;

                return (
                  <div className="li" key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", border: "1px solid #e2e8f0", borderRadius: "10px", background: a.status === "Checked-in" ? "#f0fdf4" : a.status === "In consultation" ? "#eff6ff" : "#fff" }}>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <b style={{ color: "var(--navy)", minWidth: "48px" }}>{a.time}</b>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                          <b>{pet.name}</b> <span style={{ color: "#64748b", fontSize: "12.5px" }}>({owner.name})</span>
                          {iv?.triageLevel && iv.triageLevel !== "Routine" && (
                            <span style={{
                              background: iv.triageLevel === "Emergency" ? "#fee2e2" : "#fef3c7",
                              color: iv.triageLevel === "Emergency" ? "#991b1b" : "#92400e",
                              fontWeight: 700,
                              fontSize: "11px",
                              padding: "2px 6px",
                              borderRadius: "4px"
                            }}>
                              🚨 {iv.triageLevel}
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
                              border: "1px solid rgba(0,0,0,0.06)"
                            }}>
                              🌡️ {iv.temp}°C · {iv.tempAnalysis?.label || "Normal"}
                            </span>
                            <span style={{
                              background: iv.weightAnalysis?.status === "ideal" ? "#ecfdf5" : "#fffbeb",
                              color: iv.weightAnalysis?.status === "ideal" ? "#047857" : "#b45309",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontWeight: 600,
                              border: "1px solid rgba(0,0,0,0.06)"
                            }}>
                              ⚖️ {iv.weight} kg · {iv.weightAnalysis?.label || "Normal"}
                            </span>
                            {iv.weightDelta && (
                              <span style={{ background: "#f8fafc", color: "#475569", padding: "2px 6px", borderRadius: "4px" }}>
                                {iv.weightDelta}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <Badge v={a.status} />

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
                        >
                          {isPaid ? "Receipt (Paid)" : "Bill / Checkout"}
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
                const o = db.owners.find(x => x.id === p.ownerId) || {};
                return (
                  <div className="li" key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                    <div>
                      <b>{p.name}</b> <small style={{ color: "#64748b" }}>({o.name})</small>
                      <small style={{ display: "block", color: "#475569" }}>
                        {v.vaccine} &bull; Due: <b>{v.nextDue}</b> &bull; Call: <b>{o.phone || "No phone"}</b>
                      </small>
                    </div>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <Badge v={dueState(v.nextDue)} />
                      <button
                        className="btn ghost sm"
                        onClick={() => say(`Logged reminder for ${o.name} (${p.name})`)}
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
    </>
  );
}

export const assistant = {
  portal: "Front Desk & Operations",
  Dash,
  menu: [
    { k: "home", l: "Front Desk", i: "🛎️", dash: 1, sub: "Today’s arrival queue, walk-in registration, and reminders." },
    { k: "cal", l: "Clinic Calendar", i: "📅", Page: ClinicCalendar, sub: "Interactive appointment scheduling and slot management." },
    M("owners", "Client Masterlist", "👤", "owners", "Registered pet owners and primary contact details."),
    M("pets", "Patient Masterlist", "🐾", "pets", "All animal patients and profiles."),
    M("appts", "Appointments", "🗓️", "appts", "Review, schedule, confirm, and update clinic appointments."),
    M("vacc", "Vaccination Hub", "💉", "vacc", "Vaccination compliance and reminder schedules."),
    M("records", "Consultations", "📋", "records", "Read-only view of veterinary consultation notes."),
  ],
};
