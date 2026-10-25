import { readFileSync } from 'node:fs';
import { query } from './db.js';

let ready;
export function ensureAdmissionsSchema() {
  return ready ||= (async () => {
    await query(readFileSync(new URL('./database/admissions.sql', import.meta.url), 'utf8'));
    const exists = (await query("SELECT to_regclass(format('%I.pawcare_schema_migrations', current_schema())) AS migrations")).rows[0]?.migrations;
    if (exists && (await query("SELECT version FROM pawcare_schema_migrations WHERE version='admission-workflow-v1'")).rows.length) return;
    await query(readFileSync(new URL('./database/admission-workflow.sql', import.meta.url), 'utf8'));
  })().catch(error => { ready = undefined; throw error; });
}
export const admissionError = (message, status = 400) => Object.assign(new Error(message), {status});
export const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const text = (value, label, max, required = false) => {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw admissionError(`${label}${required ? ' is required and' : ''} must be at most ${max.toLocaleString()} characters.`);
  return value.trim();
};
export function admissionInput(body, action, role) {
  if (!isUuid(body.requestId)) throw admissionError('Reopen the admission form before saving.');
  body.requestId = body.requestId.toLowerCase();
  if (action !== 'create' && (!Number.isInteger(body.revision) || body.revision < 0)) throw admissionError('Refresh the admission before saving.',409);
  if ((action === 'release' ? role !== 'assistant' : role !== 'vet' && !['update','medication'].includes(action)) || (role !== 'vet' && (body.carePlan !== undefined || body.dischargeInstructions !== undefined))) throw admissionError('Only a veterinarian can change the care plan or discharge a pet.',403);
  const data = {action,...(action === 'create' ? {} : {revision:body.revision}),clinicalNote:text(body.clinicalNote,'Clinical note',3000,true),ownerUpdate:text(body.ownerUpdate,'Owner update',2000,action === 'create'),measurements:{}};
  if (action === 'create') {
    if (typeof body.apptId !== 'string' || !body.apptId || body.apptId.length > 50) throw admissionError('Choose the consultation visit.');
    data.apptId = body.apptId;
    data.carePlan = text(body.carePlan,'Care plan',3000,true);
  } else if (role === 'vet' && action === 'update') data.carePlan = text(body.carePlan,'Care plan',3000);
  if (action === 'discharge') data.dischargeInstructions = text(body.dischargeInstructions,'Discharge and home-care instructions',3000,true);
  if (body.measurements !== undefined) {
    if (!body.measurements || typeof body.measurements !== 'object' || Array.isArray(body.measurements) || Object.keys(body.measurements).some(key => !['temp','weight'].includes(key))) throw admissionError('Record only measured temperature and weight.');
    for (const [key,min,max] of [['temp',33,45],['weight',0.05,120]]) {
      const value = body.measurements[key];
      if (value !== undefined) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw admissionError(`Enter a measured ${key === 'temp' ? 'temperature (33–45°C)' : 'weight (0.05–120 kg)'}.`);
        data.measurements[key] = value;
      }
    }
  }
  if (action === 'order') {
    for (const [field,max] of [['medicine',200],['dose',200],['route',100],['frequency',200]]) data[field] = text(body[field],field,max,true);
    data.instructions = text(body.instructions,'Medicine instructions',1000);
    data.catalogId = body.catalogId || null;
    data.supplyLimit = body.supplyLimit ?? 0;
    if (!Number.isInteger(data.supplyLimit) || data.supplyLimit < 0 || data.supplyLimit > 1000 || (data.catalogId === null ? data.supplyLimit !== 0 : typeof data.catalogId !== 'string' || data.supplyLimit < 1)) throw admissionError('Choose an optional clinic medicine product and authorize its whole item/package limit (1–1000).');
  }
  if (['stop-medication','medication'].includes(action)) {
    if (!isUuid(body.orderId)) throw admissionError('Choose a saved veterinarian medicine order.');
    data.orderId = body.orderId.toLowerCase();
  }
  if (action === 'medication') {
    if (!['Given','Missed','Held'].includes(body.result)) throw admissionError('Choose Given, Missed or Held.');
    data.result = body.result;
    if (typeof body.occurredAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(body.occurredAt) || !Number.isFinite(Date.parse(body.occurredAt))) throw admissionError('Enter the actual medicine event date/time with a timezone.');
    data.occurredAt = new Date(body.occurredAt).toISOString();
    data.billableQuantity = body.billableQuantity ?? 0;
    if (!Number.isInteger(data.billableQuantity) || data.billableQuantity < 0 || data.billableQuantity > 1000 || (body.result !== 'Given' && data.billableQuantity !== 0)) throw admissionError('Record whole clinic items/packages actually used; missed or held doses have no medicine charge.');
  }
  if (action === 'correct-medication') {
    if (!isUuid(body.eventId)) throw admissionError('Choose the medicine entry to mark as entered in error.');
    data.eventId = body.eventId.toLowerCase();
  }
  return data;
}

// Owners receive a positive allowlist. Internal plans, measurements, notes and
// idempotency payloads never cross the owner API boundary.
export function admissionView(row, owner = false) {
  const publicFields = {id:row.id,petId:row.pet_id,petName:row.pet_name,apptId:row.appt_id,vetName:row.vet_name,
    status:row.status,admittedAt:row.admitted_at,dischargeApprovedAt:row.discharge_approved_at,dischargedAt:row.discharged_at,billingStatus:row.billing_status,
    dischargeInstructions:row.discharge_instructions,latestUpdate:row.latest_update || '',latestUpdateAt:row.latest_update_at || null};
  return owner ? publicFields : {...publicFields,ownerName:row.owner_name,vetId:row.vet_id,revision:row.revision,reason:row.reason,carePlan:row.care_plan,visitStatus:row.visit_status};
}
export function admissionUpdateView(row, owner = false) {
  const publicFields = {id:row.id,kind:row.kind,at:row.created_at,by:row.actor_name,role:row.actor_role,ownerUpdate:row.owner_update};
  return owner ? publicFields : {...publicFields,clinicalNote:row.clinical_note,carePlan:row.care_plan,measurements:row.measurements,medication:row.medication,voided:Boolean(row.voided)};
}
