import { useSubmissionReview } from "../components/SubmissionReview.jsx";
import { useRef, useState } from "react";
import { UserCheck, X, ArrowRight } from "lucide-react";
import { today, nowHM } from "../booking.js";
import { addLog } from "../lib.jsx";
import { api } from "../api.js";
const sameOwner = (o, id) => !!id && (o.id === id || o.id === id.replace(/^o(\d+)/, "o_$1") || o.id?.replace(/^o_(\d+)/, "o$1") === id);

/* Walk-in for a patient who is already on file: creates today's appointment, then hands off to check-in (vitals). */
export default function ExistingPatientCheckInModal({ db, setDb, me, onClose, onCheckIn, say = () => {}, initialPetId = "" }) {
  const TODAY = today();
  const inFlight = useRef(false);
  const [saveError, setSaveError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedPetId, setSelectedPetId] = useState(initialPetId);
  const [reason, setReason] = useState("Walk-in consultation and routine exam");
  const doctors = (db.vets || []).map(v => [v.id, v.name]);
  const [vetId, setVetId] = useState(doctors[0]?.[0] || "");
  const [busy, setBusy] = useState(false);

  const term = search.trim().toLowerCase();
  const filteredPets = (db.pets || []).filter(p => {
    if (!term) return true;
    const owner = (db.owners || []).find(o => sameOwner(o, p.ownerId)) || {};
    return [p.name, p.species, p.breed, owner.name].some(x => (x || "").toLowerCase().includes(term)) || (owner.phone || "").includes(term);
  });
  const selectedPet = (db.pets || []).find(p => p.id === selectedPetId);
  const selectedOwner = selectedPet ? (db.owners || []).find(o => sameOwner(o, selectedPet.ownerId)) : null;

  // Do not allow the same patient to be queued twice on the same day.
  const activeVisits = (db.appts || []).filter(a => a.petId === selectedPetId && a.date === TODAY && !["Cancelled", "Completed", "No-show"].includes(a.status));
  const alreadyToday = activeVisits.length > 0;

  const review = useSubmissionReview([selectedPet,selectedOwner,vetId,reason,activeVisits,doctors]);

  const handleSubmit = async e => {
    e.preventDefault();
    if (inFlight.current) return;
    setSaveError("");
    if (!selectedPet || !selectedOwner) { setSaveError("Choose a patient with a saved owner record."); return; }
    if (alreadyToday) { setSaveError("Open today's existing visit below to continue intake."); return; }
    if (!doctors.some(([id]) => id === vetId)) { setSaveError("Choose an available veterinarian."); return; }
    if (reason.trim().length < 3 || reason.length > 300) { setSaveError("Enter a visit reason between 3 and 300 characters."); return; }
    if (!await review.ask({title:"Review walk-in arrival",confirmLabel:"Save arrival",description:"Confirm the patient and assigned veterinarian. You will record measured intake next before the patient joins the doctor queue.",fields:[
        ["Patient",selectedPet.name],
        ["Owner",selectedOwner.name],
        ["Veterinarian",doctors.find(([id])=>id===vetId)?.[1]],
        ["Date",today()],
        ["Reason",reason.trim()]]}))return;
    inFlight.current = true;
    setBusy(true);
    const payload = {
      petId: selectedPetId, vetId, date: today(), bookingKind: "walk-in",
      time: nowHM(),
      reason: reason.trim() || "Walk-in consultation",
      status: "Scheduled", billingStatus: "Unbilled", amount: 600,
      actorName: me?.name || "Assistant", actorRole: me?.role || "assistant",
    };
    let newAppt;
    try {
      const res = await api.post("/api/appointments", payload);
      if (res?.success !== true || !res?.appointment?.id || res.appointment.petId !== selectedPetId || res.appointment.vetId !== vetId || res.appointment.status !== "Scheduled") throw new Error("The server did not confirm this patient’s visit. Refresh clinic records before continuing.");
      newAppt = res.appointment;
    } catch (error) {
      inFlight.current = false;
      setBusy(false);
      setSaveError(error.message);
      return;
    }
    setDb(prev => ({
      ...prev,
      appts: [newAppt, ...(prev.appts || []).filter(a => a.id !== newAppt.id)],
      log: addLog(prev, me, `Registered walk-in for existing pet ${selectedPet.name} (owner ${selectedOwner?.name || "client"}).`),
    }));
    say(`${selectedPet.name} arrival saved. Record vitals to join the doctor queue.`);
    onClose();
    onCheckIn(newAppt);
  };

  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && !busy && onClose()} style={{ zIndex: 1050, display: "grid", placeItems: "center", padding: 16 }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="exw-title" style={{ width: "min(560px, 100%)", maxHeight: "90vh", overflowY: "auto" }}>
        <div className="sf-modal-hd">
          <h3 id="exw-title"><UserCheck size={20} aria-hidden="true" />Existing patient check-in</h3>
          <button type="button" className="sf-x" onClick={onClose} disabled={busy} aria-label="Close"><X size={18} aria-hidden="true" /></button>
        </div>

        <ol className="sf-steps" aria-label="Check-in steps">
          <li className="on">1. Choose patient</li><li>2. Record vitals</li><li>3. Doctor queue</li>
        </ol>

        <form onSubmit={handleSubmit}>
          {review.card}
          <div className="sf-field">
            <label htmlFor="exw-search">Search patient or owner</label>
            <input id="exw-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Pet name, breed, owner or mobile number" />
          </div>

          <div className="sf-field">
            <label htmlFor="exw-pet">Patient *</label>
            <select id="exw-pet" value={selectedPetId} onChange={e => { setSelectedPetId(e.target.value); setSaveError(""); }} disabled={busy} required>
              <option value="">{filteredPets.length ? "Choose a patient" : "No matching patients"}</option>
              {filteredPets.map(p => {
                const o = (db.owners || []).find(x => sameOwner(x, p.ownerId)) || {};
                return <option key={p.id} value={p.id}>{p.name} ({p.species}, {p.breed || "Breed not recorded"}) - {o.name || "Client"}{o.phone ? ` ${o.phone}` : ""}</option>;
              })}
            </select>
          </div>

          {selectedPet && (
            <div className="sf-note">
              <b>{selectedPet.name}</b> ({selectedPet.breed || selectedPet.species}{selectedPet.weight ? `, last weight ${selectedPet.weight} kg` : ""}). Owner: <b>{selectedOwner?.name || "Client"}</b> ({selectedOwner?.phone || "no phone"}).
              {selectedPet.allergies?.length > 0 && <> Allergies: <b>{selectedPet.allergies.join(", ")}</b>.</>}
            </div>
          )}
          {alreadyToday && <section className="sf-note" aria-label="Today's existing visits">
            <b>Today's existing visit{activeVisits.length > 1 ? "s" : ""}</b>
            <p>Continue with the saved visit and assigned veterinarian.</p>
            {activeVisits.map(visit => {
              const canIntake = ["Scheduled", "Confirmed", "Checked-in"].includes(visit.status);
              const vet = (db.vets || []).find(v => v.id === visit.vetId);
              return <div key={visit.id} style={{marginBottom:12}}>
                <div>{visit.time || "Time not recorded"} · {visit.status} · {vet?.name || "Veterinarian not found"}</div>
                <p style={{whiteSpace:"pre-wrap"}}>{visit.reason || "Visit reason not recorded"}</p>
                {canIntake ? <button type="button" className="btn gold sm" onClick={() => {
                  const current = (db.appts || []).find(a => a.id === visit.id);
                  if (!current || !["Scheduled", "Confirmed", "Checked-in"].includes(current.status)) return;
                  onClose(); onCheckIn(current);
                }}>{visit.status === "Checked-in" ? "Review saved intake" : "Record vitals for this visit"}</button>
                  : <p>{visit.status === "In consultation" ? "The veterinarian is already seeing this patient." : "Open the visit in the calendar to check its status."}</p>}
              </div>;
            })}
          </section>}

          {!alreadyToday && <>

          <div className="sf-field">
            <label htmlFor="exw-reason">Reason for visit *</label>
            <input id="exw-reason" type="text" required minLength={3} maxLength={300} disabled={busy} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Vaccination, cough, routine check-up" />
          </div>

          <div className="sf-field">
            <label htmlFor="exw-vet">Veterinarian *</label>
            <select id="exw-vet" required disabled={busy} value={vetId} onChange={e => setVetId(e.target.value)}>
              <option value="">Choose a veterinarian</option>
              {doctors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>

          </>}
          {saveError && <p className="err" role="alert">{saveError}</p>}
          <div className="row end" style={{flexWrap:"wrap"}}>
            <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
            {!alreadyToday && <button type="submit" className="btn gold" disabled={!selectedPet || !selectedOwner || !doctors.some(([id]) => id === vetId) || busy}>{busy ? "Saving arrival…" : "Review arrival"}<ArrowRight size={16} aria-hidden="true" /></button>}
          </div>
        </form>
      </div>
    </div>
  );
}

