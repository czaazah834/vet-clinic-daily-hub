import { useRef, useState } from 'react';
import { useClinicRead } from '../useClinicRead.js';
import { api } from '../api.js';

export function useAdminStaff() {
  return useClinicRead('/api/admin/staff', 15000);
}
export default function AdminStaff({onInvite}) {
  const {data,error,loading,load}=useAdminStaff();
  const [filter,setFilter]=useState(''),[target,setTarget]=useState(null),[reason,setReason]=useState(''),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState(''),[notice,setNotice]=useState('');
  const busy=useRef(false);
  const choose=(person,action)=>{setTarget({...person,action});setReason('');setSaveError('');setNotice('');};
  const save=async e=>{
    e.preventDefault();if(busy.current)return;busy.current=true;setSaving(true);setSaveError('');
    try{
      const path=target.action==='revoke'?`/api/admin/invitations/${encodeURIComponent(target.id)}/revoke`:`/api/admin/staff/${encodeURIComponent(target.id)}/access`;
      const result = await api.post(path,{action:target.action,revision:target.revision,reason});
      if (result?.success !== true) throw Error("The server did not confirm this access change. Refresh staff to check its current status.");
      setNotice(target.action==='revoke'?'Invitation revoked.':`${target.name}: ${target.action} saved. Existing sessions were revoked; the staff member must sign in again.`);setTarget(null);await load();
    }catch(e){setSaveError(e.message);}finally{busy.current=false;setSaving(false);}
  };
  const staff=(data?.staff||[]).filter(u=>`${u.name} ${u.email} ${u.role} ${u.vetId||''}`.toLowerCase().includes(filter.toLowerCase()));
  return <>
    <section className="card" style={{overflowWrap:'anywhere'}}>
      <h2>Staff access</h2>
      <p>Invite a veterinarian or assistant, review their verification status, and manage access. Deactivation retains their patient and financial history. Reception handles scheduling and patient intake.</p>
      <div className="row" style={{gap:12,flexWrap:'wrap'}}><button className="btn gold" onClick={onInvite}>Invite staff</button><button className="btn ghost" disabled={loading} onClick={()=>load()}>{loading ? "Refreshing…" : "Refresh staff"}</button><input aria-label="Search staff" placeholder="Search name, email or doctor ID" value={filter} onChange={e=>setFilter(e.target.value)} /></div>
      {error&&<p role="alert">{error} {data && 'Showing the last loaded staff status.'}</p>}{notice&&<p role="status">{notice}</p>}
      {loading&&<p role="status">{data ? "Refreshing staff status…" : "Loading staff accounts…"}</p>}
      {data&&!staff.length&&<p>{filter.trim() ? "No staff accounts match this search." : "No staff accounts yet. Invite staff to begin onboarding."}</p>}
      {staff.map(u=><article className="card" key={u.id} style={{marginTop:12,padding:16}}>
        <h3>{u.name}</h3><p>{u.email} · {u.role==='vet'?'Veterinarian':'Vet Assistant'}{u.vetId?` · Doctor ID: ${u.vetId}`:''}</p>
        <p><b>{!u.active?'Inactive':u.locked?'Locked':'Active'}</b> · {u.mobileVerified?'Mobile verified':'Awaiting mobile verification'}</p>
        {u.reason&&<p>Last access reason: {u.reason}</p>}
        <div className="row" style={{gap:8,flexWrap:'wrap'}}>
          <button className="btn ghost sm" style={{whiteSpace:'normal',textAlign:'left',maxWidth:'100%'}} onClick={()=>choose(u,u.active?'deactivate':'reactivate')}>{u.active?'Deactivate':'Reactivate'} {u.name}</button>
          {u.active&&u.locked&&<button className="btn sm" style={{whiteSpace:'normal',textAlign:'left',maxWidth:'100%'}} onClick={()=>choose(u,'unlock')}>Unlock {u.name}</button>}
        </div>
      </article>)}
    </section>
    <section className="card" style={{marginTop:16,overflowWrap:'anywhere'}}><h3>Recent staff invitations</h3><p>Pending links expire after seven days. Revoking a link prevents it from being used; invite again if a replacement is needed. Account creation still requires the invited staff member to verify their mobile number.</p>
      {data&&!data.invitations.length&&<p>No invitations yet.</p>}
      {(data?.invitations||[]).map(i=><article key={i.id} style={{padding:'12px 0',borderBottom:'1px solid #e2e8f0'}}><b>{i.name}</b><p>{i.email} · {i.role} · {i.status} · Expires {new Date(i.expiresAt).toLocaleString()}</p>{i.status==='Pending'&&<button className="btn ghost sm" style={{whiteSpace:'normal',textAlign:'left',maxWidth:'100%'}} onClick={()=>choose(i,'revoke')}>Revoke invitation for {i.name}</button>}</article>)}
    </section>
    {target&&<div className="scrim"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="access-title" style={{width:'min(540px,100%)',overflowWrap:'anywhere'}}>
      <h3 id="access-title">{target.action[0].toUpperCase()+target.action.slice(1)}: {target.name}</h3>
      <p>{target.action==='deactivate'?'This staff member will lose portal access. Reception must review and reassign their upcoming visits.':target.action==='reactivate'?'Portal access is restored; they must sign in again. Existing account locks and mobile verification requirements still apply.':target.action==='unlock'?'Clear failed sign-in attempts and require a fresh login. Verification requirements still apply.':'This invitation link will no longer work.'}</p>
      <form onSubmit={save}><label>Reason<textarea aria-label="Access change reason" required maxLength={300} value={reason} onChange={e=>setReason(e.target.value)} disabled={saving}/></label>
        {saveError&&<p role="alert">{saveError}</p>}
        <div className="row end" style={{gap:8,flexWrap:'wrap'}}><button type="button" className="btn ghost" disabled={saving} onClick={()=>setTarget(null)}>Cancel</button><button className="btn gold" disabled={saving||!reason.trim()}>{saving?'Saving…':'Save access change'}</button></div>
      </form>
    </div></div>}
  </>;
}

export function AdminAudit() {
  const [search,setSearch]=useState(''),[query,setQuery]=useState('');
  const {data,error,loading,load} = useClinicRead('/api/admin/audit?search=');
  const loadHistory = (cursor = null, term = query) => load(
    `/api/admin/audit?search=${encodeURIComponent(term)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    (old, result) => ({...result, entries: cursor ? [...(old?.entries || []), ...result.entries] : result.entries, searchTerm: term})
  );
  return <section className="card"><h2>System audit trail</h2><p>Search saved activity across the clinic. Older entries can be loaded without changing any clinical or financial records.</p>
    <form className="row" style={{gap:8,flexWrap:'wrap'}} onSubmit={e=>{e.preventDefault();if(loading)return;setQuery(search);loadHistory(null,search);}}><input aria-label="Search audit history" maxLength={100} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search action, actor or role"/><button className="btn" disabled={loading}>Search history</button><button type="button" className="btn ghost" disabled={loading} onClick={()=>loadHistory()}>Refresh history</button></form>
    {error&&<p role="alert">{error} {data && "Previously loaded results remain below."}</p>}
    {data&&<p>Showing results for: {data.searchTerm || "All activity"}</p>}
    {data&&!data.entries.length&&<p>No matching audit entries.</p>}
    {(data?.entries||[]).map(l=><article key={l.id} style={{padding:'12px 0',borderBottom:'1px solid #e2e8f0',overflowWrap:'anywhere'}}><b>{l.action}</b><p>{l.actor} · {l.role} · {new Date(l.at).toLocaleString()}</p></article>)}
    {loading&&<p role="status">Loading audit history…</p>}
    {data?.nextCursor&&query===(data.searchTerm || '')&&<button className="btn ghost" disabled={loading} onClick={()=>loadHistory(data.nextCursor)}>Load older entries</button>}
  </section>;
}
