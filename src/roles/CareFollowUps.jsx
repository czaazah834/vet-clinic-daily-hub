import { ownerFollowUp, ownerFollowUpBooking } from "../ownerCare.js";
import { TODAY, petName } from "../lib.jsx";
import { followUpVisit } from "../clinicalWorkflow.js";
import { setPrefill } from "./owner/ui.jsx";
export default function CareFollowUps({db, go, owner = false}) {
  const records = db.records.filter(r => r.followUpDate && r.careStatus !== 'Routine care');
  if (!records.length) return null;
  return <section className="card"><h3>Follow-up care</h3>{records.map(r => {
    const plan = owner ? ownerFollowUp(r, db.appts) : null;
    const visit = owner ? plan.visit : followUpVisit(r, db.appts);
    const completed = visit?.status === 'Completed';
    const booked = visit && !['Cancelled','No-show','Completed'].includes(visit.status);
    return <div key={r.id} style={{padding:12}}><b>{petName(db,r.petId)} · {r.careStatus}</b>
      <p>Target: {r.followUpDate}{(owner ? plan.overdue : !completed && r.followUpDate < TODAY) ? ' · Overdue' : ''}</p><p>{r.followUpReason}</p>
      <p>{completed ? `Completed · ${visit.date}` : booked ? `Booked · ${visit.date} · ${visit.status}` : `Needs booking${visit ? ` · Previous visit ${visit.status.toLowerCase()}` : ''}`}</p>
      {!completed && !booked && <button className="btn sm" onClick={() => { setPrefill(owner ? ownerFollowUpBooking(r) : {petId:r.petId,followUpId:r.id,reason:'Consultation',date:r.followUpDate >= TODAY ? r.followUpDate : ''}); go(owner ? 'appts' : 'cal'); }}>Book follow-up</button>}
    </div>;
  })}</section>;
}
