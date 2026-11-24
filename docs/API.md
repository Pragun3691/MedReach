# API reference

This route inventory is derived from `server/src/app.js`, `server/src/routes/`, controllers, and validation schemas. All paths below are prefixed with `/api`. JSON parsing is limited to 1 MB. The route files and schemas are authoritative if behavior changes.

## Access conventions

- **Public:** no session required.
- **Authenticated:** a valid session for an enabled user is required; any role unless stated otherwise.
- **Patient / Doctor / Admin:** authenticated user with the named role.
- Role middleware is not the only access check: appointment services also require the authenticated Patient to own the appointment or the Doctor to be assigned to it. Availability and verification derive the Doctor ID from the session.
- Doctor verification submission and Admin approve/reject require `X-CSRF-Token`, obtained from authenticated `GET /api/auth/csrf`. Other existing mutation routes do not all use this explicit CSRF middleware.
- Zod validation failures return HTTP 400. Unknown API routes return HTTP 404 JSON. Exact response fields are only described where directly evident from controllers; consult code for complete payloads.

## Health and discovery

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/health` | Public | Returns a status object. |
| GET | `/specializations` | Public | Lists specializations. |
| GET | `/doctors` | Public | Search filters: `q`, `name`, `specialization`, `problem`, `date`, `maxFee`, `minExperience`, `limit`, `offset`. Date uses `YYYY-MM-DD`; limit defaults to 10 and is capped at 50; offset defaults to 0. |
| GET | `/doctors/:doctorId` | Public | Public profile lookup; only public/eligible Doctors are returned. |
| GET | `/doctors/:doctorId/slots` | Public | Requires `date` in `YYYY-MM-DD` format. |

## Authentication

| Method | Path | Access | Input/behavior |
|---|---|---|---|
| POST | `/auth/register/patient` | Public | Patient registration; strict schema. Name, email, password are required; profile fields are optional. |
| POST | `/auth/register/doctor` | Public | Doctor registration; strict schema with professional profile, specialization IDs, and verification credentials. Registration requires at least one specialization. |
| POST | `/auth/login` | Public | Email and password; regenerates session after successful authentication. |
| POST | `/auth/logout` | Authenticated | Destroys session and clears cookie. |
| GET | `/auth/me` | Authenticated | Returns current session user. |
| GET | `/auth/csrf` | Authenticated | Issues/returns a session-bound CSRF token with `Cache-Control: no-store`. |

Registration and login request schemas are in `server/src/validation/auth.schemas.js`; the route definitions do not accept a client-selected role.

## Doctor verification and Admin review

| Method | Path | Access | Input/behavior |
|---|---|---|---|
| GET | `/doctors/me/verification` | Doctor | Reads the authenticated Doctor's own verification state. |
| POST | `/doctors/me/verification` | Doctor + CSRF | Submits/corrects registration number, issuing authority, and version. Service permits only eligible missing/rejected states. |
| GET | `/admin/doctor-verifications` | Admin | Query `status` (pending, approved, rejected, missing_credentials), `limit` (1–100, default 20), and `offset` (0–1,000,000, default 0). |
| GET | `/admin/doctor-verifications/:verificationId` | Admin | Reads professional verification detail. |
| POST | `/admin/doctor-verifications/:verificationId/approve` | Admin + CSRF | Body includes verification `version`. |
| POST | `/admin/doctor-verifications/:verificationId/reject` | Admin + CSRF | Body includes `version` and a nonblank `reason` (maximum 2,000 characters). |

These routes set `Cache-Control: no-store`. See [doctor verification](doctor-verification.md) for state transitions, review history, and bootstrap guidance. The bootstrap CLI is not an HTTP endpoint.

## Doctor availability

All routes below require an authenticated, enabled Doctor and operate on the Doctor identified by the session. The service/repository also require approved verification for both the list and write operations. The `GET` routes are read-only; `POST` and `DELETE` routes change availability and are restricted to approved Doctors.

| Method | Path | Notes |
|---|---|---|
| GET | `/doctors/me/availability` | Lists own availability blocks. |
| POST | `/doctors/me/availability` | Creates a block; date and half-hour-aligned start/end times are validated. |
| DELETE | `/doctors/me/availability/:blockId` | Removes own eligible block. |
| GET | `/doctors/me/availability/rules` | Lists own recurring rules. |
| POST | `/doctors/me/availability/rules` | Creates a recurring rule; see `availability.schemas.js` for weekdays/date/time validation. |
| DELETE | `/doctors/me/availability/rules/:ruleId` | Stops own recurring rule. |
| GET | `/doctors/me/availability/exceptions` | Lists own exceptions. |
| POST | `/doctors/me/availability/exceptions` | Creates a dated exception or all-day range; exact mutually exclusive fields are enforced by schema. |
| DELETE | `/doctors/me/availability/exceptions/:exceptionId` | Removes own exception. |
| DELETE | `/doctors/me/availability/exceptions/ranges/:rangeId` | Removes own exception range; range ID is a UUID. |

## Appointments and consultations

| Method | Path | Access | Ownership and behavior |
|---|---|---|---|
| POST | `/appointments` | Patient | Body contains positive integer `slotId`; books an available slot. |
| GET | `/appointments/me` | Patient | Lists the authenticated Patient's appointments. |
| GET | `/appointments/:appointmentId` | Patient or Doctor | Must be the owning Patient or assigned Doctor. |
| POST | `/appointments/:appointmentId/cancel` | Patient or Doctor | Must own/be assigned; optional trimmed reason (up to 1,000 characters). Doctor cancellation requires a reason. |
| POST | `/appointments/:appointmentId/reschedule` | Patient | Must own appointment; body uses positive integer `slotId`. Lifecycle cutoffs apply. |
| POST | `/appointments/:appointmentId/ready` | Patient | Must own appointment and be within the check-in window. |
| POST | `/appointments/:appointmentId/open-room` | Doctor | Must be assigned Doctor and within room-open window. |
| POST | `/appointments/:appointmentId/begin-consultation` | Doctor | Must be assigned Doctor; room must be opened and lifecycle conditions must allow start. |
| POST | `/appointments/:appointmentId/no-show` | Doctor | Must be assigned Doctor and within no-show eligibility. |
| GET | `/appointments/:appointmentId/consultation` | Patient or Doctor | Assigned Doctor may read active/finished workspace; owning Patient may read only completed clinical content. |
| PATCH | `/appointments/:appointmentId/consultation` | Doctor | Assigned Doctor saves an active draft. Strict body includes `notes`, `prescriptionItems`, and nullable `followUp`; field limits are in `appointment.schemas.js`. |
| POST | `/appointments/:appointmentId/consultation/finish` | Doctor | Assigned Doctor finishes an active consultation. |
| POST | `/appointments/:appointmentId/video-token` | Patient or Doctor | Must own/be assigned to appointment; server determines video authorization. |
| GET | `/doctors/me/appointments` | Doctor | Lists the authenticated Doctor's appointments. |

Lifecycle time boundaries and transaction behavior are described in [Architecture](ARCHITECTURE.md). Exact input constraints live in `server/src/validation/appointment.schemas.js`; response objects are defined by controllers and services.

## Notifications

| Method | Path | Access | Input/behavior |
|---|---|---|---|
| GET | `/notifications` | Authenticated | `limit` defaults to 20 (range 1–50); `offset` defaults to 0. Lists only the current user's notifications. |
| PATCH | `/notifications/:notificationId/read` | Authenticated | Marks only the current user's notification as read. |

## Other behavior

- Routers are mounted in `server/src/app.js`; route-specific role checks are in `server/src/routes/`.
- Application errors, validation errors, and not-found responses are formatted by `server/src/middleware/error-handler.js` and `not-found.js`.
- This reference does not promise that endpoints are deployed or operational in a live environment. No production endpoint was queried to write it.
