import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import express from 'express';
import cookieParser from 'cookie-parser';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
if(!process.env.TEST_DATABASE_URL)throw Error('Set TEST_DATABASE_URL to a disposable local database');
const url=new URL(process.env.TEST_DATABASE_URL);if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Local database required');
const admin=new pg.Pool({connectionString:url.href}),schema=`test_cards_${crypto.randomUUID().replaceAll('-','')}`;
await admin.query(`CREATE SCHEMA ${schema}`);url.searchParams.set('options',`-c search_path=${schema},public`);process.env.DATABASE_URL=url.href;
const {query,pool}=await import('../db.js');
const sql=name=>readFileSync(new URL(`../database/${name}.sql`,import.meta.url),'utf8');
await query(sql('schema'));await query(sql('appointment-status'));
const {ensurePetRegistrationSchema}=await import('../petRegistration.js');await ensurePetRegistrationSchema();
const {sha256}=await import('../security.js');
for(const role of ['owner','other-owner','assistant','vet','other-vet','admin']){
 const actual=role.replace('other-','');
 await query("INSERT INTO users(id,first_name,last_name,birthday,password_hash,email,role,owner_id,vet_id,mobile_number,email_verified_at,mobile_verified) VALUES($1,'Synthetic',$1,'1990-01-01','unused',$2,$3,$4,$5,'+639170000001',NOW(),true)",[role,`${role}@example.invalid`,actual,actual==='owner'?role:null,actual==='vet'?role:null]);
 await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 day')",[sha256(role),role]);
}
await query("INSERT INTO owners(id,name,email,phone,address) VALUES('owner','Synthetic owner','owner@example.invalid','+639170000001','Synthetic'),('other-owner','Other owner','other@example.invalid','+639170000002','Synthetic')");
await query("INSERT INTO pets(id,owner_id,name,species,birth,weight,vaccination_card_id) VALUES('legacy-card','owner','Legacy patient','Dog','2020-01-01',10,'EXISTING-CARD-ID'),('legacy-empty','owner','Missing reference','Dog','2020-01-01',10,NULL)");
await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status) VALUES('legacy-visit','legacy-card','vet','2025-01-01','09:00','Historical exam','Completed')");
await query("INSERT INTO vaccinations(id,pet_id,card_id,vaccine,date,done) VALUES('historic-dose','legacy-card','EXISTING-CARD-ID','Historical dose','2025-01-01',true)");
const {ensureDigitalVetCardSchema}=await import('../digitalVetCard.js');await ensureDigitalVetCardSchema();
const {clinicRouter}=await import('../routes/clinic.js');
const app=express();app.use(express.json());app.use(cookieParser());app.use('/api',clinicRouter);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
after(async()=>{await new Promise(r=>server.close(r));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
const call=async(role,method,path,body)=>{
 const res=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{'Content-Type':'application/json',...(role?{Authorization:`Bearer ${role}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:res.status,headers:res.headers,data:res.headers.get('content-type')?.includes('application/pdf')?new Uint8Array(await res.arrayBuffer()):await res.json()};
};
const {clinicClock}=await import('../scheduling.js');
const card=(pet,role='owner',format='')=>call(role,'GET',`/pets/${pet}/vet-card${format}`);
const config={name:'Synthetic Verified Clinic',address:'123 Synthetic Street',phone:'+639170000001',email:'clinic@example.invalid',registration:'SYNTHETIC-REGISTRATION',verificationSource:'Synthetic clinic registration fixture',confirmed:true};
async function verify(){const r=await call('admin','GET','/clinic-document-profile');return call('admin','PUT','/clinic-document-profile',{...config,revision:r.data.profile.revision});}
async function fixture({vaccinate=true,name='Synthetic patient'}={}){
 const pet='p_'+crypto.randomUUID(),id='a_'+crypto.randomUUID();
 await query("INSERT INTO pets(id,owner_id,name,species,breed,birth,weight,vaccination_card_id) VALUES($1,'owner',$2,'Dog','Aspin','2020-01-01',10,NULL)",[pet,name]);
 await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status) VALUES($1,$2,'vet',$3,'09:00','Synthetic examination','In consultation')",[id,pet,clinicClock().date]);
 const request={id:'c_'+crypto.randomUUID(),petId:pet,apptId:id,date:clinicClock().date,symptoms:'Synthetic concern',objective:'Synthetic examination',diagnosis:'Synthetic assessment',treatment:'Synthetic care',prescription:'Synthetic instructions',performedServices:['srv_consult'],weight:10.5,...(vaccinate?{vaccination:{id:'v_'+crypto.randomUUID(),vaccine:'Anti-rabies',brand:'Synthetic brand',batch:'SYNTHETIC-BATCH',doseNo:1,doseOf:3,intervalDays:21,nextDue:(await import('../../src/clinicalWorkflow.js')).boosterDate(clinicClock().date,21),scheduleApproved:true}}:{})};
 const saved=await call('vet','POST','/consultations',request);assert.equal(saved.status,200,JSON.stringify(saved));
 return {pet,id,request,saved:saved.data};
}
async function payment(f){
 const claim=await call('assistant','POST',`/checkout-inbox/${f.id}/claim`,{});assert.equal(claim.status,200,JSON.stringify(claim));
 const invoiceItems=claim.data.invoiceItems,amount=invoiceItems.reduce((n,i)=>n+i.price*i.qty,0);
 const body={claimToken:claim.data.claimToken,invoiceItems,amount,paymentMethod:'Cash',cashTendered:amount};
 return {body,save:()=>call('assistant','POST',`/appointments/${f.id}/billing`,body)};
}
const publication=async pet=>(await query('SELECT * FROM digital_vet_cards WHERE pet_id=$1',[pet])).rows;

test('migration preserves all IDs and history; internal references are stable without publishing',async()=>{
 const old=(await query("SELECT * FROM vaccinations WHERE id='historic-dose'")).rows[0];
 await query(sql('digital-vet-card'));await query(sql('digital-vet-card'));
 assert.deepEqual((await query("SELECT * FROM vaccinations WHERE id='historic-dose'")).rows[0],old);
 assert.equal((await query("SELECT vaccination_card_id FROM pets WHERE id='legacy-card'")).rows[0].vaccination_card_id,'EXISTING-CARD-ID');
 assert.equal((await query("SELECT vaccination_card_id FROM pets WHERE id='legacy-empty'")).rows[0].vaccination_card_id,'PAT-'+(await query("SELECT md5('legacy-empty') hash")).rows[0].hash);
 assert.equal((await query("SELECT id FROM appointments WHERE id='legacy-visit'")).rows[0].id,'legacy-visit');
 const r=await card('legacy-card');assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.document,null);assert.equal(r.data.history.events[0].id,'historic-dose');
 assert.equal((await card('legacy-card','owner','/pdf')).status,409);
});
test('unverified clinic details prevent official publication even after saved payment',async()=>{
 const f=await fixture();const p=await payment(f);assert.equal((await p.save()).status,200);
 assert.equal((await publication(f.pet)).length,0);
 const r=await card(f.pet);assert.equal(r.data.document,null);assert.match(r.data.publicationStatus,/verification/);
 const v=(await query('SELECT * FROM vaccinations WHERE id=$1',[f.request.vaccination.id])).rows[0];
 assert.equal(v.appt_id,f.id);assert.equal(v.consultation_id,f.request.id);assert.ok(v.card_id);assert.equal(v.done,true);
});
test('only an admin can verify clinic details; validations, audit and revisions are trusted',async()=>{
 for(const role of ['owner','assistant','vet'])assert.equal((await call(role,'PUT','/clinic-document-profile',{...config,revision:0})).status,403);
 const bad=await call('admin','PUT','/clinic-document-profile',{...config,name:' ',phone:'abc',email:'bad',confirmed:false,revision:0});assert.equal(bad.status,400);for(const field of ['name','phone','email','confirmed'])assert.ok(bad.data.errors[field]);
 const saved=await verify();assert.equal(saved.status,200,JSON.stringify(saved));assert.equal(saved.data.profile.verified_by,'admin');assert.equal(saved.data.profile.verified_by_name,'Synthetic admin');
 assert.equal((await call('admin','PUT','/clinic-document-profile',{...config,revision:0})).status,409);
 assert.equal((await query("SELECT count(*)::int n FROM audit_logs WHERE action LIKE 'Verified clinic document details%'")).rows[0].n,1);
});
test('unpaid consultation stays unpublished; payment atomically publishes with stable IDs and duplicate clicks do not duplicate documents',async()=>{
 const f=await fixture();const before=await card(f.pet);assert.equal(before.data.document,null);assert.match(before.data.publicationStatus,/payment/);assert.equal(before.data.history.events.filter(e=>e.kind==='weight').length,1);
 assert.equal((await card(f.pet,'owner','/pdf')).status,409);
 const p=await payment(f);const responses=await Promise.all([p.save(),p.save()]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const docs=await publication(f.pet);assert.equal(docs.length,1);assert.equal(docs[0].revision,1);
 const r=await card(f.pet);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.document.revision,1);assert.equal(r.data.document.snapshot.pet.internalReference,docs[0].snapshot.pet.internalReference);assert.equal(r.data.document.snapshot.visits[0].vetName,'Synthetic vet');
 const same=await Promise.all(Array.from({length:4},()=>card(f.pet)));for(const c of same){assert.equal(c.status,200,JSON.stringify(c));assert.equal(c.data.document.revision,1);}
 assert.equal((await query("SELECT count(*)::int n FROM audit_logs WHERE action LIKE $1",[`Published Digital Vet Card ${docs[0].document_reference}%`])).rows[0].n,1);
 assert.equal((await call('vet','POST','/consultations',f.request)).status,403);
 assert.equal((await query('SELECT count(*)::int n FROM consultations WHERE appt_id=$1',[f.id])).rows[0].n,1);
});
test('publication failure rolls back payment, checkout task, document and audit together',async()=>{
 const f=await fixture(),p=await payment(f);
 const before=(await query('SELECT * FROM appointments WHERE id=$1',[f.id])).rows[0];
 const task=(await query('SELECT * FROM checkout_tasks WHERE appointment_id=$1',[f.id])).rows[0];
 const audits=(await query('SELECT count(*)::int n FROM audit_logs')).rows[0].n;
 await query(`CREATE FUNCTION reject_card_publication() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic publication failure'; END $$; CREATE TRIGGER reject_card_publication BEFORE INSERT OR UPDATE ON digital_vet_cards FOR EACH ROW EXECUTE FUNCTION reject_card_publication()`);
 try{assert.equal((await p.save()).status,500);}finally{await query('DROP TRIGGER reject_card_publication ON digital_vet_cards; DROP FUNCTION reject_card_publication()');}
 assert.deepEqual((await query('SELECT * FROM appointments WHERE id=$1',[f.id])).rows[0],before);assert.deepEqual((await query('SELECT * FROM checkout_tasks WHERE appointment_id=$1',[f.id])).rows[0],task);assert.equal((await publication(f.pet)).length,0);assert.equal((await query('SELECT count(*)::int n FROM audit_logs')).rows[0].n,audits);
 assert.equal((await p.save()).status,200);
});
test('owner and vet access is scoped on JSON and PDF; exports contain all history with corrections and no private admission notes',async()=>{
 const f=await fixture({name:'Niña Ω'});
 // More entries than both state/vitals page boundaries. Preserve every repeated measurement.
 for(let i=0;i<225;i++)await query("INSERT INTO vital_measurements(id,pet_id,appt_id,kind,value,unit,measured_at,measurement_date,staff_id,staff_name,staff_role,source,origin) VALUES($1,$2,$3,'temp',38.5,'°C',clock_timestamp(),$4,'assistant','Synthetic assistant','assistant','intake','clinic')",[`temperature-${i}`,f.pet,f.id,clinicClock().date]);
 await query("INSERT INTO vaccinations(id,pet_id,card_id,vaccine,date,next_due,done,automated,notes) VALUES('synthetic-plan',$1,'HISTORIC','Synthetic planned vaccine',$2,$2,false,true,'PLANNED-NOT-GIVEN'),('unlinked-history',$1,'HISTORIC','Unlinked historical dose','2020-05-01',NULL,true,false,'HISTORICAL-DOSE')",[f.pet,clinicClock().date]);
 await query("INSERT INTO vital_measurements(id,pet_id,appt_id,kind,value,unit,measured_at,measurement_date,staff_name,source,origin,notes) VALUES('private-measurement',$1,$2,'temp',39,'°C',clock_timestamp(),$3,'Assistant','admission','clinic','PRIVATE-OBSERVATION-SECRET')",[f.pet,f.id,clinicClock().date]);
 const p=await payment(f);assert.equal((await p.save()).status,200);
 const first=await card(f.pet);assert.equal(first.status,200,JSON.stringify(first));assert.equal(first.data.history.complete,true);assert.equal(first.data.history.events.filter(e=>e.kind==='temp').length,225);assert.equal(first.data.history.events.some(e=>e.private),false);
 assert.equal((await card(f.pet,'vet')).data.history.events.filter(e=>e.private).length,1);
 for(const role of ['other-owner','other-vet'])for(const format of ['','/pdf'])assert.equal((await card(f.pet,role,format)).status,404);
 assert.equal((await card(f.pet,null)).status,401);
 const corrected=await call('assistant','POST',`/pets/${f.pet}/vitals/temperature-0/correct`,{requestId:crypto.randomUUID(),value:38.6,reason:'Synthetic thermometer transcription correction'});assert.equal(corrected.status,200,JSON.stringify(corrected));
 const next=await card(f.pet);assert.equal(next.data.document.revision,first.data.document.revision+1);assert.equal(next.data.document.snapshot.events.length,first.data.document.snapshot.events.length+1);
 const out=await card(f.pet,'owner','/pdf');assert.equal(out.status,200,JSON.stringify(out));assert.match(out.headers.get('content-disposition'),/^attachment;/);assert.equal(out.headers.get('cache-control'),'private, no-store');
 const doc=await getDocument({data:out.data,isEvalSupported:false}).promise;assert.ok(doc.numPages>2);let text='';for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i);text+=(await page.getTextContent()).items.map(t=>t.str).join(' ')+'\n';}await doc.destroy();
 for(let i=0;i<225;i++)assert.ok(text.includes(`temperature-${i}`),`Missing exported measurement ${i}`);
 for(const phrase of ['Niña Ω','Synthetic Verified Clinic','SYNTHETIC-REGISTRATION','Synthetic vet','Original issue date','Document reference','PLANNED vaccine','NOT ADMINISTERED','HISTORICAL-DOSE','Synthetic thermometer transcription correction','original retained'])assert.ok(text.includes(phrase),phrase);
 assert.ok(!text.includes('PRIVATE-OBSERVATION-SECRET'));
 assert.equal((await publication(f.pet))[0].revision,next.data.document.revision,'unchanged download does not mint a duplicate approval/document');
});


test('legacy paid visits and unlinked consultations migrate with unknown times left unknown',async()=>{
 await query("UPDATE appointments SET billing_status='Paid' WHERE id='legacy-visit'");
 await query("INSERT INTO consultations(id,pet_id,vet_id,appt_id,date,symptoms,objective,diagnosis,treatment) VALUES('legacy-note','legacy-card','vet','legacy-visit','2025-01-01','Historical subjective','Historical objective','Historical assessment','Historical plan'),('unlinked-note','legacy-card','vet',NULL,'2024-01-01','Unlinked subjective','Unlinked objective','Unlinked assessment','Unlinked plan')");
 const r=await card('legacy-card');assert.equal(r.status,200,JSON.stringify(r));assert.ok(r.data.document);assert.equal(r.data.document.snapshot.pet.internalReference,'EXISTING-CARD-ID');
 const legacy=r.data.document.snapshot.visits.find(v=>v.id==='legacy-visit');assert.equal(legacy.paidAt,null);assert.equal(legacy.qualified,true);
 assert.ok(r.data.document.snapshot.visits.some(v=>v.historical&&v.consultation.id==='unlinked-note'));
 assert.equal(r.data.document.snapshot.events.find(e=>e.id==='historic-dose').visitId,null,'migration does not invent historical links');
});


test('approval preserves an existing internal reference and does not publish an official document',async()=>{
 await query("INSERT INTO pets(id,owner_id,name,species,breed,sex,birth,weight,registration_status,vaccination_card_id) VALUES('pending-patient','owner','Pending patient','Canine','Aspin','Male','2020-01-01',10,'Pending','STABLE-INTERNAL-REFERENCE')");
 await query("INSERT INTO pet_requests(id,owner_id,name,species,breed,sex,birth,weight,status,pet_id) VALUES('pending-request','owner','Pending patient','Canine','Aspin','Male','2020-01-01',10,'Pending','pending-patient')");
 await query("UPDATE pet_requests SET neutered='No' WHERE id='pending-request'");
 const r=await call('assistant','POST','/pet-requests/pending-request/approve',{revision:0});assert.equal(r.status,200,JSON.stringify(r));
 assert.equal((await query("SELECT vaccination_card_id FROM pets WHERE id='pending-patient'")).rows[0].vaccination_card_id,'STABLE-INTERNAL-REFERENCE');
 assert.equal((await query("SELECT card_id FROM pet_requests WHERE id='pending-request'")).rows[0].card_id,'STABLE-INTERNAL-REFERENCE');
 assert.equal((await card('pending-patient')).data.document,null);
 assert.equal((await publication('pending-patient')).length,0);
});
test('new unpaid visits never erase the existing card or enter its published PDF snapshot',async()=>{
 const f=await fixture({vaccinate:false}),p=await payment(f);assert.equal((await p.save()).status,200);
 const original=(await card(f.pet)).data.document;
 const newVisit='a_'+crypto.randomUUID();await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status,billing_status) VALUES($1,$2,'vet',$3,'10:00','UNPAID-VISIT-SECRET','In consultation','Unpaid')",[newVisit,f.pet,clinicClock().date]);
 await query("INSERT INTO vital_measurements(id,pet_id,appt_id,kind,value,unit,measurement_date,staff_name,source,origin) VALUES('unpaid-measurement',$1,$2,'temp',39,'°C',$3,'Synthetic assistant','intake','clinic')",[f.pet,newVisit,clinicClock().date]);
 const next=(await card(f.pet)).data;assert.equal(next.document.revision,original.revision);assert.equal(next.document.reference,original.reference);assert.ok(next.history.events.some(e=>e.id==='unpaid-measurement'));assert.ok(!JSON.stringify(next.document.snapshot).includes('UNPAID-VISIT-SECRET'));assert.ok(!next.document.snapshot.events.some(e=>e.id==='unpaid-measurement'));
 await query("UPDATE appointments SET status='Cancelled' WHERE id=$1",[newVisit]);
 const cancelled=(await card(f.pet)).data.document;assert.equal(cancelled.reference,original.reference);assert.equal(cancelled.revision,original.revision);
});

test('previous-clinic guide rows retain their identity while history and complete PDF identify unverified provenance',async()=>{
 const f=await fixture({vaccinate:false});
 const id='external-'+crypto.randomUUID();
 await query("INSERT INTO vaccinations(id,pet_id,card_id,vaccine,brand,batch,date,done,protocol_type,recorded_by) VALUES($1,$2,'EXTERNAL-REF','Previous Rabies Report','External Clinic Record','EXTERNAL-HIST','2024-01-01',true,'External History (Guide)','Previous Vet (External Guide)')",[id,f.pet]);
 const p=await payment(f);assert.equal((await p.save()).status,200);
 const history=await card(f.pet),event=history.data.history.events.find(e=>e.id===id);
 assert.equal(event.kind,'reference');assert.equal(event.administered,false);assert.match(event.provenance,/administration date unknown/);
 assert.equal((await query('SELECT done FROM vaccinations WHERE id=$1',[id])).rows[0].done,true,'legacy stored record remains intact');
 const out=await card(f.pet,'owner','/pdf');assert.equal(out.status,200);
 const doc=await getDocument({data:out.data,isEvalSupported:false}).promise;let text='';for(let n=1;n<=doc.numPages;n++)text+=(await (await doc.getPage(n)).getTextContent()).items.map(v=>v.str).join(' ');await doc.destroy();
 assert.ok(text.includes('UNVERIFIED previous-clinic reference: Previous Rabies Report'));assert.ok(!text.includes('Administered vaccine: Previous Rabies Report'));assert.match(text.replace(/\s+/g,' '),/administration date unknown/);
});
