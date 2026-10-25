import express from 'express';
import { query, withTransaction } from '../db.js';
import { assignedTo } from '../clinicAccess.js';
import { lockSchedule } from '../scheduling.js';
import { sameIntakeVisit, intakeVisitSnapshot } from '../../src/intakeVisit.js';
import { ensureAdmissionsSchema, admissionError, admissionInput, admissionView, admissionUpdateView, isUuid } from '../admissions.js';

export const admissionsRouter = express.Router();
admissionsRouter.use(async (req,res,next) => {
  res.set('Cache-Control','private, no-store');
  try { await ensureAdmissionsSchema(); next(); }
  catch { res.status(500).json({error:'Unable to load admissions. Please retry.'}); }
});
const base = `SELECT d.*,p.name pet_name,p.owner_id,o.name owner_name,a.vet_id,a.status visit_status,
  COALESCE((SELECT CONCAT('Dr. ',u.first_name,' ',u.last_name) FROM users u WHERE u.id=a.vet_id OR u.vet_id=a.vet_id LIMIT 1),'Veterinarian') vet_name,
  latest.owner_update latest_update,latest.created_at latest_update_at
  FROM admissions d JOIN pets p ON p.id=d.pet_id JOIN owners o ON o.id=p.owner_id JOIN appointments a ON a.id=d.appt_id
  LEFT JOIN LATERAL (SELECT owner_update,created_at FROM admission_updates WHERE admission_id=d.id AND owner_update<>'' ORDER BY created_at DESC,id DESC LIMIT 1) latest ON TRUE`;
function scope(user, params) {
  if (user.role === 'owner') { params.push(user.ownerId); return `p.owner_id=$${params.length}`; }
  if (user.role === 'vet') { params.push([user.vetId,user.id].filter(Boolean)); return `a.vet_id=ANY($${params.length}::varchar[])`; }
  return 'TRUE';
}
async function readAdmission(execute, id, user) {
  const params = [id];
  const row = (await execute(`${base} WHERE d.id=$1 AND ${scope(user,params)}`,params)).rows[0];
  if (!row) throw admissionError('Admission not found or no longer assigned to you.',404);
  return row;
}
function errorResponse(res,error) {
  res.status(error.status || (error.code === '23505' ? 409 : 500)).json({error:error.status ? error.message : error.code === '23505' ? 'This pet or visit already has an admission. Refresh admissions before retrying.' : 'Unable to save or load the admission. Keep your entries and retry.'});
}
admissionsRouter.get('/', async (req,res) => {
  try {
    const status = req.query.status || 'Admitted';
    const offset = Number(req.query.offset || 0);
    if (!['Admitted','Discharged'].includes(status) || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw admissionError('Choose a valid admission status and page.');
    const params = [status];
    const filter = `d.status=$1 AND ${scope(req.user,params)}`;
    const count = (await query(`SELECT count(*)::int total FROM admissions d JOIN pets p ON p.id=d.pet_id JOIN appointments a ON a.id=d.appt_id WHERE ${filter}`,params)).rows[0].total;
    params.push(offset);
    const {rows} = await query(`${base} WHERE ${filter} ORDER BY d.admitted_at DESC,d.id DESC LIMIT 50 OFFSET $${params.length}`,params);
    res.json({admissions:rows.map(row => admissionView(row,req.user.role === 'owner')),total:count,offset,status,limit:50,checkedAt:new Date().toISOString()});
  } catch (error) { errorResponse(res,error); }
});
admissionsRouter.get('/eligible', async (req,res) => {
  try {
    const {rows} = await query(`SELECT a.*,p.name pet_name,o.name owner_name FROM appointments a JOIN pets p ON p.id=a.pet_id JOIN owners o ON o.id=p.owner_id
      WHERE a.vet_id=ANY($1::varchar[]) AND (a.status='In consultation' OR (a.status='Completed' AND EXISTS (SELECT 1 FROM consultations c WHERE c.appt_id=a.id)))
      AND NOT EXISTS (SELECT 1 FROM admissions d WHERE d.appt_id=a.id OR (d.pet_id=a.pet_id AND d.status='Admitted')) ORDER BY a.date DESC,a.time DESC`,[[req.user.vetId,req.user.id].filter(Boolean)]);
    res.json({visits:rows.map(row => ({...intakeVisitSnapshot(row),petName:row.pet_name,ownerName:row.owner_name}))});
  } catch (error) { errorResponse(res,error); }
});
admissionsRouter.get('/:id', async (req,res) => {
  try {
    if (!isUuid(req.params.id)) throw admissionError('Admission not found.',404);
    const row = await readAdmission(query,req.params.id,req.user);
    const owner = req.user.role === 'owner', params = [row.id];
    let filter = `admission_id=$1${owner ? " AND owner_update<>''" : ''}`;
    if (req.query.before) {
      let cursor;
      try { cursor = JSON.parse(Buffer.from(req.query.before,'base64url').toString()); } catch { throw admissionError('Invalid update page.'); }
      if (!cursor || !isUuid(cursor.id) || typeof cursor.at !== 'string' || !Number.isFinite(Date.parse(cursor.at))) throw admissionError('Invalid update page.');
      params.push(cursor.at,cursor.id); filter += ' AND (created_at,id)<($2::timestamptz,$3::uuid)';
    }
    const rows = (await query(`SELECT id,kind,created_at,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') cursor_at,actor_name,actor_role,owner_update${owner ? '' : ',clinical_note,care_plan,measurements'} FROM admission_updates WHERE ${filter} ORDER BY created_at DESC,id DESC LIMIT 51`,params)).rows;
    const more = rows.length > 50; rows.length = Math.min(rows.length,50);
    const last = rows.at(-1);
    res.json({admission:admissionView(row,owner),updates:rows.map(update => admissionUpdateView(update,owner)),nextCursor:more ? Buffer.from(JSON.stringify({at:last.cursor_at,id:last.id})).toString('base64url') : null,checkedAt:new Date().toISOString()});
  } catch (error) { errorResponse(res,error); }
});
const audit = (client,user,action) => client.query('INSERT INTO audit_logs (user_name,user_role,action) VALUES ($1,$2,$3)',[user.name,user.role,action]);
async function addUpdate(client,req,id,kind,data) {
  const ownerMessage = kind === 'Discharge' ? [data.ownerUpdate,data.dischargeInstructions].filter(Boolean).join('\n\n') : data.ownerUpdate;
  await client.query(`INSERT INTO admission_updates (id,admission_id,kind,clinical_note,care_plan,measurements,owner_update,actor_id,actor_name,actor_role,request_payload)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[req.body.requestId,id,kind,data.clinicalNote,data.carePlan || '',JSON.stringify(data.measurements),ownerMessage,req.user.id,req.user.name,req.user.role,JSON.stringify(data)]);
}
async function replay(client,req,id,data) {
  const row = (await client.query('SELECT admission_id,actor_id,request_payload=$2::jsonb AS same FROM admission_updates WHERE id=$1',[req.body.requestId,JSON.stringify(data)])).rows[0];
  if (!row) return false;
  if (row.admission_id !== id || row.actor_id !== req.user.id || !row.same) throw admissionError('This save identifier was already used for different entries. Reopen the form.',409);
  return true;
}
admissionsRouter.post('/', async (req,res) => {
  try {
    const data = admissionInput(req.body,'create',req.user.role), id = req.body.requestId;
    const saved = await withTransaction(async client => {
      await lockSchedule(client);
      // Match consultation/handoff locking: appointment first, then admission.
      const visit = (await client.query('SELECT * FROM appointments WHERE id=$1 FOR UPDATE',[data.apptId])).rows[0];
      if (!visit || !assignedTo(visit,req.user)) throw admissionError('An assigned consultation is required.',403);
      const active = (await client.query("SELECT id FROM users WHERE id=$1 AND role='vet' AND COALESCE(to_jsonb(users)->>'is_active','true')<>'false'",[req.user.id])).rows[0];
      if (!active) throw admissionError('Your account is inactive. Contact the clinic administrator.',403);
      if (await replay(client,req,id,data)) return readAdmission(client.query.bind(client),id,req.user);
      if (!['In consultation','Completed'].includes(visit.status)) throw admissionError('Start the consultation before admitting this pet.',409);
      if (!req.body.expectedVisit || !sameIntakeVisit(visit,req.body.expectedVisit)) throw admissionError('This visit changed. Refresh clinic records and reopen admission.',409);
      if (visit.status === 'Completed' && !(await client.query('SELECT id FROM consultations WHERE appt_id=$1',[visit.id])).rows.length) throw admissionError('A completed visit needs saved SOAP notes before admission.',409);
      await client.query('SELECT id FROM pets WHERE id=$1 FOR UPDATE',[visit.pet_id]);
      await client.query('INSERT INTO admissions (id,pet_id,appt_id,reason,care_plan) VALUES ($1,$2,$3,$4,$5)',[id,visit.pet_id,visit.id,data.clinicalNote,data.carePlan]);
      await addUpdate(client,req,id,'Admission',data);
      await audit(client,req.user,`Admitted pet ${visit.pet_id} for visit ${visit.id} (${id})`);
      return readAdmission(client.query.bind(client),id,req.user);
    });
    res.json({success:true,admission:admissionView(saved)});
  } catch (error) { errorResponse(res,error); }
});
admissionsRouter.post('/:id/:action', async (req,res) => {
  try {
    const {id,action} = req.params;
    if (!isUuid(id)) throw admissionError('Admission not found.',404);
    if (!['update','discharge'].includes(action)) throw admissionError('Admission action not found.',404);
    const data = admissionInput(req.body,action,req.user.role);
    const saved = await withTransaction(async client => {
      const source = (await client.query('SELECT appt_id FROM admissions WHERE id=$1',[id])).rows[0];
      if (!source) throw admissionError('Admission not found.',404);
      const visit = (await client.query('SELECT * FROM appointments WHERE id=$1 FOR UPDATE',[source.appt_id])).rows[0];
      if (req.user.role === 'vet' && !assignedTo(visit,req.user)) throw admissionError('This admission is no longer assigned to you.',403);
      const row = (await client.query('SELECT * FROM admissions WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if (await replay(client,req,id,data)) return readAdmission(client.query.bind(client),id,req.user);
      if (row.status !== 'Admitted') throw admissionError('This pet has already been discharged. Refresh admission records.',409);
      if (row.revision !== req.body.revision) throw admissionError('Another staff member updated this admission. Close this form, refresh and review the latest notes before saving.',409);
      if (action === 'discharge') {
        if (visit.status !== 'Completed' || !(await client.query('SELECT id FROM consultations WHERE appt_id=$1',[visit.id])).rows.length) throw admissionError('Finalize the consultation SOAP notes before discharging this pet.',409);
        await client.query("UPDATE admissions SET status='Discharged',discharged_at=clock_timestamp(),discharge_instructions=$2,revision=revision+1 WHERE id=$1",[id,data.dischargeInstructions]);
      } else await client.query("UPDATE admissions SET care_plan=COALESCE(NULLIF($2,''),care_plan),revision=revision+1 WHERE id=$1",[id,data.carePlan || '']);
      await addUpdate(client,req,id,action === 'discharge' ? 'Discharge' : req.user.role === 'vet' ? 'Veterinarian update' : 'Observation',data);
      await audit(client,req.user,`${action === 'discharge' ? 'Discharged' : 'Updated'} admission ${id}`);
      return readAdmission(client.query.bind(client),id,req.user);
    });
    res.json({success:true,admission:admissionView(saved)});
  } catch (error) { errorResponse(res,error); }
});
