# Architecture

This document describes the implementation in this repository. The planned Render + Neon deployment is not confirmed live; see the deployment status in the [root README](../README.md).

## Components

### Frontend

`client/` is a React application built with Vite, React Router, and Tailwind CSS. `client/src/App.jsx` declares browser routes. Pages and components call the backend through `client/src/lib/api.js`. During development, `client/vite.config.js` proxies `/api` to `http://127.0.0.1:3000`.

### Backend

`server/` is a Node.js ES-module application using Express. `server/src/app.js` mounts API routers and middleware. Route modules define HTTP methods and access guards; controllers parse and shape HTTP requests/responses; services contain application rules; `server/src/data-access/` contains PostgreSQL operations. Validation schemas are in `server/src/validation/`.

`server/src/server.js` listens on `PORT` (default 3000) and starts the recurring-availability extender job. The job extends recurring Doctor availability. It is a process-local interval, not a separately deployed worker in this repository.

### Database

PostgreSQL stores users and profiles, specializations and aliases, verification records, Doctor availability and slots, appointments, notifications, consultation records, prescription items, and session data. `pg` provides database access. Ordered schema changes are in `server/migrations/` and use `node-pg-migrate`.

## Request and data flow

1. The browser sends JSON requests to `/api/...`. In development, Vite forwards them to Express. In production, Express serves the API and built `client/dist` files from the same process.
2. Express applies JSON parsing and session middleware, then dispatches to a router. Public routes can proceed without a session. Protected routes authenticate the session, and role-restricted routes apply role authorization.
3. Controllers validate inputs with Zod schemas and call services. Services apply business, ownership, and lifecycle rules; data-access modules issue parameterized PostgreSQL queries and transactions.
4. Controllers return JSON or a no-content response. Validation errors are returned as HTTP 400; application errors preserve their status; unexpected errors return HTTP 500. Unknown API routes return HTTP 404 JSON.

The exact endpoint inventory is in [API reference](API.md). The database tables and migrations are summarized in [Database](DATABASE.md).

## Authentication and authorization

- Passwords are hashed with Argon2id (`server/src/security/password.js`).
- `express-session` issues the `medreach.sid` cookie. Sessions are stored in PostgreSQL table `user_sessions` through `connect-pg-simple`; the session store is configured not to create the table automatically.
- Authentication middleware reads the user ID from the session and rechecks the user. Missing/disabled accounts are rejected; disabled-account sessions are destroyed.
- `authorizeRoles` restricts routes by role (`patient`, `doctor`, or `admin`). Services/repositories additionally check that the user owns the appointment or is its assigned Doctor. Doctor identity for availability and verification actions comes from the authenticated user, not a client-selected owner ID.
- Explicit CSRF token enforcement is attached to doctor-verification submission and Admin approve/reject mutations. Do not assume every existing mutation route uses this middleware.
- Production cookies are configured `Secure`, `HttpOnly`, and `SameSite=Lax`; Express trusts one proxy hop in production. The actual hosting proxy configuration has not been verified.

## Appointment and consultation lifecycle

Appointments reference a Patient profile and an available slot. The assigned Doctor is resolved through the slot's availability block. Booking and rescheduling use transactions and locks; a partial unique index prevents multiple active appointments from reserving the same slot.

Patient check-in becomes available 15 minutes before the slot. The assigned Doctor can open the room five minutes before start and begin the consultation after opening it. No-show is a manual Doctor action from 15 minutes after start, with no upper time bound. Patient cancellation and rescheduling close 15 minutes after start and are disabled once a consultation begins. An active consultation may continue beyond the slot until the Doctor explicitly finishes it; finishing the consultation also completes the appointment.

The video token endpoint authorizes the appointment owner or assigned Doctor before issuing a short-lived JaaS JWT. Clinical drafts are Doctor-only while active. A Patient who owns the appointment can read the finished consultation record; Admin verification routes do not provide clinical-record access.

## Production serving

The source verifies a single Express process serves API routes and the built client: `server/src/app.js` mounts the production frontend router after `/api`, and `server/src/middleware/frontend.js` serves `client/dist` and an HTML fallback for approved page paths. `npm start` invokes the server package's start script. This describes repository behavior only; a live deployment is not verified.
