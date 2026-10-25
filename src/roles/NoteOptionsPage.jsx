import { useFormValidation } from '../components/useFormValidation.jsx';
import { noteChoiceError } from '../formValidation.js';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useSubmissionReview } from '../components/SubmissionReview.jsx';
const lines = text => text.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
export default function NoteOptionsPage() {
  const [config, setConfig] = useState(null), [diagnosis, setDiagnosis] = useState(''), [treatment, setTreatment] = useState('');
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const validation = useFormValidation({diagnosis:noteChoiceError(diagnosis),treatment:noteChoiceError(treatment)});
  const pending = useRef(false);
  const review = useSubmissionReview([diagnosis,treatment,config]);
  const load = async () => {
    setLoading(true); setError(''); setMessage('');
    try { const data = await api.get('/api/clinical/note-options'); setConfig(data); setDiagnosis(data.options.diagnosis.join('\n')); setTreatment(data.options.treatment.join('\n')); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const submit = async event => {
    event.preventDefault(); if (pending.current || !config) return;
    if (!validation.validate(event)) return;
    setError(''); setMessage('');
    const options = {diagnosis:lines(diagnosis),treatment:lines(treatment)};
    for (const list of Object.values(options)) {
      if (list.length > 100 || list.some(value => value.length > 1000) || new Set(list.map(value => value.toLowerCase())).size !== list.length) {
        setError('Use up to 100 unique entries in each list, with at most 1,000 characters per entry.'); return;
      }
    }
    if (!await review.ask({title:'Review clinic note choices',confirmLabel:'Save choices',description:'These optional entries will be available when veterinarians next open a consultation. Saved clinical notes keep their existing text.',fields:[['Diagnosis choices',options.diagnosis.join('\n') || 'No choices'],['Treatment choices',options.treatment.join('\n') || 'No choices']]})) return;
    pending.current = true; setSaving(true);
    try { const data = await api.put('/api/clinical/note-options',{options,revision:config.revision}); setConfig(data); setDiagnosis(data.options.diagnosis.join('\n')); setTreatment(data.options.treatment.join('\n')); setMessage('Clinic note choices saved.'); }
    catch (e) { setError(e.message); }
    finally { pending.current = false; setSaving(false); }
  };
  return <section className="card">
    {review.card}<h2>Diagnosis &amp; treatment choices</h2>
    <p>Enter one choice per line, up to 100 choices in each list. Remove a line to retire a choice. Veterinarians can always enter their own notes. These text entries do not add billing charges.</p>
    <p>Use entries approved by the clinic's veterinarians. Vets choose diagnosis and treatment independently and can edit either. Custom visit notes join the shared lists only when an administrator adds and saves them here.</p>
    {loading ? <p role="status">Loading clinic choices…</p> : <form {...validation.formProps} onSubmit={submit}>
      <fieldset disabled={saving || !config} style={{border:0,padding:0}}>
        <label>Diagnosis choices<textarea rows={9} {...validation.field('diagnosis')} value={diagnosis} onChange={e => setDiagnosis(e.target.value)} />{validation.feedback('diagnosis')}</label>
        <label>Treatment choices<textarea rows={9} {...validation.field('treatment')} value={treatment} onChange={e => setTreatment(e.target.value)} />{validation.feedback('treatment')}</label>
        <button className="btn gold" disabled={saving || !config}>{saving ? 'Saving…' : 'Review and save choices'}</button>
      </fieldset>
    </form>}
    {error && <p role="alert" className="err">{error}</p>}
    {message && <p role="status">{message}</p>}
    <button type="button" className="btn ghost" disabled={saving || loading} onClick={load}>Reload saved choices</button>
  </section>;
}
