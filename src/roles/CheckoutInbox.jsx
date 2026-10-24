import { useEffect, useRef } from 'react';
import { useClinicRead } from '../useClinicRead.js';

export default function CheckoutInbox({ me, blocked, onOpen }) {
  const {data,error,loading,load} = useClinicRead('/api/checkout-inbox', 3000);
  const tasks = data?.tasks || [];
  const seen=useRef(null),openRef=useRef(onOpen);
  openRef.current=onOpen;
  useEffect(()=>{
    if (!data) return;
    if (seen.current === null) { seen.current = new Set(tasks.map(t=>t.appointmentId)); return; }
    if(blocked || error || document.querySelector('.scrim, [aria-modal="true"]'))return;
    const fresh=tasks.find(t=>t.status==='pending'&&!seen.current.has(t.appointmentId));
    if(fresh && openRef.current(fresh)!==false)seen.current.add(fresh.appointmentId);
  },[data,blocked,error]);
  const open=task=>{if(onOpen(task)!==false){seen.current ||= new Set();seen.current.add(task.appointmentId);}};
  return <section className="card" style={{marginBottom:16}} aria-label="Checkout inbox">
    <h3>Ready for checkout ({data ? tasks.length : "—"})</h3>
    <p>Completed consultations stay here until payment is saved. The oldest waiting visits appear first.</p>
    {error && <p role="alert">{error} {data && "Showing the last loaded inbox."} <button className="btn ghost sm" disabled={loading} onClick={()=>load()}>Retry inbox</button></p>}
    {(!data || loading) && !error && <p role="status">{data ? "Refreshing checkout inbox…" : "Loading checkout inbox…"}</p>}
    <div aria-live="polite">{data && !error && !tasks.length && <p>No visits waiting for checkout.</p>}</div>
    {tasks.map(t=><div className="sf-row" key={t.appointmentId}>
      <div className="sf-body"><b>{t.petName}</b><div>{t.ownerName} · {t.date} {t.time}</div>
        <small>{t.status==='claimed' ? t.claimedBy===me.id ? 'Open in another checkout window for your account.' : `Being handled by ${t.claimedName || 'reception'}.` : 'Consultation signed. Prepare invoice and collect payment.'}</small>
      </div>
      <button className="btn sm gold" disabled={blocked || !!error || t.status==='claimed'} onClick={()=>open(t)}>Open checkout</button>
    </div>)}
  </section>;
}
