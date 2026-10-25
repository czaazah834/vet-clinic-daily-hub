import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changeAppointmentStatus} from '../src/appointmentStatus.js';
const visit={id:'visit',petId:'pet',vetId:'vet',date:'2026-10-25',time:'10:00',reason:'Examination',status:'Pending Approval',notes:'Keep these notes'};
const store=()=>{let state={appts:[{...visit},{...visit,id:'other'}]};return {get:()=>state,set:up=>state=up(state)};};
const response=(status='Scheduled',extra={})=>({success:true,appointment:{id:'visit',pet_id:'pet',vet_id:'vet',date:'2026-10-25',time:'10:00',reason:'Saved examination',status,intake_vitals:null,...extra}});
test('duplicate cross-view status actions share one request and lock by appointment',async()=>{
 const s=store();let release,calls=0;
 const request=async()=>{calls++;return new Promise(r=>release=r)};
 const pending=changeAppointmentStatus(s.set,'visit','Scheduled',()=>{},visit,request);
 assert.equal(await changeAppointmentStatus(s.set,'visit','Scheduled',()=>{},visit,request),false);assert.equal(calls,1);
 release(response());assert.equal(await pending,true);assert.equal(s.get().appts[0].status,'Scheduled');
});
test('requests carry their baseline and apply saved values without losing unrelated records',async()=>{
 const s=store();let sent;
 const request=async(...args)=>{sent=args;return response()};
 assert.equal(await changeAppointmentStatus(s.set,'visit','Scheduled',()=>{},visit,request),true);
 assert.equal(sent[0],'PATCH');assert.equal(sent[2].expectedVisit.status,'Pending Approval');assert.equal(sent[2].expectedVisit.petId,'pet');
 assert.equal(s.get().appts[0].reason,'Saved examination');assert.equal(s.get().appts[0].notes,'Keep these notes');assert.equal(s.get().appts[1].status,'Pending Approval');
});
test('failures release the lock and unconfirmed responses cannot change local state',async()=>{
 const s=store();let error;
 for(const result of [{success:true},response('Pending Approval'),response('Scheduled',{id:'wrong'}),response('Scheduled',{pet_id:'wrong'}),{...response(),success:false}]) {
  assert.equal(await changeAppointmentStatus(s.set,'visit','Scheduled',e=>error=e,visit,async()=>result),false);assert.equal(s.get().appts[0].status,'Pending Approval');
 }
 assert.match(error,/did not confirm/);
 assert.equal(await changeAppointmentStatus(s.set,'visit','Scheduled',e=>error=e,visit,async()=>{throw Error('Offline')}),false);assert.equal(error,'Offline');
 assert.equal(await changeAppointmentStatus(s.set,'visit','Scheduled',()=>{},visit,async()=>response()),true);
});
test('an older acknowledgment cannot replace a newer local visit or resurrect a removed visit',async()=>{
 const s=store();let release;
 const pending=changeAppointmentStatus(s.set,'visit','Scheduled',()=>{},visit,async()=>new Promise(r=>release=r));
 s.set(p=>({...p,appts:p.appts.map(a=>a.id==='visit'?{...a,status:'In consultation'}:a)}));release(response());assert.equal(await pending,true);assert.equal(s.get().appts[0].status,'In consultation');
 s.set(p=>({...p,appts:p.appts.filter(a=>a.id!=='visit')}));
 assert.equal(await changeAppointmentStatus(s.set,'visit','Scheduled',()=>{},visit,async()=>response()),true);assert.equal(s.get().appts.length,1);
});
test('legacy helper calls without a snapshot still require an acknowledged status change',async()=>{
 const s=store();let body;
 assert.equal(await changeAppointmentStatus(s.set,'visit','In consultation',()=>{},undefined,async(m,p,b)=>{body=b;return response('In consultation')}),true);
 assert.deepEqual(body,{status:'In consultation'});assert.equal(s.get().appts[0].status,'In consultation');
});
test('cancellation forwards the reviewed reason and retains the server reason',async()=>{
 const s=store();let sent;
 const request=async(m,p,b)=>{sent=b;return response('Cancelled',{cancel_reason:'Schedule conflict'})};
 assert.equal(await changeAppointmentStatus(s.set,'visit','Cancelled',()=>{},visit,request,{cancelReason:'Schedule conflict'}),true);
 assert.equal(sent.cancelReason,'Schedule conflict');assert.equal(sent.expectedVisit.status,'Pending Approval');
 assert.equal(s.get().appts[0].cancelReason,'Schedule conflict');
});
