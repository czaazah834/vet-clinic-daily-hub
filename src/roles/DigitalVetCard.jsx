import {useEffect,useRef,useState} from 'react';
import {api} from '../api.js';
import {clinicRequest} from '../clinicApi.js';
import {useFormValidation} from '../components/useFormValidation.jsx';
import {timelineFilterErrors} from '../clinicDocumentValidation.js';
import {PaginatedList} from '../components/Pagination.jsx';
import {eventTitle,filterCardEvents} from '../vetCardTimeline.js';
import './digital-vet-card.css';
export function VetCardTimeline({history,document,filters}){
 const published=new Set(document?.snapshot.events.map(e=>`${e.kind}:${e.id}`) || []);
 const events=filterCardEvents(history.events,filters);
 return <><p role="status">{events.length} of {history.events.length} history entries</p>
 <PaginatedList label="Vaccination and vitals timeline" resetKey={JSON.stringify(filters)} className="vet-card-timeline">
 {events.map(event=>{
  const visit=history.visits.find(v=>v.id===event.visitId);
  return <article key={`${event.kind}-${event.id}`} className="vet-card-event">
   <header><strong>{eventTitle(event)}</strong><time dateTime={event.measuredAt || event.date}>{event.measuredAt?new Date(event.measuredAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'}):event.date || 'Date not recorded'}</time></header>
   {event.value!=null && <p><b>{event.value} {event.unit}</b></p>}
   {['vaccination','planned','reference'].includes(event.kind)?<p>{event.kind==='reference'?'Reference entered (dose date unknown)':event.kind==='planned'?'Plan recorded':'Administered'}: {event.date} · {event.vetName} · Recorded by {event.recordedBy}<br/>Brand: {event.brand || 'Not recorded'} · Batch: {event.batch || 'Not recorded'}{event.doseNo?` · Dose ${event.doseNo}${event.doseOf?` of ${event.doseOf}`:''}`:''}{event.nextDue?` · Next due / planned: ${event.nextDue}`:''}</p>:<p>Recorded by {event.staffName || (event.kind==='registration'?'Owner report':'Unknown historical staff')}{event.staffRole?` (${event.staffRole})`:''} · {event.source || event.origin || 'Registration'}{!event.measuredAt && event.kind!=='registration'?' · Measurement time not recorded':''}</p>}
   {event.correctsId && <p className="vet-card-correction">Correction of {event.correctsId}: {event.correctionReason}</p>}
   {event.supersededBy && <p className="vet-card-correction">Original entry retained · corrected by {event.supersededBy}</p>}
   {event.notes && <p className="vet-card-notes">{event.notes}</p>}
   {event.private?<p className="badge">Staff-only admission history · Excluded from shared documents</p>:published.has(`${event.kind}:${event.id}`)?<p className="badge ok">Included in published revision {document.revision}</p>:<p className="badge">{visit&&!visit.qualified?'Awaiting completed consultation and saved payment':'Awaiting official publication'}</p>}
   {!event.visitId && <p>{event.provenance || (event.kind==='registration'?'Owner report; not a clinic measurement.':'Historical visit link not recorded.')}</p>}
   {visit && <details><summary>Visit details · {visit.date} · {visit.reason}</summary><VisitDetails visit={visit}/></details>}
  </article>;
 })}
 </PaginatedList>{!events.length && <p>No matching history entries.</p>}
 <h4>Consultation history</h4>
 <PaginatedList label="Card visit details" resetKey={history.pet.id}>
 {history.visits.map(visit=><details key={visit.id} className="vet-card-visit"><summary>{visit.date} · {visit.reason} · {visit.status} · {visit.billingStatus}</summary><VisitDetails visit={visit}/></details>)}
 </PaginatedList></>;
}
function VisitDetails({visit}){
 return <div className="vet-card-notes"><p>Visit: {visit.id} · {visit.vetName} · {visit.status} · {visit.billingStatus}{visit.paidAt?` · Paid ${new Date(visit.paidAt).toLocaleString('en-PH')}`:''}</p>
 {visit.admissionStatus && <p>Admission: {visit.admissionStatus}. Payment does not confirm release.</p>}
 {visit.consultation?(visit.consultations || [visit.consultation]).map(consultation=><div key={consultation.id}><h5>Consultation {consultation.id} · {consultation.vetName || visit.vetName}</h5><dl>{[['Subjective','symptoms'],['Objective','objective'],['Assessment','diagnosis'],['Plan','treatment'],['Prescription','prescription'],['Care status','careStatus'],['Follow-up','followUpDate'],['Follow-up instructions','followUpReason']].map(([label,key])=><div key={key}><dt>{label}</dt><dd>{consultation[key] || 'Not recorded'}</dd></div>)}</dl></div>):<p>Consultation has not been finalized.</p>}</div>;
}
export default function DigitalVetCard({petId,refreshKey,portrait}){
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[exporting,setExporting]=useState(false);
 const [flipped,setFlipped]=useState(false);
 const [filters,setFilters]=useState({kind:'',from:'',to:'',query:''});
 const validation=useFormValidation(timelineFilterErrors(filters)),exportPending=useRef(false),generation=useRef(0);
 const load=async()=>{
  const id=++generation.current;setLoading(true);setError('');
  try{const next=await api.get(`/api/pets/${encodeURIComponent(petId)}/vet-card`);if(generation.current===id)setData(next);}
  catch(e){if(generation.current===id)setError(e.message);}
  finally{if(generation.current===id)setLoading(false);}
 };
 useEffect(()=>{setData(null);setFlipped(false);load();return()=>{generation.current++;};},[petId,refreshKey]);
 const edit=(key,value)=>setFilters(previous=>({...previous,[key]:value}));
 const download=async(print=false)=>{
  if(exportPending.current)return;
  const printWindow=print?window.open('','_blank'):null;
  if(print&&!printWindow){setError('Allow a new window to open the complete PDF for printing.');return;}
  if(printWindow)printWindow.opener=null;
  exportPending.current=true;setExporting(true);setError('');
  try{
   // The server loads all history and builds an unfiltered published snapshot.
   const blob=await clinicRequest('GET',`/api/pets/${encodeURIComponent(petId)}/vet-card/pdf`,undefined,{blob:true});
   const url=URL.createObjectURL(blob);
   if(printWindow){printWindow.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),60000);}
   else{const anchor=window.document.createElement('a');anchor.href=url;anchor.download=`Digital-Vet-Card-${petId}.pdf`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }catch(e){printWindow?.close();setError(e.message);}finally{exportPending.current=false;setExporting(false);}
 };
 const history=data?.history,document=data?.document;
 return <section className="digital-vet-card" aria-label="Digital Vet Card">
  <header className="vet-card-heading"><div><h3>Digital Vet Card</h3><p>{document?'Official clinic document':data?.publicationStatus || 'Loading publication status…'}</p></div><div className="row">
   <button type="button" className="btn gold sm" disabled={!document||loading||exporting} onClick={()=>download()}>{exporting?'Preparing complete PDF…':'Download PDF'}</button>
   <button type="button" className="btn ghost sm" disabled={!document||loading||exporting} title="Open the complete published PDF for printing" onClick={()=>download(true)}>Print Card</button>
   <button type="button" className="btn ghost sm" disabled={loading||exporting} onClick={load}>Refresh card</button>
  </div></header>
  {loading && <p role="status">Loading complete vaccination, vitals and visit history…</p>}
  {error && <p role="alert" className="err">{error}</p>}
  {history && <>
   <div className="vet-card-face-controls"><span>Patient health booklet</span><button type="button" className="btn gold sm" aria-pressed={flipped} onClick={()=>setFlipped(value=>!value)}>{flipped?'View pet profile':'Flip to vaccination & vitals history'} <span aria-hidden="true">↔</span></button></div>
   <div className="vc-flip-stage"><div className={`vc-flip-card${flipped?' is-flipped':''}`}>
    <section className={`vc-page-front${!flipped?' is-active':''}`} aria-label="Pet profile" aria-hidden={flipped} inert={flipped?'':undefined}>
     <div className="vc-booklet-spine"/>
     <header className="vc-passport-header"><small>Patient health booklet</small><h4>{history.clinic.verifiedAt?history.clinic.name:'Digital Vet Card'}</h4><span className="vc-passport-stamp">{document?'Published clinic document':'Patient record · Unpublished'}</span></header>
     <div className="vet-card-profile-body">
      <div className="vet-card-profile-title">{portrait}<div><h4>{history.pet.name}</h4><p>{history.pet.species} · {history.pet.breed || 'Breed not recorded'}</p><small>Patient ID: {history.pet.id}<br/>Internal card reference: {history.pet.internalReference || 'Awaiting registration verification'}</small></div></div>
      <dl className="vet-card-patient-fields">{[['Sex',history.pet.sex],['Date of birth',history.pet.birth],['Coat / markings',history.pet.color],['Spayed / neutered',history.pet.neutered],['Registered owner',history.pet.ownerName],['Recorded allergies',history.pet.allergies?.join(', ') || 'None recorded']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value || 'Not recorded'}</dd></div>)}</dl>
      {history.clinic.verifiedAt?<address>{history.clinic.address}<br/>{history.clinic.phone} · {history.clinic.email}<br/>Clinic registration: {history.clinic.registration}</address>:<p className="vet-card-publication-note">Clinic details await administrator verification. Official publication is unavailable.</p>}
      {document?<footer className="vet-card-document-meta"><b>{document.reference} · Revision {document.revision}</b><br/>Issued: {new Date(document.issuedAt).toLocaleString('en-PH')}<br/>Refreshed: {new Date(document.refreshedAt).toLocaleString('en-PH')}</footer>:<p className="vet-card-publication-note">The official document is published after a completed consultation and saved payment, using verified clinic details.</p>}
     </div>
    </section>
    <section className={`vc-page-back${flipped?' is-active':''}`} aria-label="Vaccination and vitals history" aria-hidden={!flipped} inert={!flipped?'':undefined}>
     <header className="vc-passport-header"><small>{history.pet.name} · Patient {history.pet.id}</small><h4>Vaccination & vitals history</h4><span className="vc-passport-stamp">Vaccinations · Measurements · Visits</span></header>
     <div className="vet-card-history-body">
   <p>Live history includes visits awaiting completion/payment. The PDF includes complete published history regardless of filters. Historical records without a visit link retain their original provenance. Planned vaccines are not administered doses.</p>
   <form {...validation.formProps} className="vet-card-filters" onSubmit={e=>e.preventDefault()}>
    <label>History type<select {...validation.field('kind')} value={filters.kind} onChange={e=>edit('kind',e.target.value)}><option value="">All entries</option><option value="vaccination">Administered vaccines</option><option value="planned">Planned vaccines</option><option value="reference">Previous-clinic references (unverified)</option><option value="weight">Measured weight</option><option value="temp">Measured temperature</option><option value="registration">Registration weight reports</option><option value="observation">Admission observations (staff only)</option></select>{validation.feedback('kind')}</label>
    <label>From date<input type="date" {...validation.field('from')} value={filters.from} onChange={e=>edit('from',e.target.value)}/>{validation.feedback('from')}</label>
    <label>To date<input type="date" {...validation.field('to')} value={filters.to} onChange={e=>edit('to',e.target.value)}/>{validation.feedback('to')}</label>
    <label>Search history<input type="search" {...validation.field('query')} value={filters.query} onChange={e=>edit('query',e.target.value)}/>{validation.feedback('query')}</label>
   </form>
   {!Object.values(timelineFilterErrors(filters)).some(Boolean) && <VetCardTimeline history={history} document={document} filters={filters}/>}
     </div></section>
   </div></div>
  </>}
 </section>;
}
