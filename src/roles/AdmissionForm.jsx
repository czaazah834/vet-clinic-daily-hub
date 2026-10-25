import { useFormValidation } from '../components/useFormValidation.jsx';
import { admissionErrors } from '../formValidation.js';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import ClinicDialog from '../components/ClinicDialog.jsx';
import { useSubmissionReview } from '../components/SubmissionReview.jsx';
import './admissions.css';

export default function AdmissionForm({mode,admission,visits = [],consultationContext,me,onClose,onSaved}) {
  const context = useRef(consultationContext).current;
  const sources = useRef(visits).current, revision = useRef(admission?.revision).current;
  const [form,setForm] = useState({apptId:consultationContext ? visits[0]?.id || '' : '',clinicalNote:'',carePlan:'',ownerUpdate:'',temp:'',weight:'',dischargeInstructions:''});
  const [error,setError] = useState(''), [saving,setSaving] = useState(false), [discard,setDiscard] = useState(false);
  const pending = useRef(false), request = useRef(null);
  const create = mode === 'create', discharge = mode === 'discharge', release = mode === 'release';
  const validation = useFormValidation(admissionErrors(form,{mode,vet:me.role==='vet',visits:sources}));
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
    event.stopPropagation();
    if (pending.current) return;
    setError('');
    if (!validation.validate(event)) return;
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
  const title = create ? context ? `Admit ${context.petName}` : 'Admit a pet' : release ? `Release ${admission.petName} to owner` : discharge ? `Discharge ${admission.petName}` : `${admission.petName} · ${me.role === 'vet' ? 'Veterinarian update' : 'Care observation'}`;
  return <ClinicDialog label={title} onClose={close}>
    <section className="card admission-form">
      {review.card}<h2>{title}</h2>
      <p>{release ? 'Check the saved payment and home-care instructions, then confirm the pet was released to the owner.' : discharge ? 'The veterinarian approves discharge after finalizing the consultation. Enter the summary and instructions for going home.' : 'Record care that was actually observed or provided. Owner messages are shared only when you explicitly enter them.'}</p>
      {create && context && <section className="admission-consultation-context" aria-label="Consultation linked to admission">
        <b>{context.petName}</b><p>Owner: {context.ownerName} · Visit: {visit.date} at {visit.time}</p>
        <p>This admission is linked to the consultation you have open. Your SOAP notes remain open and must be finalized separately.</p>
        {context.diagnosis && <><h3>Current assessment (clinic only)</h3><p className="admission-context-notes">{context.diagnosis}</p></>}
        {context.treatment && <><h3>Current consultation plan (clinic only)</h3><p className="admission-context-notes">{context.treatment}</p>
          <button type="button" className="btn sm ghost" disabled={saving || context.treatment.length>3000} onClick={()=>set('carePlan',context.treatment)}>Use consultation plan for admission</button>
          {context.treatment.length>3000 && <p>Summarize this plan in the admission instructions below (up to 3,000 characters).</p>}</>}
      </section>}
      <form {...validation.formProps} onSubmit={submit}>
        <fieldset disabled={saving}>
          {create && !context && <label>Consultation visit *<select required {...validation.field('apptId')} value={form.apptId} onChange={event => set('apptId',event.target.value)}>
            <option value="">Choose a consultation</option>{sources.map(row => <option key={row.id} value={row.id}>{row.petName} · {row.ownerName} · {row.date} {row.time} · {row.status}</option>)}
          </select>{validation.feedback('apptId')}</label>}
          <label>{create ? 'Reason for admission (clinic only)' : release ? 'Release confirmation (clinic only)' : discharge ? 'Discharge summary (clinic only)' : 'Observations / care provided (clinic only)'} *
            <textarea required rows={3} maxLength={3000} {...validation.field('clinicalNote')} value={form.clinicalNote} onChange={event => set('clinicalNote',event.target.value)} />{validation.feedback('clinicalNote')}</label>
          {me.role === 'vet' && !discharge && !release && <label>{create ? 'Care plan and monitoring instructions *' : 'Updated care plan (optional; leave blank to keep the current plan)'}
            <textarea required={create} rows={3} maxLength={3000} {...validation.field('carePlan')} value={form.carePlan} onChange={event => set('carePlan',event.target.value)} />{validation.feedback('carePlan')}</label>}
          {!discharge && !release && <div className="admission-measurements">
            <label>Measured temperature (°C)<input type="number" min="33" max="45" step="0.1" {...validation.field('temp')} value={form.temp} onChange={event => set('temp',event.target.value)} />{validation.feedback('temp')}</label>
            <label>Measured weight (kg)<input type="number" min="0.05" max="120" step="0.01" {...validation.field('weight')} value={form.weight} onChange={event => set('weight',event.target.value)} />{validation.feedback('weight')}</label>
          </div>}
          <label>Message visible to owner {create ? '*' : '(optional)'}<textarea required={create} rows={3} maxLength={2000} {...validation.field('ownerUpdate')} value={form.ownerUpdate} onChange={event => set('ownerUpdate',event.target.value)} placeholder="A clear update about the pet’s care and next steps" />{validation.feedback('ownerUpdate')}</label>
          {discharge && <label>Discharge and home-care instructions visible to owner *<textarea required rows={4} maxLength={3000} {...validation.field('dischargeInstructions')} value={form.dischargeInstructions} onChange={event => set('dischargeInstructions',event.target.value)} />{validation.feedback('dischargeInstructions')}</label>}
          {error && <p role="alert" className="err">{error} Your entries remain in this form.</p>}
          <div className="row end"><button type="button" className="btn ghost" onClick={close}>Cancel</button><button className="btn gold">{saving ? 'Saving…' : 'Review and save'}</button></div>
        </fieldset>
      </form>
    </section>
    {discard && <ClinicDialog label="Discard unsaved admission entries?" onClose={() => setDiscard(false)}><section className="card admission-form"><h3>Discard unsaved admission entries?</h3><p>These entries have not been saved to the clinic.</p><div className="row end"><button className="btn gold" data-dialog-autofocus onClick={() => setDiscard(false)}>Keep editing</button><button className="btn ghost" onClick={onClose}>Discard entries</button></div></section></ClinicDialog>}
  </ClinicDialog>;
}

