import {lockSchedule} from '../scheduling.js';
import express from 'express';
import { query, withTransaction } from '../db.js';
import { ensureStaffAccessSchema } from '../staffAccess.js';
import { ensureAdmissionsSchema } from '../admissions.js';
export const adminRouter = express.Router();
const problem = (message,status=400) => Object.assign(new Error(message),{status});
adminRouter.use(async(req,res,next)=>{
  if (req.user?.role !== 'admin') return res.status(403).json({error:'Administrator access required.'});
  try {await ensureStaffAccessSchema();next();}
  catch {res.status(500).json({error:'Unable to load administrator controls. Please retry.'});}
});
const audit = (client,user,action) => client.query('INSERT INTO audit_logs (user_name,user_role,action) VALUES ($1,$2,$3)',[user.name,user.role,action]);
// Account availability is private to administrators and checks every user role.
adminRouter.get('/staff/email-availability',async(req,res)=>{
 const email=String(req.query.email||'').trim().toLowerCase();
 if(email.length>255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:'Enter a valid staff email address.'});
 try {
  const account=await query('SELECT 1 FROM users WHERE LOWER(email)=$1 LIMIT 1',[email]);
  const pending=await query('SELECT 1 FROM staff_invitations WHERE LOWER(email)=$1 AND accepted_at IS NULL AND expired_at>NOW() LIMIT 1',[email]);
  res.set('Cache-Control','no-store').json({available:account.rows.length===0,pendingInvitation:pending.rows.length>0});
 } catch {res.status(500).json({error:'Unable to check this email. Please retry.'});}
});
adminRouter.get('/staff',async(req,res)=>{
 try {
  const [staff,invitations,count]=await Promise.all([
   query("SELECT id,first_name,last_name,email,role,vet_id,is_active,is_locked,lockout_until,mobile_verified,access_revision,access_reason FROM users WHERE role IN ('vet','assistant') ORDER BY last_name,first_name,id"),
   query("SELECT id,email,name,role,expired_at,accepted_at FROM staff_invitations ORDER BY created_at DESC LIMIT 100"),
   query('SELECT COUNT(*)::int AS count FROM users')
  ]);
  res.set('Cache-Control','no-store').json({staff:staff.rows.map(u=>({id:u.id,name:[u.first_name,u.last_name].filter(Boolean).join(' '),email:u.email,role:u.role,vetId:u.vet_id,active:u.is_active,locked:u.is_locked,lockedUntil:u.lockout_until,mobileVerified:u.mobile_verified,revision:u.access_revision,reason:u.access_reason})),invitations:invitations.rows.map(i=>({id:i.id,email:i.email,name:i.name,role:i.role,expiresAt:i.expired_at,status:i.accepted_at?'Accepted':new Date(i.expired_at)>new Date()?'Pending':'Expired or revoked'})),accountCount:count.rows[0].count});
 } catch {res.status(500).json({error:'Unable to load staff accounts. Please retry.'});}
});
adminRouter.post('/staff/:id/access',async(req,res)=>{
 try {
  const {action,reason,revision}=req.body;
  if (!['deactivate','reactivate','unlock'].includes(action)) throw problem('Choose a valid staff access action.');
  if (typeof reason !== 'string' || !reason.trim() || reason.length>300 || /[\u0000-\u001f]/.test(reason)) throw problem('Record a reason for this access change (up to 300 characters).');
  if (!Number.isInteger(revision) || revision<0) throw problem('Refresh the staff list before changing access.',409);
  if (action==='deactivate') await ensureAdmissionsSchema();
  await withTransaction(async client=>{
   await lockSchedule(client);
   const u=(await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE',[req.params.id])).rows[0];
   if (!u || !['vet','assistant'].includes(u.role) || u.id===req.user.id) throw problem('Only veterinarian and assistant accounts can be managed here.',403);
   if (u.access_revision!==revision) throw problem('This account changed. Refresh and review its current status.',409);
   if (action==='deactivate' && !u.is_active || action==='reactivate' && u.is_active || action==='unlock' && (!u.is_active || !u.is_locked)) throw problem('This action does not match the current account status. Refresh the list.',409);
   if(action==='deactivate' && u.role==='vet') {
    const active=(await client.query("SELECT COUNT(*)::int AS count FROM appointments WHERE vet_id = ANY($1::varchar[]) AND (status IN ('Checked-in','In consultation') OR EXISTS (SELECT 1 FROM admissions d WHERE d.appt_id=appointments.id AND d.status<>'Discharged'))",[[u.id,u.vet_id].filter(Boolean)])).rows[0].count;
    if(active)throw problem(`Transfer waiting or active consultations and complete any remaining admissions before deactivating this account (${active} patient visit(s) still under care).`,409);
   }
   if(action==='unlock') await client.query('UPDATE users SET is_locked=false,failed_login_attempts=0,lockout_until=NULL,access_reason=$2,access_revision=access_revision+1,updated_at=NOW() WHERE id=$1',[u.id,reason.trim()]);
   else await client.query('UPDATE users SET is_active=$2,access_reason=$3,access_revision=access_revision+1,updated_at=NOW() WHERE id=$1',[u.id,action==='reactivate',reason.trim()]);
   await client.query('DELETE FROM sessions WHERE user_id=$1',[u.id]);
   await audit(client,req.user,`Staff access ${action}: ${u.id} (${u.role}); before active=${u.is_active}, locked=${u.is_locked}, revision=${revision}; reason: ${reason.trim()}. Sessions revoked.`);
  });
  res.json({success:true});
 } catch(error){res.status(error.status||500).json({error:error.status?error.message:'Access change was not saved. Keep your reason and retry.'});}
});
adminRouter.post('/invitations/:id/revoke',async(req,res)=>{
 try {
  if(typeof req.body.reason!=='string'||!req.body.reason.trim()||req.body.reason.length>300)throw problem('Record why this invitation is being revoked (up to 300 characters).');
  await withTransaction(async client=>{
   const r=await client.query('UPDATE staff_invitations SET expired_at=NOW() WHERE id=$1 AND accepted_at IS NULL AND expired_at>NOW() RETURNING id,email',[req.params.id]);
   if(!r.rows.length)throw problem('This invitation has already been accepted, revoked or expired. Refresh the list.',409);
   await audit(client,req.user,`Revoked staff invitation ${r.rows[0].id} (${r.rows[0].email}); reason: ${req.body.reason.trim()}`);
  });res.json({success:true});
 }catch(error){res.status(error.status||500).json({error:error.status?error.message:'Unable to revoke the invitation. Please retry.'});}
});
adminRouter.get('/audit',async(req,res)=>{
 try {
  const search=typeof req.query.search==='string'?req.query.search.trim():'';
  if(search.length>100)throw problem('Keep the audit search under 100 characters.');
  let cursor=null;
  if(req.query.cursor){
   try{cursor=JSON.parse(Buffer.from(req.query.cursor,'base64url').toString());}catch{throw problem('Invalid audit page. Start a new search.');}
   if(typeof cursor?.id!=='string'||cursor.id.length>50||typeof cursor.time!=='string'||cursor.time.length>80||!Number.isFinite(Date.parse(cursor.time)))throw problem('Invalid audit page. Start a new search.');
  }
  const term=`%${search.replace(/[\\%_]/g,'\\$&')}%`;
  const rows=(await query(`SELECT id,user_name,user_role,action,created_at,created_at::text AS cursor_time FROM audit_logs
   WHERE (action ILIKE $1 OR user_name ILIKE $1 OR user_role ILIKE $1)
   AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::varchar))
   ORDER BY created_at DESC,id DESC LIMIT 51`,[term,cursor?.time||null,cursor?.id||null])).rows;
  const page=rows.slice(0,50),last=page.at(-1);
  res.set('Cache-Control','no-store').json({entries:page.map(r=>({id:r.id,actor:r.user_name,role:r.user_role,action:r.action,at:r.created_at})),nextCursor:rows.length>50?Buffer.from(JSON.stringify({time:last.cursor_time,id:last.id})).toString('base64url'):null});
 }catch(error){res.status(error.status||500).json({error:error.status?error.message:'Unable to load the audit trail. Please retry.'});}
});
