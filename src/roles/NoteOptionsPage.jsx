import {useFormValidation} from '../components/useFormValidation.jsx';
import {noteChoiceError} from '../formValidation.js';
import {useEffect,useRef,useState} from 'react';
import {api} from '../api.js';
import {clinicRequest} from '../clinicApi.js';
import {useSubmissionReview} from '../components/SubmissionReview.jsx';
import {noteLines,readNoteOptions,savedNoteOptions} from '../noteOptions.js';

export default function NoteOptionsPage({onPageState}={}) {
  const [config,setConfig]=useState(null),[diagnosis,setDiagnosis]=useState(''),[treatment,setTreatment]=useState('');
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[needsReload,setNeedsReload]=useState(false);
  const validation=useFormValidation({diagnosis:noteChoiceError(diagnosis),treatment:noteChoiceError(treatment)});
  const operation=useRef(null),mounted=useRef(true);
  const dirty=!!config && (diagnosis!==config.options.diagnosis.join('\n') || treatment!==config.options.treatment.join('\n'));
  const signature=JSON.stringify([diagnosis,treatment,config?.revision]);
  const review=useSubmissionReview([signature,loading,saving,needsReload]);
  useEffect(()=>{onPageState?.({dirty,busy:saving,signature});},[dirty,saving,signature,onPageState]);
  useEffect(()=>{
    if(!dirty && !saving)return;
    const leave=event=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',leave);
    return()=>window.removeEventListener('beforeunload',leave);
  },[dirty,saving]);
  const apply=data=>{
    setConfig(data);setDiagnosis(data.options.diagnosis.join('\n'));setTreatment(data.options.treatment.join('\n'));setNeedsReload(false);
    validation.changed('diagnosis');validation.changed('treatment');
  };
  const load=async()=>{
    if(operation.current)return;
    const controller=new AbortController();operation.current=controller;
    setLoading(true);setError('');setMessage('');
    const timeout=setTimeout(()=>controller.abort(),15000);
    try {
      const data=readNoteOptions(await clinicRequest('GET','/api/clinical/note-options',undefined,{signal:controller.signal}));
      if(mounted.current && operation.current===controller)apply(data);
    } catch(e) {
      if(mounted.current && operation.current===controller)setError(controller.signal.aborted?'Loading saved choices timed out. Your entries are retained; retry the reload.':e.message);
    } finally {
      clearTimeout(timeout);
      if(operation.current===controller){operation.current=null;if(mounted.current)setLoading(false);}
    }
  };
  useEffect(()=>{
    mounted.current=true;load();
    return()=>{mounted.current=false;if(operation.current instanceof AbortController)operation.current.abort();operation.current=null;};
  },[]);
  const reload=async()=>{
    if(operation.current)return;
    if(dirty && !await review.ask({title:'Reload saved choices?',confirmLabel:'Reload and replace entries',description:'Your current entries will be replaced only after the saved choices load successfully. Go back to keep editing or copy your changes before reloading.',fields:[['Diagnosis entries',diagnosis || 'No choices'],['Treatment entries',treatment || 'No choices']]}))return;
    await load();
  };
  const submit=async event=>{
    event.preventDefault();if(operation.current || !config || needsReload)return;
    if(!validation.validate(event))return;
    setError('');setMessage('');
    const options={diagnosis:noteLines(diagnosis),treatment:noteLines(treatment)},revision=config.revision;
    if(!await review.ask({title:'Review diagnosis and treatment suggestions',confirmLabel:'Save choices',description:'These optional entries will be available when veterinarians next open a consultation. Saved clinical notes keep their existing text.',fields:[['Diagnosis choices',options.diagnosis.join('\n') || 'No choices'],['Treatment choices',options.treatment.join('\n') || 'No choices']]}))return;
    if(operation.current)return;
    operation.current='save';setSaving(true);
    try {
      const data=savedNoteOptions(await api.put('/api/clinical/note-options',{options,revision}),revision,options);
      if(mounted.current){apply(data);setMessage('Diagnosis and treatment suggestions saved.');}
    } catch(e) {
      if(mounted.current){setError(e.message);if(e.status===409 || e.unconfirmed)setNeedsReload(true);}
    } finally {operation.current=null;if(mounted.current)setSaving(false);}
  };
  return <section className="card">
    {review.card}<h2>Diagnosis &amp; treatment choices</h2>
    <p>Enter one choice per line, up to 100 choices in each list. Remove a line to retire a choice. Veterinarians can always enter their own notes. These text entries do not add billing charges.</p>
    <p>Use entries approved by the clinic's veterinarians. Vets choose diagnosis and treatment independently and can edit either. Custom visit notes join the shared lists only when an administrator adds and saves them here.</p>
    {loading && <p role="status">Loading saved suggestions…</p>}
    {config && <form {...validation.formProps} onSubmit={submit}>
      <fieldset disabled={saving || loading} style={{border:0,padding:0,margin:0,minWidth:0}}>
        <label>Diagnosis choices<textarea rows={9} {...validation.field('diagnosis')} value={diagnosis} onChange={e=>setDiagnosis(e.target.value)} />{validation.feedback('diagnosis')}</label>
        <label>Treatment choices<textarea rows={9} {...validation.field('treatment')} value={treatment} onChange={e=>setTreatment(e.target.value)} />{validation.feedback('treatment')}</label>
        <button className="btn gold" disabled={saving || loading || needsReload}>{saving?'Saving…':'Review and save choices'}</button>
      </fieldset>
    </form>}
    {dirty && <p role="status">Unsaved changes</p>}
    {needsReload && <p role="status">Your entries are retained. Copy any changes you want to keep, then reload the saved choices before reviewing another save.</p>}
    {error && <p role="alert" className="err">{error}</p>}
    {message && !dirty && <p role="status">{message}</p>}
    <button type="button" className="btn ghost" disabled={saving || loading} onClick={reload}>Reload saved choices</button>
  </section>;
}
