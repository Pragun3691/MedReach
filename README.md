# MedReach

MedReach is a full-stack healthcare discovery and remote-consultation project.
The current implementation includes public doctor discovery, secure Patient and
Doctor authentication, real appointment booking and slot reservation,
appointment lists and details, Patient and Doctor cancellation, Patient
rescheduling, and stored in-app notifications.

## Project structure

- `client/` — React, Vite, Tailwind CSS and React Router
- `server/` — Express REST API and PostgreSQL data access

## Development commands

Run these commands from the repository root:

```bash
npm run dev:client
npm run dev:server
npm run build
npm run lint
npm test
```

Copy `server/.env.example` to `server/.env` and set `DATABASE_URL` before
running migrations. Set a cryptographically random `SESSION_SECRET` of at least
32 characters for sessions.

```bash
npm --prefix server run migrate:up
npm --prefix server run verify:booking-schema
```

The booking milestone is created by
`server/migrations/1788175400000_create-appointment-booking-schema.js`. The
verification command checks the appointment and notification tables,
constraints, indexes and preserved discovery-data row counts without resetting
or reseeding the database.

After migrating a development database, run `npm run seed` once to add
fictional doctors, specializations, availability blocks and 30-minute slots.
These seeded doctors exist only as public discovery data. They do not have
usable login credentials and are not Doctor login accounts.

## Production serving

From the repository root, install with the existing client and server lockfiles,
then build the frontend:

```bash
npm run install:deps
npm run build
```

Set `NODE_ENV=production` in the server environment and run `npm start` from the
repository root. In PowerShell, use `$env:NODE_ENV = 'production'` before
`npm start`. The existing server environment loader also supports `server/.env`.
The server listens on `PORT` (default 3000) using one Express process for both
the API and generated `client/dist` files. The Vite server remains development-only.

API routes run first; unknown `/api` endpoints retain the JSON 404 response.
GET/HEAD HTML navigation to the page routes declared in `client/src/App.jsx`
receives `index.html`, including direct links such as `/doctors/1` and
`/doctor/availability`. Keep the page patterns in
`server/src/middleware/frontend.js` aligned when adding frontend routes.
Missing assets, unsupported methods and unknown page paths receive 404 responses.
Only `client/dist` is a static file root; dotfiles are ignored.

Production still requires a random `SESSION_SECRET` of at least 32 characters,
`DATABASE_URL` and a prepared PostgreSQL schema including `user_sessions`.
Use HTTPS behind the existing trusted proxy; production session cookies remain
Secure, HttpOnly and SameSite=Lax. Keep database, session and JaaS credentials
in the server environment; do not place them in Vite variables or frontend files.
Dependency and build output are ignored by Git.

## Production PostgreSQL and Railway pre-deploy

Use Node 22.12+ (or Node 24.0+). From the repository root, the build command is
`npm run install:deps && npm run build`; the start command is `npm start`.
The install script explicitly includes development dependencies needed to build
React even when `NODE_ENV=production`. `node-pg-migrate` is a server production
dependency at the existing locked version, so it also survives
`npm --prefix server ci --omit=dev` or pruning server development dependencies.
Keep `server/migrations`, `server/scripts`, `server/src`, server production
dependencies and generated `client/dist` in the final image. Do not run migrations
during the frontend build or on every web-process startup.

Configure the application service's Railway **Pre-Deploy Command** as:

```bash
npm run migrate:production
```

This root command forwards to `npm --prefix server run migrate:production`.
It uses platform-injected variables and never loads a local `.env`. Railway runs
pre-deploy commands inside the private network with service variables; a nonzero
exit blocks deployment. See [Railway pre-deploy documentation](https://docs.railway.com/deployments/pre-deploy-command).
The command validates connection settings, requires packaged migration files,
applies every pending upward migration under the migration lock and a single
transaction, and retains the existing `public.pgmigrations` history table.
Missing configuration, TLS failures, unavailable files or migration errors exit
nonzero. An already-current schema reports zero applied migrations explicitly.
The command emits safe summaries rather than raw database errors or SQL.

Required server variables are `NODE_ENV=production`, `DATABASE_URL`,
`DATABASE_SSL` (choose `false` or `true`) and `SESSION_SECRET` (at least 32 random
characters). Railway supplies `PORT`; the existing default is 3000. Migrations
require `DATABASE_URL` and connection/TLS settings, but not a session secret.
Video credentials remain server-only `JAAS_APP_ID`, `JAAS_API_KEY_ID`,
`JAAS_PRIVATE_KEY_BASE64` and optional `JAAS_TOKEN_TTL_SECONDS`.

For Railway private networking, reference the database service's private
`DATABASE_URL` (hostname ending in `.railway.internal`) and set
`DATABASE_SSL=false`. This explicitly disables PostgreSQL TLS over Railway's
encrypted private network. Local PostgreSQL remains compatible with
`DATABASE_SSL=false`. Production connections to other hostnames require
`DATABASE_SSL=true`; use a hostname matching the server certificate.

External TLS always verifies the certificate chain and hostname. Publicly trusted
certificates use Node's trust store. For a private CA, optionally set
`DATABASE_SSL_CA` to its PEM certificate (actual multiline contents). Application
queries, PostgreSQL sessions and migrations use the same settings. Certificate
failures must be fixed with a valid certificate/CA, never by disabling verification.
Remove `ssl`, `sslmode`, `sslcert`, `sslkey`, `sslrootcert`, `sslnegotiation`,
`uselibpqcompat` and `host` query parameters from `DATABASE_URL`; configuration
rejects these because pg URL parameters can override explicit TLS settings.
See [node-postgres TLS documentation](https://node-postgres.com/features/ssl).

Local `npm --prefix server run migrate:up` and `migrate:down` still load
`server/.env` when present; injected variables take precedence and an absent file
is allowed. Downward migrations are refused with `NODE_ENV=production`.
**Never run `npm run seed` or `seed:public-discovery` in production.** Pre-deploy
must use only the upward migration command, never seeds, resets or rollback commands.
No database has been provisioned or migrated as part of this configuration change.

## Public discovery API

- `GET /api/specializations`
- `GET /api/doctors`
- `GET /api/doctors/:doctorId`
- `GET /api/doctors/:doctorId/slots?date=YYYY-MM-DD`

Doctor search accepts `name`, `specialization`, `problem`, `date`, `maxFee`,
`minExperience`, `limit` and `offset`. Only approved, enabled Doctor profiles
are returned publicly. Active slots with a booked appointment are excluded
from public availability.

## Authentication API

- `POST /api/auth/register/patient`
- `POST /api/auth/register/doctor`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Passwords are hashed with Argon2id. Authentication uses an HttpOnly
`medreach.sid` cookie and PostgreSQL `user_sessions` storage. Newly registered
Doctor profiles remain private until their verification is approved.

## Appointment API

- `POST /api/appointments` — Patient books an available slot
- `GET /api/appointments/me` — Patient lists their appointments
- `GET /api/appointments/:appointmentId` — owning Patient or assigned Doctor gets safe details
- `POST /api/appointments/:appointmentId/cancel` — owning Patient or assigned Doctor cancels
- `POST /api/appointments/:appointmentId/reschedule` — owning Patient reschedules
- `POST /api/appointments/:appointmentId/ready` — owning Patient marks Ready from T-15 until slot end
- `POST /api/appointments/:appointmentId/open-room` — assigned Doctor opens the room from T-5 until slot end
- `POST /api/appointments/:appointmentId/begin-consultation` — assigned Doctor begins the clinical encounter after opening the room
- `GET /api/appointments/:appointmentId/consultation` — assigned Doctor reads active/finished content; owning Patient reads only completed content
- `PATCH /api/appointments/:appointmentId/consultation` — assigned Doctor transactionally saves an active clinical draft
- `POST /api/appointments/:appointmentId/no-show` — assigned Doctor manually records no-show from T+15 onward
- `POST /api/appointments/:appointmentId/consultation/finish` — assigned Doctor finishes an active consultation
- `POST /api/appointments/:appointmentId/video-token` — owning Patient or assigned Doctor obtains short-lived JaaS join authorization
- `GET /api/doctors/me/appointments` — Doctor lists assigned appointments

Booking and rescheduling are transactional. PostgreSQL row locks and a partial
unique index prevent two active bookings from owning the same slot. Doctor and
appointment time remain derived through the selected slot and availability
block rather than being duplicated on the appointment record.

## Notification API

- `GET /api/notifications?limit=20&offset=0`
- `PATCH /api/notifications/:notificationId/read`

Notifications are stored message snapshots with backend-generated internal
action paths. Authenticated users can list and mark only their own notifications.

## Consultation lifecycle foundation

Patients can mark Ready from 15 minutes before the scheduled start until the
30-minute slot ends. Assigned Doctors can open a room and begin the clinical
encounter from five minutes before the start until slot end; opening a room is
separate from beginning a Consultation. A Patient Ready signal is not required
to begin. Exactly one Consultation may exist per appointment, and an active
Consultation may continue beyond slot end until the assigned Doctor explicitly
finishes it, atomically moving the appointment to `completed`.

No-show is a manual assigned-Doctor action available from 15 minutes after the
scheduled start with no upper time limit. It is never automatic. Patient
self-cancellation and rescheduling close at that same T+15 boundary and are
blocked once a Consultation begins.

## JaaS integration foundation

MedReach uses the JaaS deployment at `8x8.vc` through its IFrame API. The
Express backend authorizes the owning Patient or assigned Doctor against the
current locked appointment and Consultation state, then signs a short-lived
RS256 JWT. Doctors receive moderator permission and Patients receive ordinary
participant permission. Tokens use a literal, stable room named
`medreach-appointment-<appointmentId>` and the IFrame receives the full
`<AppID>/<room>` name. The browser never chooses the room and never receives
the private signing key.

Configure real development credentials only in `server/.env` using
`JAAS_APP_ID`, `JAAS_API_KEY_ID`, `JAAS_PRIVATE_KEY_BASE64`, and optionally
`JAAS_TOKEN_TTL_SECONDS` (default 600 seconds). The Base64-encoded PEM RSA
private key may use PKCS#8 (`BEGIN PRIVATE KEY`) or legacy PKCS#1
(`BEGIN RSA PRIVATE KEY`) format. It is decoded and parsed only by the server
when video authorization is first requested.

The reusable `JaasMeeting` component loads
`https://8x8.vc/<AppID>/external_api.js` once, limits the built-in toolbar to
microphone, camera, and hangup, exposes participant and local media events, and
disposes the IFrame API on unmount. Active Consultations can request fresh
tokens after slot end for reconnects. Leaving or hanging up never finishes a
MedReach Consultation.

Appointment Details now presents the pre-consultation workflow from the
backend-derived lifecycle capabilities: Patient check-in and waiting, Doctor
room opening, a compact browser-only camera/microphone check, authorized room
entry, participant-presence feedback, explicit Doctor confirmation before
beginning the Consultation, and manual no-show confirmation.

## Active consultation clinical workspace

After the assigned Doctor explicitly begins a Consultation, Appointment Details
provides the active video experience alongside a compact clinical workspace.
The Doctor can explicitly save plain consultation notes, zero or more structured
prescription items, and one optional follow-up interval. Draft saving replaces
the complete clinical draft transactionally while the Consultation remains
active; it does not autosave or use browser storage.

The existing Finish endpoint remains the only completion mechanism. Unsaved
changes are saved before Finish, and a failed save prevents completion. Finish
atomically sets `consultations.finished_at`, moves the appointment to
`completed`, and derives any follow-up target from that completion timestamp.
The assigned Doctor can revisit the resulting clinical record read-only.
Patients continue to receive only the active consultation/video experience;
unfinished Doctor clinical content is not exposed to Patient or Admin accounts.

## Patient post-consultation record

An owning Patient can open a completed appointment and read its finished
Consultation record. Appointment Details presents the Doctor’s plain-text notes,
the structured prescription in stored order, and the optional follow-up interval
and server-derived target date. Empty notes, prescription, and follow-up states
are explained calmly only when a real finished Consultation exists.

When follow-up was recommended, the record links to the same Doctor’s existing
availability flow with the target calendar date preselected. This remains a
normal Patient-selected booking: MedReach does not create a follow-up
appointment or reserve a slot automatically. Active clinical drafts remain
private to the assigned Doctor, PATCH and Finish remain Doctor-only, and Admin
accounts have no clinical access.

## Known exclusions

This milestone does not implement the polished Patient post-consultation
history-sharing/consent UI, follow-up progress notes, patient uploads,
marketplace or content extras, payments, reviews, AI medical functionality,
administration tools, or email/SMS notifications.
