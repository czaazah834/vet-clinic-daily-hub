import { useState } from 'react';
import { CalendarDays, CreditCard, Users, ShieldCheck, UserRound, Bell, ClipboardList, Activity, ChevronDown, Clock } from 'lucide-react';
import { auditActivity } from '../auditActivity.js';
const icons={'Appointments':CalendarDays,'Clinical care':ClipboardList,'Payments':CreditCard,'Patients & owners':Users,'Staff access':ShieldCheck,'Account & sign-in':UserRound,'Reminders':Bell};
export default function AuditActivity({entry,className=''}) {
  const [open,setOpen]=useState(false),a=auditActivity(entry),Icon=icons[a.type]||Activity;
  const role={admin:'Administrator',vet:'Veterinarian',assistant:'Vet assistant',owner:'Pet owner',system:'System'}[a.role]||a.role;
  return <article className={`audit-entry ${className}`}>
    <span className="audit-event-icon"><Icon size={20} aria-hidden="true" /></span>
    <div className="audit-entry-content"><div className="audit-entry-meta"><span className="audit-type">{a.type}</span><time dateTime={a.dateTime}><Clock size={12} aria-hidden="true" />{a.timestamp} · Manila</time></div>
      <p className="audit-action">{a.action}</p><div className="audit-actor"><UserRound size={14} aria-hidden="true" /><b>{a.actor}</b><span>{role}</span></div>
      <button type="button" className="audit-detail-toggle" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'Hide saved details':'View saved details'}<ChevronDown size={14} aria-hidden="true" /></button>
      {open&&<dl className="audit-saved-details"><div><dt>Activity type</dt><dd>{a.type}</dd></div><div><dt>Performed by</dt><dd>{a.actor} · {role}</dd></div><div><dt>Saved action</dt><dd>{a.action}</dd></div><div><dt>Record reference</dt><dd>{entry.id || 'Not recorded'}</dd></div></dl>}
    </div>
  </article>;
}
