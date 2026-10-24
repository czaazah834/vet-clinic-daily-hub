import { readFileSync } from 'node:fs';
import { query } from './db.js';
let ready;
export function ensureStaffAccessSchema() {
  return ready ||= (async () => {
    const exists = (await query("SELECT to_regclass(format('%I.pawcare_schema_migrations', current_schema())) AS migrations")).rows[0]?.migrations;
    if (exists && (await query("SELECT version FROM pawcare_schema_migrations WHERE version='staff-access-v1'")).rows.length) return;
    await query(readFileSync(new URL('./database/staff-access.sql',import.meta.url),'utf8'));
  })().catch(error => { ready=undefined; throw error; });
}
