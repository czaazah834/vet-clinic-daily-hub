import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import express from 'express';
import cookieParser from 'cookie-parser';
import { intakeVisitSnapshot } from '../../src/intakeVisit.js';

if (!process.env.TEST_DATABASE_URL) throw Error('Set TEST_DATABASE_URL to a disposable local PostgreSQL database');
const url = new URL(process.env.TEST_DATABASE_URL);
if (!['localhost','127.0.0.1'].includes(url.hostname)) throw Error('Use a local disposable database.');
const admin = new pg.Pool({connectionString:url.href});
const schema = `test_admissions_${crypto.randomUUID().replaceAll('-','')}`;
await admin.query(`CREATE SCHEMA ${schema}`);
url.searchParams.set('options',`-c search_path=${schema},public`); process.env.DATABASE_URL = url.href;
const {query,pool} = await import('../db.js');
await query(readFileSync(new URL('../database/schema.sql',import.meta.url),'utf8'));
const {sha256} = await import('../security.js');
const {clinicRouter} = await import('../routes/clinic.js');
const app = express(); app.use(express.json()); app.use(cookieParser()); app.use('/api',clinicRouter);
const server = app.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve));
after(async () => { await new Promise(resolve => server.close(resolve)); await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
for (const role of ['owner','other-owner','assistant','vet','other-vet','admin']) {
  const actual = role.replace('other-','');
  await query("INSERT INTO users(id,first_name,last_name,birthday,password_hash,email,role,owner_id,vet_id,mobile_number,email_verified_at,mobile_verified) VALUES($1,'Synthetic',$2,'1990-01-01','unused',$3,$4,$5,$6,'+639170000001',NOW(),true)",[`admission-${role}`,role,`${role}@example.invalid`,actual,actual==='owner'?role:null,actual==='vet'?role:null]);
  await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '2 days')",[sha256(`admission-${role}`),`admission-${role}`]);
}
await query("INSERT INTO owners(id,name,email,phone,address) VALUES('owner','Synthetic owner','owner@example.invalid','+639170000001','Synthetic address'),('other-owner','Other owner','other@example.invalid','+639170000002','Synthetic address')");
const call = async (role,method,path,body) => {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admissions${path}`,{method,headers:{'Content-Type':'application/json',...(role?{Authorization:`Bearer admission-${role}`}:{})},...(body ? {body:JSON.stringify(body)} : {})});
  return {status:response.status,data:await response.json()};
};
const fixture = async (status='In consultation', petId=crypto.randomUUID()) => {
  await query("INSERT INTO pets(id,owner_id,name,species,birth,weight) VALUES($1,'owner','Synthetic patient','Dog','2020-01-01',10) ON CONFLICT DO NOTHING",[petId]);
  const visit = (await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status,intake_vitals) VALUES($1,$2,'vet','2026-10-25','09:00','Synthetic visit',$3,'{\"temp\":38.5,\"weight\":10}') RETURNING *",[crypto.randomUUID(),petId,status])).rows[0];
  if (status==='Completed') await query("INSERT INTO consultations(id,pet_id,vet_id,appt_id,date,symptoms,objective,diagnosis,treatment) VALUES($1,$2,'vet',$3,'2026-10-25','Recorded history','Recorded exam','Vet diagnosis','Vet treatment')",[crypto.randomUUID(),petId,visit.id]);
  return {visit,body:{requestId:crypto.randomUUID(),apptId:visit.id,expectedVisit:intakeVisitSnapshot(visit),clinicalNote:'Private admission reason',carePlan:'Private veterinarian care plan',ownerUpdate:'Your pet is staying for observation.'}};
};
const admit = async status => {
  const f = await fixture(status); const response = await call('vet','POST','',f.body);
  assert.equal(response.status,200,JSON.stringify(response)); return {...f,admission:response.data.admission};
};
const update = (revision=0,extra={}) => ({requestId:crypto.randomUUID(),revision,clinicalNote:'Private staff observation',ownerUpdate:'Your pet has been checked by clinic staff.',measurements:{temp:38.6,weight:10.1},...extra});

test('admission creation enforces assigned veterinarian, active consultation, snapshot and one active stay',async () => {
  const f = await fixture();
  assert.equal((await call(null,'POST','',f.body)).status,401);
  for (const role of ['owner','other-owner','assistant','admin','other-vet']) assert.equal((await call(role,'POST','',f.body)).status,403,role);
  assert.equal((await call('vet','POST','',{...f.body,expectedVisit:{...f.body.expectedVisit,status:'Checked-in'}})).status,409);
  const first = await call('vet','POST','',f.body); assert.equal(first.status,200,JSON.stringify(first));
  assert.equal((await call('vet','POST','',f.body)).status,200,'create replay is confirmed');
  assert.equal((await call('vet','POST','',{...f.body,ownerUpdate:'Different text'})).status,409,'conflicting ID reuse rejected');
  assert.equal((await call('vet','POST','',{...f.body,requestId:crypto.randomUUID()})).status,409,'duplicate visit rejected');
  const other = await fixture('In consultation',f.visit.pet_id);
  assert.equal((await call('vet','POST','',other.body)).status,409,'duplicate active pet rejected across visits');
  const scheduled = await fixture('Scheduled');
  assert.equal((await call('vet','POST','',scheduled.body)).status,409);
  const eligible = await call('vet','GET','/eligible'); assert.equal(eligible.status,200); assert.ok(!eligible.data.visits.some(row=>row.petId===f.visit.pet_id));
  assert.equal((await query('SELECT count(*)::int n FROM admission_updates WHERE admission_id=$1',[f.body.requestId])).rows[0].n,1);
});
test('owners see only their own shared updates; assistants cannot change clinical plans or discharge',async () => {
  const f = await admit(); const path = `/${f.admission.id}`;
  for (const role of ['owner','assistant','admin']) assert.equal((await call(role,'GET',path)).status,200,role);
  for (const role of ['owner','assistant','admin','other-owner']) assert.equal((await call(role,'GET','/eligible')).status,403,role);
  for (const role of ['other-owner','other-vet']) assert.equal((await call(role,'GET',path)).status,404,role);
  const foreign = await call('other-owner','GET',''); assert.equal(foreign.data.total,0);
  const privateNote = update(0,{ownerUpdate:'',clinicalNote:'Never send this internal note to the owner.'});
  assert.equal((await call('assistant','POST',`${path}/update`,privateNote)).status,200);
  for (const body of [update(1,{carePlan:'Spoofed plan'}),update(1,{dischargeInstructions:'Spoofed discharge'})]) assert.equal((await call('assistant','POST',`${path}/update`,body)).status,403);
  for (const role of ['assistant','owner','admin','other-vet']) assert.equal((await call(role,'POST',`${path}/discharge`,update(1,{dischargeInstructions:'Go home'}))).status,403,role);
  const shared = update(1,{clinicalNote:'Private temperature interpretation',ownerUpdate:'A clinic staff member checked your pet.'});
  assert.equal((await call('assistant','POST',`${path}/update`,shared)).status,200);
  const owner = await call('owner','GET',path);
  assert.equal(owner.data.updates.length,2,'private-only entry omitted');
  const serialized = JSON.stringify(owner.data);
  for (const secret of ['Private','Never send','clinicalNote','clinical_note','carePlan','measurements','request_payload','revision','ownerName']) assert.ok(!serialized.includes(secret),secret);
  const list = await call('owner','GET','');
  assert.ok(!JSON.stringify(list.data).includes('Private'));
  assert.equal((await call('vet','GET',path)).data.admission.carePlan,'Private veterinarian care plan');
});
test('revision conflicts, safe retries and audit failures cannot duplicate or partially save observations',async () => {
  const f = await admit(); const path = `/${f.admission.id}`;
  const bodies = [update(),update()];
  const results = await Promise.all(bodies.map(body=>call('assistant','POST',`${path}/update`,body)));
  assert.deepEqual(results.map(row=>row.status).sort(),[200,409]);
  const winner = bodies[results.findIndex(row=>row.status===200)];
  assert.equal((await call('assistant','POST',`${path}/update`,winner)).status,200,'lost response retry is idempotent');
  assert.equal((await call('assistant','POST',`${path}/update`,{...winner,clinicalNote:'Different note'})).status,409);
  const changedPlan = update(1,{carePlan:'New vet monitoring instructions'});
  assert.equal((await call('vet','POST',`${path}/update`,changedPlan)).status,200);
  assert.equal((await call('vet','GET',path)).data.admission.carePlan,changedPlan.carePlan);
  await query("CREATE FUNCTION reject_admission_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'Updated admission%' THEN RAISE EXCEPTION 'Synthetic admission audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_admission_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_admission_audit()");
  try { assert.equal((await call('assistant','POST',`${path}/update`,update(2))).status,500); }
  finally { await query('DROP TRIGGER reject_admission_audit ON audit_logs'); }
  const after = (await call('vet','GET',path)).data;
  assert.equal(after.admission.revision,2); assert.equal(after.updates.length,3);
  for (const measurements of [{temp:NaN},{temp:46},{weight:-1},{weight:'10'},{condition:'Stable'},[]]) assert.equal((await call('assistant','POST',`${path}/update`,update(2,{measurements}))).status,400);
});
test('only finalized SOAP permits discharge; clinical status and payment stay separate; discharge replay is safe',async () => {
  const unfinished = await admit();
  assert.equal((await call('vet','POST',`/${unfinished.admission.id}/discharge`,update(0,{dischargeInstructions:'Home care'}))).status,409);
  const f = await admit('Completed'), path = `/${f.admission.id}`;
  await query("UPDATE appointments SET billing_status='Paid' WHERE id=$1",[f.visit.id]);
  assert.equal((await call('owner','GET',path)).data.admission.status,'Admitted','payment does not discharge');
  const body = update(0,{dischargeInstructions:'Follow the veterinarian’s home-care instructions.'});
  assert.equal((await call('vet','POST',`${path}/discharge`,body)).status,200);
  assert.equal((await call('vet','POST',`${path}/discharge`,body)).status,200,'discharge retry is idempotent');
  const result = (await call('owner','GET',path)).data;
  assert.equal(result.admission.status,'Discharged'); assert.ok(result.admission.dischargedAt);
  assert.equal(result.admission.dischargeInstructions,body.dischargeInstructions);
  assert.ok(result.updates.some(row=>row.kind==='Discharge' && row.ownerUpdate.includes(body.dischargeInstructions)));
  assert.equal((await call('assistant','POST',`${path}/update`,update(1))).status,409);
  assert.equal((await call('vet','POST',`${path}/discharge`,update(1,{dischargeInstructions:'Second discharge'}))).status,409);
  assert.equal((await query('SELECT count(*)::int n FROM admission_updates WHERE admission_id=$1',[f.admission.id])).rows[0].n,2);
  assert.ok((await call('owner','GET','?status=Discharged')).data.admissions.some(row=>row.id===f.admission.id));
  const repeat = await fixture('In consultation',f.visit.pet_id);
  assert.equal((await call('vet','POST','',repeat.body)).status,200,'a new visit can start a later stay');
});
test('timeline pagination preserves sub-millisecond ordering and filters private events before paging',async () => {
  const f = await admit(); const path = `/${f.admission.id}`;
  await query(`INSERT INTO admission_updates(id,admission_id,kind,clinical_note,owner_update,actor_id,actor_name,actor_role,request_payload,created_at)
    SELECT gen_random_uuid(),$1,'Observation','Internal note '||g,CASE WHEN g%2=0 THEN 'Shared message '||g ELSE '' END,'admission-assistant','Synthetic assistant','assistant','{}',TIMESTAMPTZ '2026-10-25 01:00:00+00'+g*INTERVAL '1 microsecond' FROM generate_series(1,130) g`,[f.admission.id]);
  for (const [role,total] of [['vet',131],['owner',66]]) {
    const ids = []; let cursor;
    do {
      const response = await call(role,'GET',`${path}${cursor ? `?before=${cursor}` : ''}`); assert.equal(response.status,200);
      ids.push(...response.data.updates.map(row=>row.id)); cursor=response.data.nextCursor;
    } while(cursor);
    assert.equal(ids.length,total); assert.equal(new Set(ids).size,total);
  }
  assert.equal((await call('owner','GET',`${path}?before=invalid`)).status,400);
});

test('a veterinarian with a signed consultation and admitted patient cannot be deactivated',async () => {
  await query("INSERT INTO users(id,first_name,last_name,birthday,password_hash,email,role,vet_id,mobile_number,email_verified_at,mobile_verified) VALUES('guard-vet','Synthetic','Guard','1990-01-01','unused','guard@example.invalid','vet','guard-vet','+639170000001',NOW(),true)");
  await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,'guard-vet',NOW()+INTERVAL '2 days')",[sha256('admission-guard-vet')]);
  const f = await fixture('Completed');
  await query("UPDATE appointments SET vet_id='guard-vet' WHERE id=$1",[f.visit.id]);
  f.body.expectedVisit.vetId='guard-vet';
  const admitted = await call('guard-vet','POST','',f.body); assert.equal(admitted.status,200,JSON.stringify(admitted));
  const access = async () => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/staff/guard-vet/access`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer admission-admin'},body:JSON.stringify({action:'deactivate',revision:0,reason:'Synthetic access check'})});
    return {status:response.status,data:await response.json()};
  };
  const blocked = await access(); assert.equal(blocked.status,409,JSON.stringify(blocked)); assert.match(blocked.data.error,/admissions/);
  assert.equal((await query("SELECT is_active FROM users WHERE id='guard-vet'")).rows[0].is_active,true);
  assert.equal((await call('guard-vet','POST',`/${admitted.data.admission.id}/discharge`,update(0,{dischargeInstructions:'Vet-approved home-care instructions'}))).status,200);
  assert.equal((await access()).status,200,'deactivation allowed after care ends');
});
