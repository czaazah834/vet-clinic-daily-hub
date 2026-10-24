import ExistingPatientCheckInModal from "./ExistingPatientCheckInModal.jsx";
import { assistantQueue, dailyCollections, pendingCheckout, money } from "../assistantWorkflow.js";
import CareFollowUps from "./CareFollowUps.jsx";
import CheckoutInbox from "./CheckoutInbox.jsx";
import ReminderStatus from "./ReminderStatus.jsx";
import { currentVaccinationDue, vaccinationAppointment, vaccinationBooking, vaccinationStatus } from "../ownerVaccination.js";
import { today, plus } from "../booking.js";
import { setPrefill } from "./owner/ui.jsx";
import { useRef, useState } from "react";
import {
  CalendarDays, AlertTriangle, PawPrint, ConciergeBell, Thermometer, Scale, UserCheck, Receipt, ArrowRight, X, Phone, Syringe,
} from "lucide-react";
import { Stats, Hero, moveAppt, Badge, ICON, I } from "../lib.jsx";
import InClinicRegistration from "./InClinicRegistration.jsx";
import BillingModal from "./BillingModal.jsx";
import ClinicCalendar from "./ClinicCalendar.jsx";
import CheckInModal from "./CheckInModal.jsx";
import PetApprovalModal from "./PetApprovalModal.jsx";
import PetRequestsPage from "./PetRequestsPage.jsx";
import PetCardModal from "./PetCardModal.jsx";
import ClientsAndPatientsPage from "./ClientsAndPatientsPage.jsx";
import DailySalesPage from "./DailySalesPage.jsx";
import ConsultationsPage from "./ConsultationsPage.jsx";
import LogCallModal from "./LogCallModal.jsx";

// Owner ids can be "o1" or "o_1" depending on where the record came from.
const sameOwner = (o, id) => !!id && (o.id === id || o.id === id.replace(/^o(\d+)/, "o_$1") || o.id?.replace(/^o_(\d+)/, "o$1") === id);
const tempTone = s => (s === "normal" ? "" : s === "high_fever" || s === "hypothermia" ? "er" : "wa");

function Dash({ db, setDb, me, go, say }) {
  const TODAY = today();
  const confirmingRef = useRef(new Set());
  const [confirming, setConfirming] = useState({});
  const [actionError, setActionError] = useState("");
  const [queueStage, setQueueStage] = useState("waiting");
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [showExistingWalkIn, setShowExistingWalkIn] = useState(false);
  const [billingAppt, setBillingAppt] = useState(null);
  const [checkInAppt, setCheckInAppt] = useState(null);
  const [reviewReq, setReviewReq] = useState(null);
  const [cardPetId, setCardPetId] = useState(null);
  const [cardAppt, setCardAppt] = useState(null);
  const [logCallTarget, setLogCallTarget] = useState(null);

  const pendingReqs = (db.petRequests || []).filter(r => r.status === "Pending");
  const queue = assistantQueue(db.appts, TODAY);
  const q = queue[queueStage];
  const waiting = queue.waiting, inConsult = queue.consultation;
  const calls = currentVaccinationDue(db.vacc).filter(v => v.nextDue <= plus(30));
  const collections = dailyCollections(db.appts, TODAY);
  const todayPaid = collections.paid, todayRevenue = collections.total;
  const unbilledCompleted = pendingCheckout(db.appts, TODAY).visits;

  const openCard = (petId, appt = null) => { setCardPetId(petId); setCardAppt(appt); };
  const closeCard = () => { setCardPetId(null); setCardAppt(null); };

  return (
    <>
      {actionError && <p className="err" role="alert">{actionError}</p>}
      <CareFollowUps db={db} go={go}  />
      <Hero
        title="Front Desk and Clinic Operations"
        text="Register walk-in owners and patients, check patients in, manage appointments and take payments."
        icons={["bell", "cat"]}
      >
        <div className="sf-actions">
          <button className="btn gold" onClick={() => setShowWalkIn(true)}><ConciergeBell size={16} aria-hidden="true" />Register new walk-in</button>
          <button className="btn" onClick={() => setShowExistingWalkIn(true)} title="Quick check-in for patients who are already registered"><UserCheck size={16} aria-hidden="true" />Existing patient check-in</button>
          <button className="btn" onClick={() => go("cal")}><CalendarDays size={16} aria-hidden="true" />Appointments and calendar</button>
          {pendingReqs.length > 0 && (
            <button className="btn gold" onClick={() => go("pet-requests")}><PawPrint size={16} aria-hidden="true" />Review pet requests ({pendingReqs.length})</button>
          )}
        </div>
      </Hero>

      <Stats
        items={[
          ["calendar", queue.visits.length, "Total visits today"],
          ["receipt", money(todayRevenue), `Today's collections (${todayPaid.length} paid)`],
          ["bell", waiting.length, "Checked in (queue)"],
          ["stethoscope", inConsult.length, "In consultation"],
          ["phone", calls.length, "Vaccine reminders due"],
        ]}
      />

      <CheckoutInbox me={me} blocked={Boolean(billingAppt || showWalkIn || showExistingWalkIn || checkInAppt || reviewReq || cardPetId || logCallTarget)} onOpen={task => {
        const visit=db.appts.find(a=>a.id===task.appointmentId);
        if(!visit){say("The visit is loading. Please retry in a moment.");return false;}
        setBillingAppt(visit);
        return true;
      }} />

      <div className="sf-banner">
        <div className="sf-banner-main">
          <span className="sf-banner-ic"><Receipt size={22} aria-hidden="true" /></span>
          <div>
            <div className="sf-title-row">
              <b>Today&rsquo;s collections: {money(todayRevenue)}</b>
              <span className="sf-pill ok">{todayPaid.length} settled</span>
              {unbilledCompleted.length > 0 && <span className="sf-pill wa">{unbilledCompleted.length} ready for checkout</span>}
            </div>
            <small>Collections by payment date in Philippine time. {collections.undated.length > 0 && <>{collections.undated.length} undated payment(s) excluded; review in daily sales. </>}{collections.missingAmounts > 0 && <>{collections.missingAmounts} payment(s) missing an amount; excluded from totals.</>}</small>
          </div>
        </div>
        <button className="btn ghost sm" onClick={() => go("sales")}>Open daily sales<ArrowRight size={15} aria-hidden="true" /></button>
      </div>

      {pendingReqs.length > 0 && (
        <section className="card sf-pending">
          <div className="sf-section-hd">
            <div>
              <h3>Pending online pet registrations ({pendingReqs.length})</h3>
              <p>Approving a request issues the digital vaccination card and calculates the booster schedule.</p>
            </div>
            <button className="btn gold sm" onClick={() => setReviewReq(pendingReqs[0])}>Review first request</button>
          </div>
          <div className="sf-grid">
            {pendingReqs.map(r => {
              const o = db.owners.find(x => x.id === r.ownerId) || {};
              return (
                <div key={r.id} className="sf-pending-row">
                  <div className="sf-row-main">
                    <span className="sf-species"><I e={r.species || "paw"} size={22} /></span>
                    <div className="sf-body">
                      <div className="sf-name">
                        <span>{r.name}</span>
                        <span className="meta">{r.species}, {r.breed || "Mixed"}, {r.sex}{r.weight ? `, ${r.weight} kg` : ""}</span>
                      </div>
                      <div className="sf-sub">
                        Owner: <b>{o.name || "Owner"}</b> ({o.phone || o.email || "no contact"}), requested {r.requestedAt || TODAY}
                        {r.notes ? `, note: "${r.notes}"` : ""}
                      </div>
                    </div>
                  </div>
                  <button className="btn sm gold" onClick={() => setReviewReq(r)} title="Review details and issue the vaccination card">Review and issue card</button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="two" style={{ marginTop: 16 }}>
        <section className="card">
          <div className="sf-section-hd">
            <h3>Patient flow ({q.length})</h3>
            <span className="sf-sub">{TODAY}</span>
          </div>

          <div className="row" style={{flexWrap:"wrap",gap:6,marginBottom:12}} aria-label="Patient flow stages">
            {[["arrivals","Expected arrivals"],["waiting","Waiting for vet"],["consultation","In consultation"],["completed","Completed"],["missed","Missed"]].map(([key,label]) => <button key={key} className={`btn sm ${queueStage === key ? "gold" : "ghost"}`} aria-pressed={queueStage === key} onClick={() => setQueueStage(key)}>{label} ({queue[key].length})</button>)}
          </div>
          {queueStage === "waiting" && <p className="sf-sub">Emergency and priority patients appear first. The veterinarian decides the clinical response.</p>}
          {q.length ? (
            <div className="sf-grid">
              {q.map(a => {
                const pet = db.pets.find(p => p.id === a.petId) || {};
                const owner = db.owners.find(o => o.id === a.ownerId || sameOwner(o, pet.ownerId)) || {};
                const isPaid = a.billingStatus === "Paid";
                const iv = a.intakeVitals;
                const rowCls = iv?.triageLevel === "Emergency" ? "is-emergency" : a.status === "Checked-in" ? "is-wait" : a.status === "In consultation" ? "is-live" : "";
                return (
                  <div className={`sf-row ${rowCls}`} key={a.id}>
                    <div className="sf-row-main">
                      <span className="sf-time">{a.date !== TODAY && <small>{a.date}<br /></small>}{a.time}</span>
                      <div className="sf-body">
                        <div className="sf-name">
                          <button type="button" className="sf-link" onClick={() => openCard(pet.id || a.petId, a)} title="Open the digital vaccination card and manage this visit">{pet.name || a.petName || "Patient"}</button>
                          <span className="meta">
                            {pet.species ? `${pet.species}${pet.breed ? ` (${pet.breed})` : ""}` : ""}
                            {owner.name ? `, owner ${owner.name}` : a.ownerName ? `, owner ${a.ownerName}` : ""}
                          </span>
                          {iv?.triageLevel && iv.triageLevel !== "Routine" && (
                            <span className={`sf-pill ${iv.triageLevel === "Emergency" ? "er" : "wa"}`}><AlertTriangle size={12} aria-hidden="true" />{iv.triageLevel}</span>
                          )}
                        </div>
                        <div className="sf-reason">{a.reason}</div>
                        {iv && (
                          <div className="sf-chips">
                            <span className={`sf-chip ${tempTone(iv.tempAnalysis?.status)}`}><Thermometer size={12} aria-hidden="true" />{iv.temp}&deg;C, {iv.tempAnalysis?.label || "Assessment not recorded"}</span>
                            <span className={`sf-chip ${iv.weightAnalysis?.status === "ideal" ? "" : "wa"}`}><Scale size={12} aria-hidden="true" />{iv.weight} kg, {iv.weightAnalysis?.label || "Assessment not recorded"}</span>
                            {iv.weightAnalysis?.trend && <span className="sf-chip mu">{iv.weightAnalysis.trend}</span>}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="sf-row-act">
                      <Badge v={a.status} />
                      <button className="btn sm ghost" onClick={() => openCard(pet.id || a.petId, a)}>Digital card</button>
                      {a.status === "Scheduled" && (
                        <button className="btn sm" disabled={!!confirming[a.id]} onClick={async () => {
                          if (confirmingRef.current.has(a.id)) return;
                          confirmingRef.current.add(a.id);
                          setActionError(""); setConfirming(p => ({...p,[a.id]:true}));
                          const saved = await moveAppt(setDb, a.id, "Confirmed", me, setActionError, a);
                          confirmingRef.current.delete(a.id);
                          setConfirming(p => ({...p,[a.id]:false}));
                          if (saved) say("Appointment confirmed.");
                        }}>{confirming[a.id] ? "Confirming…" : "Confirm"}</button>
                      )}
                      {["Scheduled", "Confirmed"].includes(a.status) && (
                        <button className="btn sm gold" title="Arrival check-in and vitals intake" onClick={() => setCheckInAppt(a)}>Check in</button>
                      )}
                      {a.status === "Checked-in" && (
                        <button className="btn sm ghost" title="Review or adjust intake vitals" onClick={() => setCheckInAppt(a)}>Edit vitals</button>
                      )}
                      {a.status === "Completed" && (
                        <button className={`btn sm ${isPaid ? "ghost" : "gold"}`} onClick={() => setBillingAppt(a)} title="Create the invoice and settle the bill">
                          {isPaid ? "View receipt" : "Bill and check out"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty sm">No patients in this stage today.</div>
          )}
        </section>

        <ReminderStatus />
        <section className="card">
          <div className="sf-section-hd">
            <h3>Vaccine reminders ({calls.length})</h3>
            <span className="sf-sub">Due within 30 days</span>
          </div>

          {calls.length ? (
            <div className="sf-grid">
              {calls.map(v => {
                const p = db.pets.find(x => x.id === v.petId) || {};
                const o = db.owners.find(x => sameOwner(x, p.ownerId)) || {};
                const hasAppt = vaccinationAppointment(v, db.appts || []);
                return (
                  <div className="sf-row" key={v.id}>
                    <div className="sf-body">
                      <div className="sf-name">
                        <button type="button" className="sf-link" onClick={() => openCard(p.id || v.petId)} title="Open the digital vaccination card">{p.name || "Patient"}</button>
                        <span className="meta">{p.species || ""}{o.name ? ` (${o.name})` : ""}</span>
                      </div>
                      <div className="sf-sub">
                        <Syringe size={12} aria-hidden="true" style={{ verticalAlign: "-1px" }} /> {v.vaccine}, due <b>{v.nextDue}</b>
                        {hasAppt && <span style={{ marginLeft: 8, color: "#15803d", fontWeight: 700 }}>✓ Appt: {hasAppt.date} {hasAppt.time || ""}</span>}
                      </div>
                      <div className="sf-sub"><Phone size={12} aria-hidden="true" style={{ verticalAlign: "-1px" }} /> {o.phone || "No phone on file"}</div>
                    </div>
                    <div className="sf-row-act">
                      <Badge v={hasAppt ? "Scheduled" : vaccinationStatus(v, calls)} />
                      <button className="btn sm ghost" onClick={() => openCard(p.id || v.petId)}>Card</button>
                      {hasAppt ? (
                        <button className="btn sm ghost" style={{ color: "#15803d", borderColor: "#86efac", background: "#f0fdf4" }} onClick={() => go("cal")} title="View scheduled appointment in calendar">
                          ✓ Scheduled
                        </button>
                      ) : (
                        <button className="btn sm gold" title="Book the booster visit in the clinic calendar" onClick={() => { setPrefill(vaccinationBooking(v)); go("cal"); say(`Booking booster for ${p.name || "patient"} (${v.vaccine}).`); }}>Book booster</button>
                      )}
                      <button className="btn ghost sm" onClick={() => setLogCallTarget({ v, p, o })} title="Record a call outcome and review saved call history">Log call</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty sm">No certified booster recalls due within 30 days.</div>
          )}
        </section>
      </div>

      {showWalkIn && (
        <InClinicRegistration
          db={db} setDb={setDb} me={me}
          onClose={() => setShowWalkIn(false)}
          onRegistered={(pet, owner, appointment) => { setShowWalkIn(false); say(`Walk-in registered: ${owner.name} and ${pet.name}. Record vitals to complete check-in.`); if (appointment) setCheckInAppt(appointment); }}
        />
      )}

      {billingAppt && (
        <BillingModal
          appt={billingAppt} db={db} setDb={setDb} me={me}
          onClose={() => setBillingAppt(null)}
          onPaid={amt => say(`Payment of ₱${amt} recorded.`)}
        />
      )}

      {checkInAppt && (
        <CheckInModal
          appt={checkInAppt} db={db} setDb={setDb} me={me}
          onClose={() => setCheckInAppt(null)}
          onCheckedIn={() => { setCheckInAppt(null); say("Patient checked in and moved to the doctor queue."); }}
        />
      )}

      {reviewReq && (
        <PetApprovalModal
          request={reviewReq} db={db} setDb={setDb} me={me}
          onClose={() => setReviewReq(null)}
          onProcessed={(action, newPet, cardId) => {
            setReviewReq(null);
            say(action === "approved" ? `Pet approved. Digital vaccination card #${cardId} created.` : "Pet registration request declined.");
          }}
        />
      )}

      {cardPetId && (
        <PetCardModal
          petId={cardPetId} appt={cardAppt} db={db} setDb={setDb} me={me}
          onClose={closeCard}
          onBook={() => { closeCard(); go("cal"); }}
          onCheckIn={a => { closeCard(); setCheckInAppt(a); }}
          onBill={a => { closeCard(); setBillingAppt(a); }}
        />
      )}

      {showExistingWalkIn && (
        <ExistingPatientCheckInModal
          db={db} setDb={setDb} me={me} say={say}
          onClose={() => setShowExistingWalkIn(false)}
          onCheckIn={appt => { setShowExistingWalkIn(false); setCheckInAppt(appt); }}
        />
      )}

      {logCallTarget && (
        <LogCallModal
          target={logCallTarget}
          onClose={() => setLogCallTarget(null)}
          onLogged={() => setLogCallTarget(null)}
          me={me}
          db={db}
          setDb={setDb}
          say={say}
        />
      )}
    </>
  );
}

export const assistant = {
  portal: "Front Desk & Operations",
  Dash,
  menu: [
    { k: "home", l: "Front Desk", i: "bell", dash: 1, sub: "Today’s arrival queue, walk-in registration, and reminders." },
    { k: "sales", l: "Daily Sales & Billing", i: "receipt", Page: DailySalesPage, sub: "Daily collections register, cashier receipts, and sales breakdown." },
    { k: "pet-requests", l: "Online Pet Requests", i: "paw", Page: PetRequestsPage, sub: "Review and approve online pet registrations with automated vaccination cards." },
    { k: "cal", l: "Appointments & Calendar", i: "calendar", Page: ClinicCalendar, sub: "Unified calendar schedules, slot booking, and appointments management." },
    { k: "clients-patients", l: "Clients & Patients Masterlist", i: "users", Page: ClientsAndPatientsPage, sub: "Unified masterlist of pet owners, animal patient profiles, and official vaccination cards." },
    { k: "records", l: "Consultations & EMR", i: "file", Page: ConsultationsPage, sub: "Certified veterinary consultation notes, EMR, and prescription handoff." },
    { k: "pets", hide: true, Page: ClientsAndPatientsPage },
    { k: "owners", hide: true, Page: ClientsAndPatientsPage },
  ],
};
