// Opt-in isolated-schema integration tests. Never use production credentials.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import express from 'express';
import cookieParser from 'cookie-parser';

if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a disposable local PostgreSQL database');
const url=new URL(process.env.TEST_DATABASE_URL);
if (!['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('These integration tests require a local database');
const admin=new pg.Pool({connectionString:url.href});
const schema=`test_schedule_${crypto.randomUUID().replaceAll('-','')}`;
await admin.query(`CREATE SCHEMA ${schema}`);
url.searchParams.set('options',`-c search_path=${schema},public`);
process.env.DATABASE_URL=url.href;
const {query,pool}=await import('../db.js');
await query(readFileSync(new URL('../database/schema.sql',import.meta.url),'utf8'));
const {ensureSchedulingSchema}=await import('../database/schedulingSchema.js');
await ensureSchedulingSchema();
const {clinicClock,shiftDate}=await import('../scheduling.js');
const {holidayName}=await import('../../src/booking.js');
const {sha256}=await import('../security.js');
const {clinicRouter}=await import('../routes/clinic.js');
const {jobsRouter}=await import('../routes/jobs.js');
const {processReminders,reconcileReminders}=await import('../reminders.js');
const {UncertainDelivery}=await import('../reminderDelivery.js');
const app=express();app.use(express.json());app.use(cookieParser());app.use('/api/jobs',jobsRouter);app.use('/api',clinicRouter);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
after(async()=>{await new Promise(r=>server.close(r));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
const req=async(role,method,path,body)=>{
 const res=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{'Content-Type':'application/json',...(role?{Authorization:`Bearer test-${role}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {status:res.status,data:await res.json()};
};
for(const role of ['owner','assistant','vet','admin']){
 await query(`INSERT INTO users(id,first_name,last_name,birthday,password_hash,email,role,vet_id,owner_id,mobile_number,email_verified_at,mobile_verified) VALUES($1,'Test',$2,'1990-01-01','unused',$3,$2,$4,$5,'+639000000000',NOW(),true)`,[`u_${role}`,role,`${role}@example.invalid`,role==='vet'?'v1':null,role==='owner'?'o1':null]);
 await query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL \'1 day\')',[sha256(`test-${role}`),`u_${role}`]);
}
await query("INSERT INTO owners(id,name,email,phone,address) VALUES('o1','Synthetic Owner','owner@example.invalid','+639000000000','Synthetic'),('o2','Other Owner','other@example.invalid','+639000000001','Synthetic')");
for(let i=1;i<=8;i++)await query("INSERT INTO pets(id,owner_id,name,birth) VALUES($1,$2,$3,'2020-01-01')",[`p${i}`,i===8?'o2':'o1',`Synthetic ${i}`]);
let date=shiftDate(clinicClock().date,1);while(holidayName(date))date=shiftDate(date,1);
const booking=patch=>({petId:'p1',vetId:'v1',date,time:'10:00',service:'surgery',reason:'Procedure assessment',...patch});

test('PostgreSQL booking races, duration, editing, availability privacy and arrival exceptions',async()=>{
 const results=await Promise.all([req('owner','POST','/appointments',booking({petId:'p1'})),req('assistant','POST','/appointments',booking({petId:'p2'}))]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const saved=results.find(r=>r.status===200).data.appointment;
 assert.equal(saved.durationMinutes,120);
 assert.equal((await query("SELECT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid='vaccination_reminders'::regclass")).rows[0].nspname,schema);
 await query("UPDATE appointments SET status='Confirmed',amount=775 WHERE id=$1",[saved.id]);
 const note=await req('owner','PUT',`/appointments/${saved.id}`,{notes:'Synthetic unchanged slot',amount:-99});
 assert.equal(note.status,200);assert.equal(note.data.appointment.status,'Confirmed');assert.equal(note.data.appointment.amount,775);
 assert.equal((await req('assistant','POST','/appointments',booking({petId:'p3',time:'11:30',service:'vaccination'}))).status,409);
 const next=await req('assistant','POST','/appointments',booking({petId:'p3',time:'12:00',service:'vaccination'}));assert.equal(next.status,200);
 const edited=await req('assistant','PUT',`/appointments/${saved.id}`,booking({petId:saved.petId,time:'10:00'}));assert.equal(edited.status,200,JSON.stringify(edited));
 const available=await req('owner','GET',`/appointments/availability?date=${date}&vetId=v1&service=checkup`);
 assert.deepEqual(Object.keys(available.data),['slots']);assert.ok(!available.data.slots.includes('11:00'));assert.ok(available.data.slots.includes('12:30'));
 const walk=await req('assistant','POST','/appointments',booking({petId:'p4',bookingKind:'walk-in',date:'1900-01-01',time:'00:00'}));assert.equal(walk.status,200);assert.equal(walk.data.appointment.bookingKind,'walk-in');assert.equal(walk.data.appointment.date,clinicClock().date);
 const duplicate=await req('assistant','POST','/appointments',booking({petId:'p4',bookingKind:'walk-in'}));assert.equal(duplicate.status,409);
 assert.equal((await req('owner','POST','/appointments',booking({petId:'p8'}))).status,404);
});

const vaccine=async(id,due,extra={})=>{
 await query(`INSERT INTO vaccinations(id,pet_id,card_id,vaccine,date,next_due,done,vet_id,created_at) VALUES($1,$2,'VACC-SYNTHETIC',$3,$4,$5,$6,$7,$8)`,[id,extra.pet||'p1',extra.vaccine||'Rabies',extra.date||'2026-01-01',due,extra.done??true,extra.vet??'v1',extra.created||'2026-01-01T00:00:00Z']);
};
const when=new Date('2026-10-24T02:00:00Z');
test('durable reminders create exactly 30/14/3 milestones per channel from certified doses',async()=>{
 await vaccine('dose',shiftDate('2026-10-24',30));
 await vaccine('placeholder',shiftDate('2026-10-24',30),{pet:'p2',done:false,vet:''});
 await Promise.all([reconcileReminders(when),reconcileReminders(when)]);
 const jobs=(await query('SELECT * FROM vaccination_reminders ORDER BY milestone DESC,channel')).rows;
 assert.equal(jobs.length,6);assert.deepEqual([...new Set(jobs.map(j=>j.milestone))],[30,14,3]);
 assert.ok(jobs.every(j=>j.vaccination_id==='dose'));assert.equal(new Date(jobs[0].scheduled_at).toISOString(),'2026-10-24T01:00:00.000Z');
});
test('concurrent/restarted workers claim each channel once and retain provider acceptance',async()=>{
 let sent=0;const deliver=async()=>{sent++;return{provider:'synthetic',id:'accepted-test'}};
 const r=await Promise.all([processReminders({now:when,deliver}),processReminders({now:when,deliver})]);
 assert.equal(sent,2);assert.equal(r.reduce((n,r)=>n+r.accepted,0),2);
 await processReminders({now:when,deliver});assert.equal(sent,2);
 assert.equal((await query("SELECT COUNT(*)::int n FROM vaccination_reminders WHERE status='accepted'")).rows[0].n,2);
});
test('known rejections retry durably with backoff; unknown submissions stop for staff',async()=>{
 await vaccine('retry',shiftDate('2026-10-24',14),{pet:'p3'});
 const first=await processReminders({now:when,deliver:async(channel)=>{if(channel==='sms')throw new UncertainDelivery('synthetic timeout');throw new Error('rejected');}});
 assert.equal(first.retrying,1);assert.equal(first.uncertain,1);
 const retry=(await query("SELECT * FROM vaccination_reminders WHERE vaccination_id='retry' AND milestone=14 AND channel='email'")).rows[0];
 assert.equal(retry.attempts,1);assert.equal(new Date(retry.next_attempt_at).toISOString(),'2026-10-24T02:15:00.000Z');
 let calls=0;await processReminders({now:when,deliver:async()=>{calls++;}});assert.equal(calls,0);
 await processReminders({now:new Date('2026-10-24T02:16Z'),deliver:async()=>({provider:'synthetic'})});
 assert.equal((await query("SELECT status FROM vaccination_reminders WHERE id=$1",[retry.id])).rows[0].status,'accepted');
});
test('new doses retire old reminders even without a next date; crash recovery never blindly resends',async()=>{
 await vaccine('new-dose',null,{date:'2026-10-24',created:'2026-10-24T02:00Z'});
 await query("UPDATE vaccination_reminders SET status='sending',claimed_at='2026-10-24T01:00Z' WHERE vaccination_id='retry' AND milestone=3 AND channel='email'");
 await reconcileReminders(when);
 assert.equal((await query("SELECT COUNT(*)::int n FROM vaccination_reminders WHERE vaccination_id='dose' AND status='pending'")).rows[0].n,0);
 assert.equal((await query("SELECT status FROM vaccination_reminders WHERE vaccination_id='retry' AND milestone=3 AND channel='email'")).rows[0].status,'uncertain');
});
test('job endpoint rejects missing secret/unauthorized caller and status is staff-only',async()=>{
 delete process.env.CRON_SECRET;
 assert.equal((await req(null,'GET','/jobs/vaccination-reminders')).status,503);
 process.env.CRON_SECRET='synthetic-job-secret';
 assert.equal((await req(null,'GET','/jobs/vaccination-reminders')).status,401);
 assert.equal((await req('owner','GET','/reminders/status')).status,403);
 const staff=await req('assistant','GET','/reminders/status');assert.equal(staff.status,200);assert.ok(staff.data.attention.length>0);
});

test('missed daily runs catch up the current milestone and skip expired earlier ones',async()=>{
 await vaccine('catchup',shiftDate('2026-10-24',30),{pet:'p5'});
 await reconcileReminders(new Date('2026-10-25T02:00Z'));
 assert.equal((await query("SELECT COUNT(*)::int n FROM vaccination_reminders WHERE vaccination_id='catchup' AND milestone=30 AND status='pending'")).rows[0].n,2);
 // At 14 days, the obsolete 30-day attempts are retired and the next pair is due.
 const phase=new Date('2026-11-09T02:00Z');
 const messages=[];
 await processReminders({now:phase,deliver:async(c,r,m)=>{messages.push(m);return{provider:'synthetic'}}});
 const rows=(await query("SELECT * FROM vaccination_reminders WHERE vaccination_id='catchup'")).rows;
 assert.ok(rows.filter(r=>r.milestone===30).every(r=>r.status==='cancelled'));
 assert.ok(rows.filter(r=>r.milestone===14).every(r=>r.status==='accepted'));
 assert.ok(rows.filter(r=>r.milestone===3).every(r=>r.status==='pending'));
 await processReminders({now:new Date('2026-11-20T02:00Z'),deliver:async()=>({provider:'synthetic'})});
 assert.equal((await query("SELECT COUNT(*)::int n FROM vaccination_reminders WHERE vaccination_id='catchup' AND milestone=3 AND status='accepted'")).rows[0].n,2);
});
test('five explicit provider rejections stop retries and surface a failed job',async()=>{
 await vaccine('permanent-rejection',shiftDate('2026-10-24',3),{pet:'p6'});
 let instant=when;
 for(let i=0;i<5;i++){
  await processReminders({now:instant,deliver:async()=>{throw new Error('synthetic rejection')}});
  instant=new Date(instant.getTime()+4*3600000);
 }
 const jobs=(await query("SELECT * FROM vaccination_reminders WHERE vaccination_id='permanent-rejection' AND milestone=3")).rows;
 assert.equal(jobs.length,2);assert.ok(jobs.every(r=>r.status==='failed' && r.attempts===5));
});
