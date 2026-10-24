import { useEffect, useState } from 'react';
import { clinicRequest } from '../clinicApi.js';

export default function ReminderStatus() {
  const [data, setData] = useState(null), [error, setError] = useState('');
  const load = async () => {
    try { setData(await clinicRequest('GET', '/api/reminders/status')); setError(''); }
    catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); const timer = setInterval(load, 30000); return () => clearInterval(timer); }, []);
  return <section className="card" style={{ marginBottom: 20 }}>
    <h3>Automatic vaccination reminders</h3>
    <p>Sent at 30, 14 and 3 days before a veterinarian-approved booster date. Provider acceptance is shown separately from delivery.</p>
    {error && <p role="alert">{error} <button className="btn ghost sm" onClick={load}>Retry</button></p>}
    {data && <>
      {(!data.health?.lastRun || Date.now() - Date.parse(data.health.lastRun) > 36 * 3600000) && <p role="alert">Reminder worker has not completed a recent run. Ask the administrator to check the scheduler.</p>}
      {data.health && (!data.health.emailConfigured || !data.health.smsConfigured) && <p role="alert">Provider setup required: {[!data.health.emailConfigured && 'email', !data.health.smsConfigured && 'TextBee SMS'].filter(Boolean).join(' and ')}. Contact the administrator.</p>}
      {data.health?.overdue > 0 && <p role="alert">{data.health.overdue} reminders are waiting past their retry time. Check the scheduler and provider settings.</p>}
      <p>{data.summary.pending || 0} pending · {data.summary.accepted || 0} accepted by provider · {(data.summary.failed || 0) + (data.summary.uncertain || 0)} need attention</p>
      {!!data.attention.length && <div style={{ overflowX: 'auto' }}><table className="tbl"><thead><tr><th>Patient</th><th>Vaccine / due</th><th>Channel</th><th>Action needed</th></tr></thead><tbody>
        {data.attention.map(r => <tr key={r.id}><td>{r.petName}</td><td>{r.vaccine} · {r.dueDate}</td><td>{r.channel}</td><td>{r.status === 'uncertain' ? 'Check provider history before sending again.' : 'Check owner contact and provider settings; contact the owner.'}</td></tr>)}
      </tbody></table></div>}
      {!Object.keys(data.summary).length && <p>No reminders queued yet. The scheduled worker creates reminders from certified vaccination records.</p>}
    </>}
  </section>;
}
