# Clinic workflow rollout

## Existing database: migrate without demo seeding

Use Node 24+, installed production dependencies, and a database migration role
with DDL permissions. `DATABASE_URL` must be supplied privately by the hosting
platform or shell. Never put it in source control, screenshots, or logs.

1. Back up the target database and confirm a restore works on an isolated copy.
2. Pause clinic writes and reminder jobs during migration. The batch takes table
   locks; its advisory lock serializes this runner's retries, not old app instances.
3. Restore the backup to an isolated staging database. Run:

   ```sh
   npm run db:migrate:check
   npm run db:migrate
   npm run db:migrate
   ```

   The check executes pending DDL/backfills and rolls the transaction back. The
   first apply commits; the second reuses the saved ledger. Check mode can still
   take locks, so use staging first. No account, patient, or appointment demo
   fixtures are seeded. The whole pending batch and its ledger commit together;
   failures roll them back. Each statement has a 120-second limit and lock waits
   have a 10-second limit. A large production copy may require a separately
   planned migration window; test its actual size before production.
4. Compare patient/appointment IDs, consultation and vaccination contents, and
   admission/medicine/discharge records before and after. Verify row counts and
   relationships, allowing documented additive backfills for pending patients,
   registration reports, and measured vitals. Available legacy intake snapshots
   are retained; temperatures overwritten before history existed are unrecoverable.
   Original unknown timestamps and staff attribution remain unknown.
5. Run the check and apply against production with the same release and migration
   role after staging succeeds. Do **not** use `npm run db:init` on an existing
   clinic: that initializer seeds synthetic users and records.

The runner uses `pawcare_deployment_migrations` to record SHA-256 hashes. Existing
`pawcare_schema_migrations` markers are adopted without replaying already applied
backfills or legacy views. An applied file whose hash changes aborts the batch;
add a new migration for future changes. Keep these ledgers in database backups.
A failed apply leaves the prior schema/data in place. After a successful apply,
roll back application code only if compatible; database reversal requires the
verified backup/restore procedure, not deleting preserved medical records.

## Verify the clinic identity

An administrator opens **Official Document Details**, enters the actual clinic
name, full address, phone, email, registration/license reference and checked
source, confirms the review, and saves. Use current clinic registration/contact
records. Saving records the administrator, time, source and revision. Edits reset
the confirmation; errors appear and clear while typing. Never copy synthetic test
values into a live clinic.

A stable internal patient/card reference supports treatment before publication.
An official document additionally requires verified clinic details, verified pet
registration, a completed consultation and saved payment. An unpaid visit cannot
publish. Export loads the complete published history regardless of current UI
filters. Planned doses remain labelled as not administered.

## Hosting

For the repository's existing Vercel configuration:

- Set the target project's private `DATABASE_URL`, trusted HTTPS `APP_URL`, and
  `CRON_SECRET`. Retain the existing clinic's provider configuration. Do not
  replace it with local test values. Email/SMS delivery requires separately
  configured providers; these workflow checks send no provider messages.
- Build with `npm run build`, output `dist`. `vercel.json` routes `/api/*` to
  `api/index.js`, includes the PDF font and server/shared source files, and
  configures the reminder cron. Preserve those function assets.
- Apply the reviewed database migration before enabling the new release. Use
  the existing deployment pipeline for the intended project/environment.
- Check `/api/health` reports `db: connected`; verify the HTTPS URL, login/session
  restoration, and private document downloads on the actual deployment.
- Restore reminder execution after verifying release readiness. Do not start
  competing reminder workers for the same deployment.

No hosting account/project connection or production database is included in this
checkout. Local checks do not constitute a live deployment or migration of the
clinic's actual records.

## Acceptance checks with isolated synthetic accounts

Use separate owner, other-owner, assistant, veterinarian and administrator
sessions against a real database. Verify:

- Combined approval rollback, duplicate clicks, slot conflicts and preserved
  patient identity after cancellation/rejection.
- Assistant/veterinarian intake; every weight and temperature measurement,
  linked corrections, recording staff, units and timestamps.
- Owner registration weights remain distinguishable from clinic measurements.
- Completed unpaid consultations remain unpublished; saved payment publishes an
  eligible document once and refreshes its content without duplicate audits.
- Long complete PDFs include vaccinations, planned doses, vitals, corrections,
  veterinarian, clinic details, issue date and document reference. Filters and
  visible-page limits do not truncate the export.
- Admission care, notes and medicine events persist through veterinarian discharge
  approval, payment and separate release confirmation. Payment leaves the patient
  **Ready for discharge**. Owner documents exclude private admission observations.
- A different owner cannot access patient JSON, vitals, admissions or PDFs. Check
  unauthorized responses and browser reload/session restoration.

Local automated suites and a synthetic full-app rehearsal cover these boundaries.
Run the same checks on staging using the actual deployment configuration before
publishing to the clinic. A production-like backup rehearsal and live checks remain
necessary when real data and hosting access become available.
