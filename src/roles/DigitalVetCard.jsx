import {useEffect,useRef,useState} from 'react';
import {api} from '../api.js';
import {clinicRequest} from '../clinicApi.js';
import {useFormValidation} from '../components/useFormValidation.jsx';
import {timelineFilterErrors} from '../clinicDocumentValidation.js';
import {PaginatedList} from '../components/Pagination.jsx';
import {filterCardEvents} from '../vetCardTimeline.js';
import './digital-vet-card.css';
export function VetCardTimeline({history,filters={}}){
 const events=filterCardEvents(history.events,filters);
 return <>
  {[["vaccination","Vaccinations"],["deworming","Deworming history"],["weight","Weight per visit"]].map(([kind,title])=>{
   const rows=events.filter(e=>e.kind===kind);
   return <section key={kind}><h4>{title}</h4>
    <PaginatedList label={title} resetKey={JSON.stringify(filters)} className="vet-card-timeline">
     {rows.map(event=><article key={event.id} className="vet-card-event">
      <header><strong>{kind==='weight'?`${event.value} kg`:event.vaccine}</strong><time dateTime={event.date}>{event.date || 'Not recorded'}</time></header>
      {kind!=='weight' && <><dl className="vet-card-patient-fields">
       {[[kind==='deworming'?'Medication / brand':'Vaccine brand',event.brand],['Next due',event.nextDue],...(kind==='vaccination'?[['Manufacturer',event.manufacturer],['Lot / batch number',event.batch],['Serial number',event.serialNumber]]:[]),['Veterinarian',event.vetName]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value || 'Not recorded'}</dd></div>)}
      </dl><p className="vet-card-signature">Veterinarian signature: <span aria-label="Space for handwritten signature">________________________</span></p></>}
     </article>)}
    </PaginatedList>{!rows.length && <p>No {kind==='weight'?'visit weights':kind==='deworming'?'deworming administrations':'vaccinations'} recorded{Object.values(filters).some(Boolean)?' matching these filters':''}.</p>}
   </section>;
  })}
 </>;
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
   // Export the full saved card, independent of screen filters.
   const blob=await clinicRequest('GET',`/api/pets/${encodeURIComponent(petId)}/vet-card/pdf`,undefined,{blob:true});
   const url=URL.createObjectURL(blob);
   if(printWindow){printWindow.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),60000);}
   else{const anchor=window.document.createElement('a');anchor.href=url;anchor.download=`Digital-Vet-Card-${petId}.pdf`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }catch(e){printWindow?.close();setError(e.message);}finally{exportPending.current=false;setExporting(false);}
 };
 const history=data?.history,document=data?.document;
 return <section className="digital-vet-card" aria-label="Digital Vet Card">
  <header className="vet-card-heading"><div><h3>Digital Vet Card</h3><p>Pet and owner details, vaccinations, deworming and visit weights.</p></div><div className="row">
   <button type="button" className="btn gold sm" disabled={!document||loading||exporting} onClick={()=>download()}>{exporting?'Preparing PDF…':'Download PDF'}</button>
   <button type="button" className="btn ghost sm" disabled={!document||loading||exporting} title="Open the vaccination card PDF for printing" onClick={()=>download(true)}>Print Card</button>
   <button type="button" className="btn ghost sm" disabled={loading||exporting} onClick={load}>Refresh card</button>
  </div></header>
  {loading && <p role="status">Loading vaccination card…</p>}
  {error && <p role="alert" className="err">{error}</p>}
  {history && <>
   <div className="vet-card-face-controls"><span>Vaccination card</span><button type="button" className="btn gold sm" aria-pressed={flipped} onClick={()=>setFlipped(value=>!value)}>{flipped?'View pet profile':'Flip to vaccination records'} <span aria-hidden="true">↔</span></button></div>
   <div className="vc-flip-stage"><div className={`vc-flip-card${flipped?' is-flipped':''}`}>
    <section className={`vc-page-front${!flipped?' is-active':''}`} aria-label="Pet profile" aria-hidden={flipped} inert={flipped?'':undefined}>
     <div className="vc-booklet-spine"/>
     <header className="vc-passport-header"><small>Vaccination card</small><h4>Digital Vet Card</h4></header>
     <div className="vet-card-profile-body">
      <div className="vet-card-profile-title">{portrait}<div><h4>{history.pet.name}</h4><p>{history.pet.speciesOther || history.pet.species} · {history.pet.breed || 'Breed not recorded'}</p></div></div>
      <dl className="vet-card-patient-fields">{[['Sex',history.pet.sex],['Date of birth',history.pet.birth],['Color / distinguishing features',history.pet.color],['Spayed / neutered',history.pet.neutered],...(history.pet.microchipNumber?[['Microchip number',history.pet.microchipNumber],['Implantation / scan date',history.pet.microchipDate]]:[])].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value || 'Not recorded'}</dd></div>)}</dl>
      <h4>Owner information</h4><dl className="vet-card-patient-fields">{[['Full name',history.owner.name],['Home address',history.owner.address],['Contact number',history.owner.phone],['Email address',history.owner.email]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value || 'Not recorded'}</dd></div>)}</dl>
     </div>
    </section>
    <section className={`vc-page-back${flipped?' is-active':''}`} aria-label="Vaccination records" aria-hidden={!flipped} inert={!flipped?'':undefined}>
     <header className="vc-passport-header"><small>{history.pet.name}</small><h4>Vaccination records</h4><span className="vc-passport-stamp">Vaccinations · Deworming · Weight</span></header>
     <div className="vet-card-history-body">
   <form {...validation.formProps} className="vet-card-filters" onSubmit={e=>e.preventDefault()}>
    <label>History type<select {...validation.field('kind')} value={filters.kind} onChange={e=>edit('kind',e.target.value)}><option value="">All records</option><option value="vaccination">Vaccinations</option><option value="deworming">Deworming</option><option value="weight">Visit weights</option></select>{validation.feedback('kind')}</label>
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
