import { VaccineEstimate } from "../components/VaccineBooking.jsx";
import { PaginatedList } from "../components/Pagination.jsx";
import { useState } from "react";
import { CalendarCheck, CalendarDays, PawPrint } from "lucide-react";
import { pendingVisitApprovals } from "../assistantWorkflow.js";
import { fmt12 } from "../booking.js";

export default function FrontDeskApprovals({ db, onReviewPet, onOpenCard, onCalendar, onConfirm, onReject, confirming, error }) {
  const [view, setView] = useState("visits");
  const visits = pendingVisitApprovals(db.appts);
  const pets = (db.petRequests || []).filter(r => r.status === "Pending");
  return <section className="card sf-approvals" aria-labelledby="approval-heading">
    <div className="sf-section-hd">
      <div><span className="sf-eyebrow">Reception inbox</span><h2 id="approval-heading">Pending Appointment Requests <span className="sf-pill">{visits.length}</span></h2><p>Review the patient and requested visit. Approval confirms the available slot and verifies the linked registration together.</p></div>
      <button className="btn ghost sm" onClick={onCalendar}><CalendarDays size={16} aria-hidden="true" />Open calendar</button>
    </div>
    <div className="sf-approval-tabs" aria-label="Approval categories">
      <button className="btn sm" aria-pressed={view === "visits"} onClick={() => setView("visits")}><CalendarCheck size={17} aria-hidden="true" />Visit requests ({visits.length})</button>
      <button className="btn sm" aria-pressed={view === "pets"} onClick={() => setView("pets")}><PawPrint size={17} aria-hidden="true" />Pet registrations ({pets.length})</button>
    </div>
    {error && <p className="err" role="alert">{error}</p>}
    <PaginatedList className="sf-approval-list" label="Clinic approvals" resetKey={view}>
      {view === "visits" ? visits.length ? visits.map(a => {
        const pet = db.pets.find(p => p.id === a.petId);
        const owner = db.owners.find(o => o.id === (pet?.ownerId || a.ownerId));
        const vet = db.vets.find(v => v.id === a.vetId);
        const registration = (db.petRequests || []).find(r => r.petId === a.petId && r.status !== "Approved");
        const patient = registration || pet;
        return <article className="sf-approval-item" key={a.id}>
          <div className="sf-approval-date"><CalendarDays size={18} aria-hidden="true" /><b>{a.date}</b><span>{a.time ? fmt12(a.time) : "Time not recorded"}</span></div>
          <div className="sf-body"><h3>{pet?.name || a.petName || "Patient"}</h3><p>{a.reason || a.service || "Visit request"}</p><VaccineEstimate appointment={a} compact /><p><b>Owner:</b> {owner?.name || a.ownerName || "Not recorded"} · {owner?.phone || owner?.email || "No contact on file"}</p><p><b>Veterinarian:</b> {vet?.name || "Not recorded"}</p>{a.notes && <p className="sf-approval-note">{a.notes}</p>}</div>
          <div className="sf-body">
            <p><b>Registration:</b> {registration?.status || pet?.registrationStatus || "Verified"}</p>
            <p>{patient?.species} · {patient?.speciesOther || patient?.breed || "Breed not recorded"} · {patient?.sex || "Sex not recorded"}</p>
            <details><summary>Pet registration details</summary>
              <p><b>Born:</b> {patient?.birth || "Not recorded"} · <b>{registration ? "Owner-reported weight:" : "Latest recorded weight:"}</b> {patient?.weight ?? "Not recorded"} kg</p>
              <p><b>Spayed/neutered:</b> {patient?.neutered || "Not recorded"} · <b>Color:</b> {patient?.color || "Not recorded"}</p>
              {patient?.dentalOcclusion && <p><b>Owner-reported dental status:</b> {patient.dentalOcclusion}</p>}
              {patient?.notes && <p><b>Owner notes:</b> {patient.notes}</p>}
              {patient?.photo && <img src={patient.photo} alt={`${patient.name} registration`} width="100" height="100" style={{objectFit:"cover"}} />}
            </details>
          </div>
          <div className="sf-approval-actions"><span className="sf-pill wa">Pending Approval</span><button className="btn sm" disabled={!!confirming[a.id] || registration?.status === "Declined"} onClick={() => onConfirm(a)}>{confirming[a.id] ? "Approving…" : registration ? "Approve appointment & registration" : "Approve visit"}</button>{registration?.status === "Declined" && <small>The owner must correct and resubmit the registration.</small>}<button className="btn danger sm" disabled={!!confirming[a.id]} onClick={() => onReject(a)}>Reject request</button><button className="btn ghost sm" onClick={() => onOpenCard(a.petId, a)}>View patient</button></div>
        </article>;
      }) : <div className="sf-approval-empty"><CalendarCheck size={26} aria-hidden="true" /><b>No visit requests awaiting approval</b><span>New bookings appear here before the clinic confirms them.</span></div>
      : pets.length ? pets.map(p => {
        const owner = db.owners.find(o => o.id === p.ownerId);
        return <article className="sf-approval-item" key={p.id}><span className="sf-species"><PawPrint size={24} aria-hidden="true" /></span><div className="sf-body"><h3>{p.name}</h3><p>{p.species} · {p.breed || "Breed not recorded"}</p><p>{owner?.name || "Owner"} · {owner?.phone || owner?.email || "No contact on file"}</p>{p.notes && <p>{p.notes}</p>}<small>Approval issues the pet’s digital card. Vaccination records and booster dates require veterinarian review.</small></div><button className="btn sm" onClick={() => onReviewPet(p)}>Review registration</button></article>;
      }) : <div className="sf-approval-empty"><PawPrint size={26} aria-hidden="true" /><b>No pet registrations awaiting approval</b><span>New owner submissions will appear here.</span></div>}
    </PaginatedList>
  </section>;
}
