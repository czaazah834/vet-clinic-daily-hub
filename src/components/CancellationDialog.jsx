import { useEffect, useRef, useState } from 'react';
import { sameIntakeVisit } from '../intakeVisit.js';
import { useSubmissionReview } from './SubmissionReview.jsx';

export default function CancellationDialog({visit,currentVisit,onClose,onSubmit,error}) {
  const dialog = useRef(null);
  const [reason,setReason] = useState(''), [saving,setSaving] = useState(false);
  const pending = useRef(false);
  const stale = !currentVisit || !sameIntakeVisit(visit,currentVisit);
  const review = useSubmissionReview([reason,visit,currentVisit]);
  useEffect(()=>{dialog.current.showModal();},[]);
  return <dialog ref={dialog} className="submission-review" aria-label="Cancel appointment" onCancel={e=>{e.preventDefault();if(!pending.current)onClose();}}>
    {review.card}
    <form onSubmit={async e=>{
      e.preventDefault();
      if(pending.current || stale || !reason.trim() || reason.length>500)return;
      if(!await review.ask({title:'Review cancellation',confirmLabel:'Cancel appointment',description:'This cancels the saved visit and releases its reserved time.',fields:[['Visit',`${visit.date} ${visit.time}`],['Reason',reason.trim()]]}))return;
      pending.current=true;setSaving(true);
      try {await onSubmit(reason.trim());} finally {pending.current=false;setSaving(false);}
    }}>
      <h3>Cancel appointment</h3>
      <label>Cancellation reason<textarea required maxLength={500} value={reason} disabled={saving} onChange={e=>setReason(e.target.value)} /></label>
      {(error || stale) && <p role="alert" className="err">{stale ? 'The visit changed. Close this form and reopen its current action.' : error}</p>}
      <div className="row end"><button type="button" className="btn ghost" disabled={saving} onClick={onClose}>Keep appointment</button>
        <button className="btn danger" disabled={saving || stale || !reason.trim()}>{saving ? 'Cancelling…' : 'Review cancellation'}</button></div>
    </form>
  </dialog>;
}
