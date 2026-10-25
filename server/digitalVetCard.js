import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {query} from './db.js';
import {ensureVitalsSchema,vitalView} from './vitals.js';
import {ensureCheckoutSchema} from './database/clinicSchema.js';
import {ensureCareSchema} from './careWorkflow.js';
let ready;
export const cardError=(message,status=400)=>Object.assign(Error(message),{status});
export function ensureDigitalVetCardSchema(){
 return ready ||= (async()=>{
  await ensureVitalsSchema();await ensureCheckoutSchema();await ensureCareSchema();
  if(!(await query("SELECT version FROM pawcare_schema_migrations WHERE version='digital-vet-card-v1'")).rows.length)
   await query(readFileSync(new URL('./database/digital-vet-card.sql',import.meta.url),'utf8'));
 })().catch(error=>{ready=undefined;throw error;});
}
export async function cardPatient(client,petId,user){
 const params=[petId];let scope='';
 if(user?.role==='owner'){params.push(user.ownerId);scope=' AND owner_id=$2';}
 if(user?.role==='vet'){params.push([user.id,user.vetId].filter(Boolean));scope=' AND EXISTS(SELECT 1 FROM appointments WHERE pet_id=pets.id AND vet_id=ANY($2::varchar[]))';}
 const pet=(await client.query(`SELECT * FROM pets WHERE id=$1${scope} FOR UPDATE`,params)).rows[0];
 if(!pet)throw cardError('Patient not found or no longer assigned to you.',404);
 return pet;
}
export async function internalCardReference(client,petId,current){
 if(current?.trim())return current;
 return (await client.query("UPDATE pets SET vaccination_card_id='PAT-'||md5(id) WHERE id=$1 AND NULLIF(trim(vaccination_card_id),'') IS NULL RETURNING vaccination_card_id",[petId])).rows[0]?.vaccination_card_id || (await client.query('SELECT vaccination_card_id FROM pets WHERE id=$1',[petId])).rows[0]?.vaccination_card_id;
}
const date=value=>value instanceof Date?value.toISOString().slice(0,10):value || null;
const iso=value=>value instanceof Date?value.toISOString():value || null;
export async function cardHistory(client,pet,{staff=false}={}){
 const profile=(await client.query('SELECT * FROM clinic_document_profile WHERE id=true')).rows[0];
 const owner=(await client.query('SELECT id,name FROM owners WHERE id=$1',[pet.owner_id])).rows[0];
 const vets=(await client.query("SELECT id,vet_id,first_name,last_name FROM users WHERE role='vet' ORDER BY id")).rows;
 const vetName=id=>{const vet=vets.find(v=>v.id===id||v.vet_id===id);return vet?`${vet.first_name} ${vet.last_name}`:'Veterinarian not recorded';};
 const appointments=(await client.query('SELECT * FROM appointments WHERE pet_id=$1 ORDER BY date,id',[pet.id])).rows;
 const consults=(await client.query('SELECT * FROM consultations WHERE pet_id=$1 ORDER BY date,id',[pet.id])).rows;
 const stays=(await client.query('SELECT appt_id,status FROM admissions WHERE pet_id=$1 ORDER BY appt_id',[pet.id])).rows;
 const consultationView=c=>({id:c.id,date:date(c.date),vetId:c.vet_id,vetName:vetName(c.vet_id),symptoms:c.symptoms,objective:c.objective,diagnosis:c.diagnosis,treatment:c.treatment,prescription:c.prescription || '',careStatus:c.care_status || 'Routine care',followUpDate:date(c.follow_up_date),followUpReason:c.follow_up_reason || ''});
 const visits=appointments.map(a=>{
  const consultation=consults.find(c=>c.appt_id===a.id),stay=stays.find(d=>d.appt_id===a.id);
  const qualified=a.status==='Completed' && a.billing_status==='Paid' && !!consultation;
  return {id:a.id,date:date(a.date),time:a.time,reason:a.reason,status:a.status,billingStatus:a.billing_status,paidAt:iso(a.paid_at),qualified,vetId:consultation?.vet_id || a.vet_id,vetName:vetName(consultation?.vet_id || a.vet_id),admissionStatus:stay?.status || null,
   consultation:consultation?consultationView(consultation):null,consultations:consults.filter(c=>c.appt_id===a.id).map(consultationView)};
 });
 for(const c of consults.filter(c=>!appointments.some(a=>a.id===c.appt_id)))visits.push({id:'unlinked-'+c.id,date:date(c.date),reason:'Historical consultation; visit link not recorded',status:'Historical',billingStatus:'Unknown',paidAt:null,qualified:false,historical:true,vetId:c.vet_id,vetName:vetName(c.vet_id),consultation:consultationView(c),consultations:[consultationView(c)]});
 const vaccinations=(await client.query('SELECT * FROM vaccinations WHERE pet_id=$1 ORDER BY date,id',[pet.id])).rows.map(v=>({id:v.id,kind:v.done?'vaccination':'planned',date:date(v.date),visitId:v.appt_id || null,consultationId:v.consultation_id || null,vaccine:v.vaccine,brand:v.brand || '',batch:v.batch || '',nextDue:date(v.next_due),doseNo:v.dose_no,doseOf:v.dose_of,administered:v.done,automated:v.automated,vetId:v.vet_id || null,vetName:vetName(v.vet_id),recordedBy:v.recorded_by || 'Recording staff not recorded',notes:v.notes || '',provenance:v.appt_id?'Linked clinic visit':'Historical record; visit/payment link not recorded'}));
 const measurements=(await client.query(`SELECT m.*,(SELECT c.id FROM vital_measurements c WHERE c.corrects_id=m.id) superseded_by FROM vital_measurements m WHERE pet_id=$1${staff?'':" AND source<>'admission'"} ORDER BY measurement_date,id`,[pet.id])).rows.map(r=>({...vitalView(r),date:date(r.measurement_date),measuredAt:iso(r.measured_at),recordedAt:r.source==='legacy intake snapshot'?null:iso(r.recorded_at),private:r.source==='admission'}));
 const registrations=(await client.query('SELECT id,weight,requested_at FROM pet_requests WHERE pet_id=$1 ORDER BY id',[pet.id])).rows.map(r=>({id:r.id,kind:'registration',value:Number(r.weight),unit:'kg',date:date(r.requested_at),visitId:null,origin:'registration',notes:'Owner-entered registration weight; not a clinic measurement.'}));
 const events=[...vaccinations,...measurements.map(m=>({...m,kind:m.origin==='registration'?'registration':m.kind})),...registrations].sort((a,b)=>`${b.date || ''}|${b.measuredAt || ''}|${b.id}`.localeCompare(`${a.date || ''}|${a.measuredAt || ''}|${a.id}`));
 return {complete:true,clinic:{...(profile?.details || {}),verifiedAt:iso(profile?.verified_at),verifiedBy:profile?.verified_by_name || null,revision:profile?.revision || 0},pet:{id:pet.id,internalReference:pet.vaccination_card_id,name:pet.name,species:pet.species,speciesOther:pet.species_other || '',breed:pet.breed,sex:pet.sex,birth:date(pet.birth),color:pet.color || '',neutered:pet.neutered || '',allergies:pet.allergies || [],ownerName:owner?.name || 'Owner not recorded'},visits,events};
}
// Caller owns the transaction. Payment, publication and audit commit together.
export async function refreshDigitalVetCard(client,petId,{pet,history}={}){
 if(!history && !(await client.query('SELECT * FROM clinic_document_profile WHERE id=true')).rows[0]?.verified_at)return null;
 pet ||= await cardPatient(client,petId);
 if(pet.registration_status && pet.registration_status!=='Verified')return null;
 history ||= await cardHistory(client,pet);
 const qualified=history.visits.filter(v=>v.qualified);
 if(!history.clinic.verifiedAt || !qualified.length)return null;
 const ids=new Set(qualified.map(v=>v.id));
 // Official snapshots retain the entire settled history, including linked corrections.
 // Live history also shows visits awaiting completion/payment. Unlinked legacy history
 // is retained with its provenance, without claiming payment or a verified dose source.
 const snapshot={...history,visits:history.visits.filter(v=>v.qualified||v.historical),events:history.events.filter(e=>!e.private && (!e.visitId || ids.has(e.visitId)))};
 const contentHash=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
 const saved=(await client.query(`INSERT INTO digital_vet_cards(pet_id,document_reference,revision,content_hash,snapshot)
  VALUES($1::varchar,'DVC-'||md5($1::text),1,$2,$3) ON CONFLICT(pet_id) DO UPDATE SET revision=digital_vet_cards.revision+1,refreshed_at=clock_timestamp(),content_hash=EXCLUDED.content_hash,snapshot=EXCLUDED.snapshot
  WHERE digital_vet_cards.content_hash<>EXCLUDED.content_hash RETURNING *`,[petId,contentHash,JSON.stringify(snapshot)])).rows[0];
 if(saved)await client.query('INSERT INTO audit_logs(user_name,user_role,action) VALUES($1,$2,$3)',['Document publisher','system',`Published Digital Vet Card ${saved.document_reference} revision ${saved.revision} for patient ${petId}`]);
 const row=saved || (await client.query('SELECT * FROM digital_vet_cards WHERE pet_id=$1',[petId])).rows[0];
 return {reference:row.document_reference,revision:row.revision,issuedAt:iso(row.issued_at),refreshedAt:iso(row.refreshed_at),snapshot:row.snapshot};
}
