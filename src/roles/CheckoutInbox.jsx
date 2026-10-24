import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export default function CheckoutInbox({ me, blocked, onOpen }) {
  const [tasks,setTasks]=useState([]),[error,setError]=useState('');
  const seen=useRef(null),openRef=useRef(onOpen);
  openRef.current=onOpen;
  const load=async()=>{
    try { const data=await api.get('/api/checkout-inbox');if(seen.current===null)seen.current=new Set((data.tasks || []).map(t=>t.appointmentId));setTasks(data.tasks || []);setError(''); }
    catch(e) {setError(e.message);}
  };
  useEffect(()=>{let active=true;
    const fetchInbox=async()=>{
      try { const data=await api.get('/api/checkout-inbox');if(active){if(seen.current===null)seen.current=new Set((data.tasks || []).map(t=>t.appointmentId));setTasks(data.tasks || []);setError('');} }
      catch(e){if(active)setError(e.message);}
    };
    fetchInbox();const timer=setInterval(fetchInbox,3000);
    return()=>{active=false;clearInterval(timer);};
  },[]);
  useEffect(()=>{
    if(seen.current===null)return;
    if(blocked || error || document.querySelector('.scrim, [aria-modal="true"]'))return;
    const fresh=tasks.find(t=>t.status==='pending'&&!seen.current.has(t.appointmentId));
    if(fresh && openRef.current(fresh)!==false)seen.current.add(fresh.appointmentId);
  },[tasks,blocked,error]);
  const open=task=>{if(onOpen(task)!==false){seen.current ||= new Set();seen.current.add(task.appointmentId);}};
  return <section className="card" style={{marginBottom:16}} aria-label="Checkout inbox">
    <h3>Ready for checkout ({tasks.length})</h3>
    <p>Completed consultations stay here until payment is saved. The oldest waiting visits appear first.</p>
    {error && <p role="alert">{error} <button className="btn ghost sm" onClick={load}>Retry inbox</button></p>}
    <div aria-live="polite">{!error && !tasks.length && <p>No visits waiting for checkout.</p>}</div>
    {tasks.map(t=><div className="sf-row" key={t.appointmentId}>
      <div className="sf-body"><b>{t.petName}</b><div>{t.ownerName} · {t.date} {t.time}</div>
        <small>{t.status==='claimed' ? t.claimedBy===me.id ? 'Open in another checkout window for your account.' : `Being handled by ${t.claimedName || 'reception'}.` : 'Consultation signed. Prepare invoice and collect payment.'}</small>
      </div>
      <button className="btn sm gold" disabled={blocked || t.status==='claimed'} onClick={()=>open(t)}>Open checkout</button>
    </div>)}
  </section>;
}
