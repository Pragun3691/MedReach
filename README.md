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

## Known exclusions

This milestone does not implement payments, video consultations, clinical
notes, prescriptions, medical history, follow-ups, Patient Ready or no-show
workflows, administration tools, or email/SMS notifications.
