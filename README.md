# PawCare – Veterinary Clinic & Pet Vaccination Daily Hub (React UI)

Front-end only. Data lives in memory (`SEED` in `src/lib.jsx`) and resets on refresh.

    npm install
    npm run dev

## Demo accounts
| Role | Username | Password |
|---|---|---|
| Clinic Administrator | admin | Admin123 |
| Veterinarian | vet | Vet12345 |
| Vet Assistant | assistant | Assist123 |
| Pet Owner | owner | Owner123 |

## Structure
- `src/pages/Landing.jsx`, `src/pages/Login.jsx` – public pages
- `src/roles/` – one file per role: its own menu, dashboard and theme
- `src/Portal.jsx` – shared sidebar/header shell; `src/EntityPage.jsx` – CRUD list + validated form
- `src/lib.jsx` – mock data, validation rules, entity config, shared components

## Connecting a back end later
Replace the `db`/`setDb` state in `src/App.jsx` and the add/edit/delete handlers in `src/EntityPage.jsx` with API calls. Passwords are plain text in the mock data; hash them server-side.

## Permissions (C = create, R = read, U = update, D = delete)
| Section | Admin | Vet | Assistant | Owner |
|---|---|---|---|---|
| User accounts | CRUD | none | none | none |
| Owners | CRUD | R | CRU | none (menu hidden) |
| Pets | CRUD | CRU | CRU | R, own pets only |
| Appointments | CRUD | CRU | CRU | CRU, own pets only |
| Vaccinations | CRUD | CRUD | CRU | R, own pets only |
| Consultations | R | CRUD | R | R, own pets only |
| Reports | yes | yes | no | no |

Rules live in each entity's `perm` in `src/lib.jsx`. Buttons are hidden in the UI, and `src/EntityPage.jsx` re-checks them on save and delete.

## Account activation

Sign up → verify the email link → enter the SMS OTP → log in with your password.
Email links open the OTP screen directly. Verification sessions cannot open the
portal; completing OTP clears them and returns to login. Reloading the OTP screen
resumes the same account's pending verification.

Run `npm run test:auth` with Node.js 24+ for the HTTP authentication regression
checks. Tests isolate database and message delivery dependencies with Node's
experimental module mocking; they do not send real email/SMS or use a live database.

## Persistent account settings

Signed-in owners, assistants, veterinarians and administrators use
`/api/auth/profile` for their own registration details and profile photo.
Photo and contact saves require the active verified session; a server failure
is shown instead of reporting a temporary browser-only save. Photos are resized
in the browser and stored in PostgreSQL's `account_photos` table. The table is
included in `server/database/schema.sql` and created on first profile use for
existing databases (the application database role needs CREATE permission).
`/api/auth/password` verifies the current password, saves a bcrypt hash and
revokes other login sessions while keeping the current session signed in.

Run `npm run test:account` for account settings and isolation regression checks.

### Clinic access and durable saves

Clinic APIs require a verified session (the `sid` cookie or Bearer token). Owners receive only their own patient data; veterinarians receive their assigned appointments and those patients’ histories. Reception handles registration, intake, scheduling and payment. Administrators have read-only clinical oversight; staff invitations remain administrator-only. Clinical finalization requires an assigned visit in consultation and commits the note, optional vaccine and visit completion together.

The application no longer uses demo/in-memory saves when the API fails. A failed request leaves the form open for correction/retry. The legacy instant-approval `/api/owner/pets` route is retired: use pending pet registration requests. Account edits use `/api/auth/profile/contact`. Client-supplied audit identities and manual audit-log inserts are not accepted.

For existing databases, apply the idempotent checkout `ALTER TABLE appointments` block at the end of `server/database/schema.sql` before deployment (do not rerun demo seeding on a live database). Checkout also initializes these missing columns on first use and therefore requires `ALTER` permission if the migration was not applied. Checkout stores the discount, payment reference, cash received and change in `payment_details`; entering a reference records staff confirmation and does not independently verify a provider transfer.

Run clinic regressions with `npm run test:clinic`.
