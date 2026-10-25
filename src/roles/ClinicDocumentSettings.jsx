import {useEffect,useRef,useState} from 'react';
import {api} from '../api.js';
import {useFormValidation} from '../components/useFormValidation.jsx';
import {clinicDocumentErrors,clinicDocumentFields} from '../clinicDocumentValidation.js';
import './digital-vet-card.css';
const blank=()=>Object.fromEntries([...clinicDocumentFields.map(([key])=>[key,'']),['confirmed',false]]);
export default function ClinicDocumentSettings(){
 const [profile,setProfile]=useState(null),[form,setForm]=useState(blank),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const validation=useFormValidation(clinicDocumentErrors(form)),pending=useRef(false);
 const load=async()=>{setLoading(true);setError('');try{const r=await api.get('/api/clinic-document-profile');setProfile(r.profile);setForm({...blank(),...r.profile.details,verificationSource:r.profile.verification_source});}catch(e){setError(e.message);}finally{setLoading(false);}};
 useEffect(()=>{load();},[]);
 const edit=(key,value)=>{setMessage('');setForm(previous=>({...previous,[key]:value,...(key==='confirmed'?{}:{confirmed:false})}));};
 const submit=async event=>{event.preventDefault();if(pending.current||!profile||!validation.validate(event))return;pending.current=true;setSaving(true);setError('');setMessage('');try{const r=await api.put('/api/clinic-document-profile',{...form,revision:profile.revision});setProfile(r.profile);setMessage('Verified clinic details saved. Eligible cards refresh automatically when opened or downloaded.');}catch(e){setError(e.message);}finally{pending.current=false;setSaving(false);}};
 return <section className="card"><h2>Clinic details for official documents</h2><p>Check these details against the clinic’s current registration and contact records. Official Digital Vet Cards require verified clinic details, a completed consultation and saved payment.</p>
 {loading?<p role="status">Loading saved clinic details…</p>:<form {...validation.formProps} onSubmit={submit}><fieldset className="clinic-document-fields" disabled={saving||!profile} style={{border:0,padding:0}}>
 {clinicDocumentFields.map(([key,label,max])=><label key={key}>{label} *<input {...validation.field(key)} type={key==='email'?'email':key==='phone'?'tel':'text'} maxLength={max} value={form[key]} onChange={e=>edit(key,e.target.value)}/>{validation.feedback(key)}</label>)}
 <label className="clinic-confirm"><input type="checkbox" {...validation.field('confirmed')} checked={form.confirmed} onChange={e=>edit('confirmed',e.target.checked)}/> I checked these clinic details against the source above.{validation.feedback('confirmed')}</label>
 <button className="btn gold">{saving?'Saving…':'Save verified clinic details'}</button></fieldset></form>}
 {profile?.verified_at && <p>Verified by {profile.verified_by_name} on {new Date(profile.verified_at).toLocaleString('en-PH')} · Revision {profile.revision}</p>}
 {error && <p className="err" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
 <button className="btn ghost" onClick={load} disabled={loading||saving}>Reload saved details</button></section>;
}
