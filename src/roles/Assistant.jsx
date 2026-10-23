import { useState } from "react";
import { M, Stats, Hero, TODAY, plus, moveAppt, petName, ownerName, Badge, dueState, ICON } from "../lib.jsx";
import InClinicRegistration from "./InClinicRegistration.jsx";
import BillingModal from "./BillingModal.jsx";
import ClinicCalendar from "./ClinicCalendar.jsx";

function Dash({ db, setDb, me, go, say }) {
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [billingAppt, setBillingAppt] = useState(null);

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

                return (
                  <div className="li" key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: "10px", background: a.status === "Checked-in" ? "#f0fdf4" : a.status === "In consultation" ? "#eff6ff" : "#fff" }}>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <b style={{ color: "var(--navy)", minWidth: "48px" }}>{a.time}</b>
                      <div>
                        <b>{pet.name}</b> <span style={{ color: "#64748b", fontSize: "12.5px" }}>({owner.name})</span>
                        <small style={{ display: "block", color: "#475569" }}>{a.reason}</small>
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
                          title="Arrival Check-in: moves patient directly into Veterinarian's clinical queue"
                          onClick={() => {
                            moveAppt(setDb, a.id, "Checked-in", me);
                            say(`${pet.name} checked in! Moved to Veterinarian queue.`);
                          }}
                        >
                          Check in
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
