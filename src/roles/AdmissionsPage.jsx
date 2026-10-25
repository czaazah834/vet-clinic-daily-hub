import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useClinicRead } from '../useClinicRead.js';
import ClinicDialog from '../components/ClinicDialog.jsx';
import { useSubmissionReview } from '../components/SubmissionReview.jsx';
import './admissions.css';
import AdmissionMedicineForm from './AdmissionMedicineForm.jsx';

const time = value => value ? new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}) : '—';
const Status = ({admission}) => <span className={`admission-status ${admission.status === 'Discharged' ? 'discharged' : ''}`}>{admission.status}</span>;

export function AdmissionsSummary({me,go}) {
  const read = useClinicRead('/api/admissions',5000);
  if (read.error) return <section className="card admission-summary" role="alert">Pet admission updates could not refresh. <button className="btn sm" onClick={() => go('admissions')}>Open admissions</button></section>;
  if (!read.data?.total) return null;
  return <section className="card admission-summary" aria-label="Admitted pets">
    <div><h3>{me.role === 'owner' ? 'Your pet’s stay at the clinic' : 'Pets under admission'} ({read.data.total})</h3>
      <p>{read.data.admissions.slice(0,3).map(row => row.petName).join(', ')}{read.data.total > 3 ? ' and more' : ''}</p></div>
    <button className="btn gold" onClick={() => go('admissions')}>{me.role === 'owner' ? 'View pet updates' : 'Monitor admitted pets'}</button>
  </section>;
}

function AdmissionForm({mode,admission,visits = [],me,onClose,onSaved}) {
  const sources = useRef(visits).current, revision = useRef(admission?.revision).current;
  const [form,setForm] = useState({apptId:visits[0]?.id || '',clinicalNote:'',carePlan:'',ownerUpdate:'',temp:'',weight:'',dischargeInstructions:''});
  const [error,setError] = useState(''), [saving,setSaving] = useState(false), [discard,setDiscard] = useState(false);
  const pending = useRef(false), request = useRef(null);
  const create = mode === 'create', discharge = mode === 'discharge', release = mode === 'release';
  const visit = sources.find(row => row.id === form.apptId);
  const dirty = Object.entries(form).some(([key,value]) => key !== 'apptId' && value !== '');
  const review = useSubmissionReview([form,visit,admission?.revision,admission?.status]);
  const set = (key,value) => setForm(previous => ({...previous,[key]:value}));
  const close = () => { if (!pending.current) dirty ? setDiscard(true) : onClose(); };
  useEffect(() => {
    if (!dirty) return;
    const leave = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload',leave);
    return () => window.removeEventListener('beforeunload',leave);
  },[dirty]);
  const submit = async event => {
    event.preventDefault();
    if (pending.current) return;
    setError('');
    if (create && !visit) return setError('Choose an assigned consultation. Refresh visits if it is missing.');
    const body = {clinicalNote:form.clinicalNote.trim(),ownerUpdate:form.ownerUpdate.trim(),measurements:{},
      ...(create ? {apptId:visit.id,expectedVisit:visit} : {revision}),
      ...(me.role === 'vet' && !discharge && !release ? {carePlan:form.carePlan.trim()} : {}),
      ...(discharge ? {dischargeInstructions:form.dischargeInstructions.trim()} : {})};
    for (const key of ['temp','weight']) if (form[key] !== '') body.measurements[key] = Number(form[key]);
    if (!body.clinicalNote || (create && (!body.carePlan || !body.ownerUpdate)) || (discharge && !body.dischargeInstructions)) return setError('Complete the required notes and instructions.');
    const fields = [['Pet',create ? `${visit.petName} · ${visit.ownerName}` : admission.petName],['Clinic-only note',body.clinicalNote],
      ...(body.carePlan ? [['Veterinarian care plan',body.carePlan]] : []),
      ['Measured observations',Object.entries(body.measurements).map(([key,value]) => `${key === 'temp' ? 'Temperature' : 'Weight'}: ${value} ${key === 'temp' ? '°C' : 'kg'}`).join('\n') || 'None entered'],
      ['Message visible to owner',body.ownerUpdate || 'No new owner message'],
      ...(discharge ? [['Home-care instructions visible to owner',body.dischargeInstructions]] : [])];
    if (!await review.ask({title:create ? 'Review pet admission' : discharge ? 'Review discharge' : 'Review admission update',confirmLabel:create ? 'Admit pet' : release ? 'Confirm release to owner' : discharge ? 'Approve discharge' : 'Save update',
      description:release ? 'Confirm the pet was released to the owner after veterinarian approval and saved payment.' : discharge ? 'Approve discharge and share home-care instructions. Reception must record final payment before releasing the pet.' : 'Check the clinical notes and the exact message that will be shared with the owner.',fields})) return;
    const signature = JSON.stringify(body);
    if (request.current?.signature !== signature) request.current = {signature,id:crypto.randomUUID()};
    pending.current = true; setSaving(true);
    try {
      const result = await api.post(create ? '/api/admissions' : `/api/admissions/${admission.id}/${mode}`,{...body,requestId:request.current.id});
      if (!result.success || !result.admission?.id || !Number.isInteger(result.admission.revision) || (create ? result.admission.id !== request.current.id : result.admission.id !== admission.id)) throw Error('The server did not confirm this save. Keep your entries and retry to check the result.');
      onSaved(result.admission);
    } catch (e) { setError(e.message); pending.current = false; setSaving(false); }
  };
  const title = create ? 'Admit a pet' : release ? `Release ${admission.petName} to owner` : discharge ? `Discharge ${admission.petName}` : `${admission.petName} · ${me.role === 'vet' ? 'Veterinarian update' : 'Care observation'}`;
  return <ClinicDialog label={title} onClose={close}>
    <section className="card admission-form">
      {review.card}<h2>{title}</h2>
      <p>{release ? 'Check the saved payment and home-care instructions, then confirm the pet was released to the owner.' : discharge ? 'The veterinarian approves discharge after finalizing the consultation. Enter the summary and instructions for going home.' : 'Record care that was actually observed or provided. Owner messages are shared only when you explicitly enter them.'}</p>
      <form onSubmit={submit}>
        <fieldset disabled={saving}>
          {create && <label>Consultation visit *<select required value={form.apptId} onChange={event => set('apptId',event.target.value)}>
            <option value="">Choose a consultation</option>{sources.map(row => <option key={row.id} value={row.id}>{row.petName} · {row.ownerName} · {row.date} {row.time} · {row.status}</option>)}
          </select></label>}
          <label>{create ? 'Reason for admission (clinic only)' : release ? 'Release confirmation (clinic only)' : discharge ? 'Discharge summary (clinic only)' : 'Observations / care provided (clinic only)'} *
            <textarea required rows={3} maxLength={3000} value={form.clinicalNote} onChange={event => set('clinicalNote',event.target.value)} /></label>
          {me.role === 'vet' && !discharge && !release && <label>{create ? 'Care plan and monitoring instructions *' : 'Updated care plan (optional; leave blank to keep the current plan)'}
            <textarea required={create} rows={3} maxLength={3000} value={form.carePlan} onChange={event => set('carePlan',event.target.value)} /></label>}
          {!discharge && !release && <div className="admission-measurements">
            <label>Measured temperature (°C)<input type="number" min="33" max="45" step="0.1" value={form.temp} onChange={event => set('temp',event.target.value)} /></label>
            <label>Measured weight (kg)<input type="number" min="0.05" max="120" step="0.01" value={form.weight} onChange={event => set('weight',event.target.value)} /></label>
          </div>}
          <label>Message visible to owner {create ? '*' : '(optional)'}<textarea required={create} rows={3} maxLength={2000} value={form.ownerUpdate} onChange={event => set('ownerUpdate',event.target.value)} placeholder="A clear update about the pet’s care and next steps" /></label>
          {discharge && <label>Discharge and home-care instructions visible to owner *<textarea required rows={4} maxLength={3000} value={form.dischargeInstructions} onChange={event => set('dischargeInstructions',event.target.value)} /></label>}
          {error && <p role="alert" className="err">{error} Your entries remain in this form.</p>}
          <div className="row end"><button type="button" className="btn ghost" onClick={close}>Cancel</button><button className="btn gold">{saving ? 'Saving…' : 'Review and save'}</button></div>
        </fieldset>
      </form>
    </section>
    {discard && <ClinicDialog label="Discard unsaved admission entries?" onClose={() => setDiscard(false)}><section className="card admission-form"><h3>Discard unsaved admission entries?</h3><p>These entries have not been saved to the clinic.</p><div className="row end"><button className="btn gold" data-dialog-autofocus onClick={() => setDiscard(false)}>Keep editing</button><button className="btn ghost" onClick={onClose}>Discard entries</button></div></section></ClinicDialog>}
  </ClinicDialog>;
}

function NewAdmission({me,onSaved}) {
  const [open,setOpen] = useState(false);
  const read = useClinicRead('/api/admissions/eligible',5000);
  return <>
    {read.error && <p role="alert">{read.error} <button className="btn sm" onClick={() => read.load()}>Retry consultation list</button></p>}
    <button className="btn gold" disabled={!read.data?.visits.length || !!read.error} onClick={() => setOpen(true)}>Admit a pet</button>
    {!read.error && read.data && !read.data.visits.length && <p>Start a consultation from the Clinical Queue to admit a pet. A pet can have one active admission.</p>}
    {open && <AdmissionForm mode="create" me={me} visits={read.data?.visits || []} onClose={() => setOpen(false)} onSaved={row => {setOpen(false);read.load();onSaved(row);}} />}
  </>;
}

function AdmissionDetail({id,me,go,onBack,onChanged}) {
  const [pages,setPages] = useState([null]), [mode,setMode] = useState(null), [medicine,setMedicine] = useState(null);
  const cursor = pages.at(-1);
  const read = useClinicRead(`/api/admissions/${id}${cursor ? `?before=${encodeURIComponent(cursor)}` : ''}`,3000);
  const owner = me.role === 'owner', admission = read.data?.admission;
  const saved = row => {setMode(null);setMedicine(null);setPages([null]);read.load(`/api/admissions/${id}`);onChanged(row);};
  return <section className="card admission-detail">
    <button className="btn sm ghost" onClick={onBack}>Back to admissions</button>
    {read.error && <p role="alert" className="err">{read.error} <button className="btn sm" onClick={() => read.load()}>Retry admission</button></p>}
    {!read.data && !read.error && <p role="status">Loading admission…</p>}
    {admission && !read.error && <>
      <header className="admission-heading"><div><h2>{admission.petName}</h2><p>{admission.vetName}{!owner && ` · Owner: ${admission.ownerName}`}</p></div><Status admission={admission} /></header>
      <p>Admitted: {time(admission.admittedAt)}{admission.dischargeApprovedAt && ` · Discharge approved: ${time(admission.dischargeApprovedAt)}`}{admission.dischargedAt && ` · Discharged: ${time(admission.dischargedAt)}`}</p>
      {owner ? <p>These are saved updates shared by the clinic. Checked at {time(read.data.checkedAt)}. Times are shown in Manila time.</p> : <>
        <section className="admission-plan"><h3>Reason for admission</h3><p>{admission.reason}</p><h3>Veterinarian care plan</h3><p>{admission.carePlan}</p></section>
        {admission.status === 'Admitted' && ['vet','assistant'].includes(me.role) && <div className="admission-actions"><button className="btn gold" onClick={() => setMode('update')}>{me.role === 'vet' ? 'Add veterinarian update' : 'Record care observation'}</button>
          {me.role === 'vet' && <button className="btn" disabled={admission.visitStatus !== 'Completed'} onClick={() => setMode('discharge')}>Approve discharge</button>}
          {me.role === 'vet' && admission.visitStatus !== 'Completed' && <p>Finalize the consultation SOAP notes in the Clinical Queue before discharge.</p>}
        </div>}
      </>}
      <section className="admission-plan" aria-label="Discharge and checkout progress"><h3>Discharge and checkout</h3>
        <p>{admission.status === 'Admitted' ? 'Care is ongoing. Final checkout waits for veterinarian discharge approval.' : admission.status === 'Ready for discharge' ? admission.billingStatus === 'Paid' ? 'Payment saved. Reception can now confirm release to the owner.' : 'Discharge approved. Reception must finalize the bill and record payment before release.' : 'This stay is closed. Its care history and discharge instructions are retained.'}</p>
        <p>Payment: {admission.billingStatus || 'Unbilled'}</p>
        {admission.status === 'Ready for discharge' && me.role === 'assistant' && <div className="admission-actions">{admission.billingStatus !== 'Paid' && go && <button className="btn" onClick={()=>go('home')}>Open Front Desk checkout inbox</button>}<button className="btn gold" disabled={admission.billingStatus !== 'Paid'} onClick={()=>setMode('release')}>Confirm release to owner</button></div>}
      </section>
      {!owner && <section className="admission-plan" aria-label="Medicine orders"><h3>Veterinarian medicine orders</h3>
        <p>Orders describe what should be given. The care timeline records what actually happened. Take-home prescriptions and clinic supplies are separate.</p>
        {admission.status === 'Admitted' && me.role === 'vet' && <button className="btn gold" onClick={()=>setMedicine({action:'order'})}>Add medicine order</button>}
        {!read.data.medicationOrders?.length && <p>No medicine orders recorded for this stay.</p>}
        {read.data.medicationOrders?.map(order=><article key={order.id} className="admission-medicine-order"><h4>{order.medicine} {order.stopped_at && <small>· Stopped {time(order.stopped_at)}</small>}</h4><p>{order.dose} · {order.route} · {order.frequency}</p><p>{order.instructions}</p><p>Ordered by {order.ordered_by} · {time(order.ordered_at)}</p>{order.catalog_id && <p>Clinic supply limit: {order.supply_limit} whole items/packages. Actual usage is recorded with each given dose.</p>}
          {!order.stopped_at && admission.status === 'Admitted' && ['vet','assistant'].includes(me.role) && <div className="admission-actions"><button className="btn" onClick={()=>setMedicine({action:'medication',order})}>Record medicine event</button>{me.role === 'vet' && <button className="btn ghost" onClick={()=>setMedicine({action:'stop-medication',order})}>Stop order</button>}</div>}
        </article>)}
      </section>}
      {admission.dischargeInstructions && <section className="admission-plan"><h3>Discharge and home-care instructions</h3><p>{admission.dischargeInstructions}</p></section>}
      <h3>{owner ? 'Updates from the clinic' : 'Care timeline'} <small>· newest first</small></h3>
      {!read.data.updates.length && <p>{owner ? 'The clinic has not shared an update on this page yet.' : 'No updates on this page.'}</p>}
      <ol className="admission-timeline">{read.data.updates.map(update => <li key={update.id}>
        <h4>{update.kind} <small>{time(update.at)}</small></h4><p className="admission-by">{update.by} · {update.role === 'vet' ? 'Veterinarian' : 'Veterinary assistant'}</p>
        {!owner && <><p>{update.clinicalNote}</p>{update.medication?.medicine && <p><b>{update.medication.medicine}</b>{update.medication.dose && ` · ${update.medication.dose} · ${update.medication.route}`}{update.medication.result && ` · ${update.medication.result} · ${time(update.medication.occurredAt)}`}{update.medication.billableQuantity > 0 && ` · Clinic supplies used: ${update.medication.billableQuantity} whole items/packages`}</p>}{update.voided && <p><b>Entered in error — original entry retained; excluded from charges.</b></p>}{update.medication?.voids && <p>Corrects medicine entry: {update.medication.voids}</p>}{admission.status === 'Admitted' && me.role === 'vet' && update.kind === 'Medicine administration' && !update.voided && <button className="btn sm ghost" onClick={()=>setMedicine({action:'correct-medication',event:update})}>Mark as entered in error</button>}{update.carePlan && <p><b>Care plan:</b> {update.carePlan}</p>}
          {Object.keys(update.measurements || {}).length > 0 && <p>Measured: {Object.entries(update.measurements).map(([key,value]) => `${key === 'temp' ? 'Temperature' : 'Weight'} ${value} ${key === 'temp' ? '°C' : 'kg'}`).join(' · ')}</p>}</>}
        {update.ownerUpdate && <div className="admission-owner-update">{!owner && <b>Shared with owner</b>}<p>{update.ownerUpdate}</p></div>}
        {!owner && !update.ownerUpdate && <small>Clinic-only update</small>}
      </li>)}</ol>
      <div className="admission-actions"><button className="btn sm ghost" disabled={pages.length === 1} onClick={() => setPages(previous => previous.slice(0,-1))}>Newer updates</button><button className="btn sm ghost" disabled={!read.data.nextCursor} onClick={() => setPages(previous => [...previous,read.data.nextCursor])}>Older updates</button></div>
      <p className="admission-footnote">Care history is retained after discharge. Vet approval → final payment → confirmed release. Prescribed, administered and take-home medicines remain separate records.</p>
    </>}
    {medicine && admission && <AdmissionMedicineForm {...medicine} admission={admission} onClose={()=>setMedicine(null)} onSaved={saved} />}
    {mode && admission && <AdmissionForm mode={mode} admission={admission} me={me} onClose={() => setMode(null)} onSaved={saved} />}
  </section>;
}

export default function AdmissionsPage({me,go,say = () => {}}) {
  const [status,setStatus] = useState('Active'), [offset,setOffset] = useState(0), [selected,setSelected] = useState(null);
  const read = useClinicRead(`/api/admissions?status=${status}&offset=${offset}`,3000);
  const data = read.data?.status === status && read.data?.offset === offset ? read.data : null;
  const changed = row => {read.load();say(row.status === 'Discharged' ? 'Release saved. The admission history is retained.' : 'Admission update saved.');};
  if (selected) return <AdmissionDetail key={selected} id={selected} me={me} go={go} onBack={() => setSelected(null)} onChanged={changed} />;
  return <div className="admissions-page">
    <section className="card"><h2>{me.role === 'owner' ? 'Your pet’s admission updates' : 'Admission and daily monitoring'}</h2>
      <p>{me.role === 'owner' ? 'Follow your pet’s stay, read messages from the clinic and find discharge instructions here. Updates refresh while connected.' : 'The veterinarian admits the pet and orders care. Staff record actual observations and medicine events. The vet approves discharge; reception records payment and confirms release. Owner messages are reviewed separately from clinic-only notes.'}</p>
      {me.role === 'vet' && <NewAdmission me={me} onSaved={row => {changed(row);setSelected(row.id);}} />}
    </section>
    <section className="card"><div className="admission-actions" role="group" aria-label="Admission status">{['Active','Admitted','Ready for discharge','Discharged'].map(value => <button key={value} className={`btn ${status === value ? 'gold' : 'ghost'}`} aria-pressed={status === value} onClick={() => {setStatus(value);setOffset(0);}}>{value}</button>)}<button className="btn sm ghost" disabled={read.loading} onClick={() => read.load()}>Refresh updates</button></div>
      {read.error && <p role="alert" className="err">{read.error} {data && 'Showing the last loaded admissions.'}</p>}
      {!data && !read.error && <p role="status">Loading admissions…</p>}
      {data && <><p>{data.total} {status.toLowerCase()} pet {data.total === 1 ? 'stay' : 'stays'} · Checked at {time(data.checkedAt)}</p>
        {!data.admissions.length && <p>No {status.toLowerCase()} pets on this page.</p>}
        <div className="admission-list">{data.admissions.map(row => <article key={row.id}>
          <div className="admission-heading"><h3>{row.petName}</h3><Status admission={row} /></div><p>{row.vetName} · Admitted {time(row.admittedAt)}</p>
          {row.latestUpdate && <p className="admission-preview">{row.latestUpdate}</p>}
          <button className="btn" onClick={() => setSelected(row.id)}>{me.role === 'owner' ? 'View pet updates' : 'Open care timeline'}</button>
        </article>)}</div>
        <div className="admission-actions"><button className="btn sm ghost" disabled={!offset} onClick={() => setOffset(previous => Math.max(0,previous-50))}>Previous stays</button><button className="btn sm ghost" disabled={offset+50 >= data.total} onClick={() => setOffset(previous => previous+50)}>More stays</button></div>
      </>}
    </section>
  </div>;
}
