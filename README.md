# MedReach

MedReach is a full-stack healthcare discovery and remote-consultation project. Patients can find doctors, book appointments, and use supported consultation and follow-up features. Doctors manage availability, appointments, verification submissions, and consultation records. Admin functionality is currently focused on doctor verification.

This repository contains a React frontend and an Express API backed by PostgreSQL. The application is designed to serve the built frontend and API from one Node.js process in production.

## Project structure and technology

- `client/` — React 19, Vite, React Router 7, and Tailwind CSS 4 frontend.
- `server/` — Node.js ES modules, Express 5 API, PostgreSQL access through `pg`, and migrations managed by `node-pg-migrate`.
- `server/migrations/` — ordered PostgreSQL schema migrations.
- `server/scripts/` — migration, bootstrap, seed, and schema verification commands.
- `docs/doctor-verification.md` — doctor verification design, API, migration, local validation guidance, and explicit Admin bootstrap procedure.

Authentication uses `express-session` with PostgreSQL-backed sessions and Argon2id password hashing. The API uses role and ownership checks. Video consultation is integrated with JaaS through server-issued short-lived tokens; it requires JaaS credentials and has not been verified against a live provider as part of this documentation update.

## Project documentation

- [Architecture](docs/ARCHITECTURE.md) — frontend/API/database flow, authentication, and lifecycle overview.
- [Database and migrations](docs/DATABASE.md) — schema relationships, migration order, and database safety notes.
- [API reference](docs/API.md) — route inventory, access rules, and validation notes.
- [Testing](docs/TESTING.md) — package commands, test organization, and safe database-test guidance.
- [Doctor verification](docs/doctor-verification.md) — verification workflow, Admin bootstrap, and its historical validation notes.

## Prerequisites

- Node.js 22.12 or later in the 22.x line, or Node.js 24.0 or later. These versions are named in the existing deployment guidance; package manifests do not declare an `engines` field.
- npm compatible with the installed Node.js version.
- A local PostgreSQL database for migrations and database-backed application features.
- Git, if obtaining or updating the source checkout.

## Local setup

From the repository root:

1. Install the locked client and server dependencies:

   ```bash
   npm run install:deps
   ```

2. Copy `server/.env.example` to `server/.env`. Configure the local database connection and a `SESSION_SECRET` of at least 32 characters. Keep real credentials out of source control and chat. The server reads this file for local start and migration commands.

3. Apply local development migrations:

   ```bash
   npm --prefix server run migrate:up
   ```

   This uses the local server environment and applies pending upward migrations. The current repository contains ten migration files. Never point local setup commands at a production database.

4. Optional: add fictional public discovery data to a disposable development database:

   ```bash
   npm run seed
   ```

   The seed is prohibited in production. Seeded doctors have non-login placeholder hashes; they are discovery fixtures, not usable Doctor accounts. The script also creates a development Admin row with a non-login placeholder hash.

5. Start the API and frontend in separate terminals from the repository root:

   ```bash
   npm run dev:server
   ```

   ```bash
   npm run dev:client
   ```

   Vite proxies `/api` requests to the local API at `127.0.0.1:3000` (`client/vite.config.js`). The server port can be set with `PORT`.

## Environment variable names

The server recognizes these names; values belong in the local environment or deployment secret store, never in this document or client bundle:

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `DATABASE_SSL`
- `DATABASE_SSL_CA` (optional custom CA certificate)
- `SESSION_SECRET`
- `JAAS_APP_ID`
- `JAAS_API_KEY_ID`
- `JAAS_PRIVATE_KEY_BASE64`
- `JAAS_TOKEN_TTL_SECONDS` (optional)

`DATABASE_URL` is needed for database operations. The application requires `SESSION_SECRET` outside tests. External production PostgreSQL connections require verified TLS using `DATABASE_SSL`; `DATABASE_SSL_CA` is optional when a custom CA is required. JaaS variables are needed only for video authorization. See `server/.env.example` and `server/src/config/env.js` for the current names and validation.

`DATABASE_URL` must not include TLS/connection override query parameters. The database configuration rejects `ssl`, `sslmode`, `sslcert`, `sslkey`, `sslrootcert`, `sslnegotiation`, `uselibpqcompat`, and `host`. Configure TLS with `DATABASE_SSL` (`true` or `false`) and, when a private CA is needed, `DATABASE_SSL_CA`; a CA value is accepted only when TLS is enabled. External production database connections require verified TLS, so use `DATABASE_SSL` accordingly. Do not weaken certificate verification to work around connection errors.

## Development commands

These commands are defined by the root and package manifests:

| Task | Command |
|---|---|
| Install client and server dependencies from lockfiles | `npm run install:deps` |
| Run frontend development server | `npm run dev:client` |
| Run API development server | `npm run dev:server` |
| Build frontend | `npm run build` |
| Lint frontend and server | `npm run lint` |
| Run server and client test suites | `npm test` |
| Apply local upward migrations | `npm --prefix server run migrate:up` |
| Verify auth schema against configured database | `npm --prefix server run verify:auth-schema` |
| Verify booking schema against configured database | `npm --prefix server run verify:booking-schema` |
| Verify consultation schema against configured database | `npm --prefix server run verify:consultation-schema` |
| Report clinical record counts from configured database | `npm --prefix server run report:clinical-counts` |

Database integration tests require a disposable PostgreSQL database configured for the test run; without `DATABASE_URL`, some database tests are skipped. Do not use production data for development or test fixtures. These commands are available in the repository; their results are not asserted here.

## Architecture overview

The browser frontend calls JSON endpoints on the Express API. During local development Vite proxies `/api` to Express. In production, Express serves both the API and generated `client/dist` assets (`server/src/app.js`, `server/src/middleware/frontend.js`).

The API is organized around routes, controllers, services, and PostgreSQL data-access modules under `server/src/`. PostgreSQL stores accounts, profiles, verification, availability, appointments, notifications, consultation records, and sessions. Migrations under `server/migrations/` define the schema. Authentication uses a `medreach.sid` HttpOnly cookie and PostgreSQL session storage. Authorization checks roles and record ownership or assignment.

The main frontend routes are defined in `client/src/App.jsx`; API routers are mounted in `server/src/app.js`. Keep the production frontend page fallback in `server/src/middleware/frontend.js` aligned when routes change.

## API overview

All routes are under `/api`. The route definitions are the source of truth; this overview is not a complete request/response reference.

- Health: `GET /api/health`
- Public discovery: `GET /api/specializations`, `GET /api/doctors`, `GET /api/doctors/:doctorId`, `GET /api/doctors/:doctorId/slots`
- Authentication: patient and doctor registration, login, logout, session identity, and CSRF token endpoints under `/api/auth`
- Doctor verification: doctor submission/status under `/api/doctors/me/verification`; Admin review under `/api/admin/doctor-verifications`
- Availability: Doctor-owned availability blocks, recurring rules, and exceptions under `/api/doctors/me/availability`
- Appointments and consultations: booking, lists, details, cancellation, patient rescheduling, consultation lifecycle, clinical workspace, and video authorization under `/api/appointments`; Doctor appointment list under `/api/doctors/me/appointments`
- Notifications: list and mark read under `/api/notifications`

For verification states, review roles, migration details, and the documented Admin bootstrap procedure, see [Doctor verification](docs/doctor-verification.md).

## Feature status

These statuses describe code found in this repository, not production readiness. **No feature below is verified in a running deployed environment by this README.**

| Status | Features |
|---|---|
| Implemented in code | Patient and Doctor registration/login; public doctor search; Doctor availability and recurring rules/exceptions; appointment booking, cancellation, and patient rescheduling; Admin doctor verification; in-app notifications; consultation lifecycle; Doctor notes and structured prescriptions; optional follow-up recommendation and patient view of a finished consultation record. |
| Partial | JaaS video integration (requires configured credentials and live-provider validation); medical records (limited to finished MedReach consultation notes, prescriptions, and follow-up details); administration (currently focused on doctor verification and Admin account bootstrap). |
| Not implemented | Email/SMS notifications; patient uploads; polished history-sharing/consent UI; follow-up progress notes; payments; reviews; marketplace/content extras; AI medical functionality; automated medical-license verification or registry integration. |
| Not verified in a running environment | Deployment behavior, live video calls, production database state, and end-to-end feature behavior. Passing tests alone does not establish production functionality. |

Doctor verification approval is a human decision; submitted credentials are not independently validated by an external registry. The Admin review UI does not grant access to clinical records. The bootstrap command and local validation instructions are documented in [docs/doctor-verification.md](docs/doctor-verification.md).

### Important behavior and limits

- Public discovery exposes only enabled Doctors with approved verification. Search supports name, specialization, problem, date, fee, and experience filters. Booked slots are excluded from public availability.
- Booking and patient rescheduling use database transactions and slot locks to prevent competing active bookings from taking the same slot. Patient check-in opens 15 minutes before a slot; a Doctor can open the room from five minutes before the slot. No-show is a manual Doctor action from 15 minutes after the start, with no upper time limit. Patient cancellation and rescheduling close at that 15-minute-after-start boundary and are unavailable after a consultation begins.
- A consultation begins only through the Doctor workflow and may continue after the scheduled slot ends until the Doctor explicitly finishes it. Finishing marks the appointment completed.
- The Doctor's clinical draft contains plain-text notes, structured prescription items, and an optional follow-up interval. Drafts are explicitly saved, not autosaved. Patients can read the record only after the consultation is finished; the Admin verification workflow has no clinical-record access.
- Video uses JaaS at `8x8.vc`. The server authorizes the assigned Doctor or owning Patient and signs a short-lived token; the browser does not receive the private signing key. Valid JaaS environment variables are required for live video. Leaving the video room does not finish the MedReach consultation.
- Notifications are in-app stored messages. Email and SMS delivery are not implemented.

## Production serving

The production server serves the API and built frontend from one Express process. The package scripts provide:

```bash
npm run install:deps && npm run build
npm start
```

Configure production environment variables in the hosting provider. Keep `server/migrations/`, `server/scripts/`, server production dependencies, and generated `client/dist` available to the service. Do not run migrations during the frontend build or on every web-process startup. The production migration command is `npm run migrate:production`; it uses injected environment variables, applies pending upward migrations, and refuses production down migrations. Review the migration files and deployment plan before running it.

## Planned Render + Neon deployment

**Planned, not live or verified:** the intended deployment is a Render web service at `medreach.onrender.com` backed by Neon PostgreSQL. This repository contains no Render service configuration and does not confirm that the hostname is reserved, the service is created, or the database is provisioned.

The repository provides candidate commands, not verified Render settings:

- Build: `npm run install:deps && npm run build`
- Start: `npm start`
- Upward migration command: `npm run migrate:production`, run as a separately reviewed deployment step before serving code that depends on the new schema.

Before deployment, confirm Render's supported migration/pre-deploy workflow for the selected service, Node runtime, health check, and environment configuration. These settings are not established by repository files. Neon connection details must be supplied securely through the hosting environment; external production connections require verified TLS (`DATABASE_SSL`). Do not paste connection strings or secrets into documentation, commits, logs, or the frontend. Never run development seeds against Neon production.

The older Railway-specific guidance has been removed because it does not describe the planned Render + Neon target. Actual deployment settings, successful migrations, and the live status of `medreach.onrender.com` remain unverified.
