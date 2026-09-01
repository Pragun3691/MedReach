# MedReach

MedReach is a full-stack healthcare discovery and remote-consultation project.
The current implementation includes public doctor discovery plus secure patient and
doctor account registration with PostgreSQL-backed server sessions.

## Project structure

- `client/` — React, Vite, Tailwind CSS and React Router
- `server/` — Express REST API

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
running database migrations with `npm --prefix server run migrate:up`. Set a
cryptographically random `SESSION_SECRET` of at least 32 characters for sessions.

After migrating a development database, run `npm run seed` once to add
fictional doctors, specializations, availability blocks and 30-minute slots.

## Public discovery API

- `GET /api/specializations`
- `GET /api/doctors`
- `GET /api/doctors/:doctorId`
- `GET /api/doctors/:doctorId/slots?date=YYYY-MM-DD`

Doctor search accepts `name`, `specialization`, `problem`, `date`, `maxFee`,
`minExperience`, `limit` and `offset`. Only approved, enabled doctor profiles
are returned publicly.

The public UI supports Home search, filtered doctor results, public doctor
profiles and specific-date 30-minute slot selection.

## Authentication API

- `POST /api/auth/register/patient`
- `POST /api/auth/register/doctor`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Passwords are hashed with Argon2id. Authentication uses an HttpOnly
`medreach.sid` cookie and PostgreSQL `user_sessions` storage. Newly registered
doctor profiles remain private until a later verification workflow approves
them. Appointment creation is intentionally not part of this milestone.
