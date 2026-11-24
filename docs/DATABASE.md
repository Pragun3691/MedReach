# Database and migrations

This document summarizes schema definitions in `server/migrations/`; the migration files remain the authoritative schema source. No production database was inspected for this document.

## Main entities and relationships

- `users` stores identity, password hash, role, and enabled state. The application creates `patient_profiles` for Patients and `doctor_profiles` for Doctors; each profile points to its user. The schema allows `patient`, `doctor`, and `admin` roles.
- `doctor_profiles` belongs to a Doctor user. `doctor_specializations` joins Doctor profiles to `specializations`; `specialization_search_terms` stores search aliases for specializations.
- `doctor_verifications` belongs to a Doctor profile and records credential/status/review fields. The pending verification migration adds `doctor_verification_reviews` for review history.
- `availability_blocks` belong to Doctor profiles. Each block has `slots`. Recurring rules can generate blocks; blocks can reference a recurring rule. `availability_exceptions` records Doctor time off and may group all-day date ranges.
- `appointments` link a Patient profile to a slot. Rescheduling is represented by an appointment self-reference. The assigned Doctor is derived through slot -> availability block -> Doctor profile.
- `consultations` are associated one-to-one with appointments. `consultation_prescription_items` are associated with a consultation and ordered by position. Notes and optional follow-up fields live on consultations.
- `notifications` belong to a recipient user. Appointment-related events can create notification messages, but the notification table stores message/action snapshots and has no appointment foreign key. `user_sessions` stores Express session records; its schema is designed for `connect-pg-simple`.

Constraints and indexes (including role/status checks, slot uniqueness, date/time rules, and foreign-key deletion behavior) are defined in the migrations, not duplicated here.

## Migration history in this worktree

The runner executes migration files in timestamp/name order. The integration branch contains these ten files:

| Order | File | Main change |
|---:|---|---|
| 1 | `server/migrations/1788175200000_create-public-discovery-schema.js` | Users, Doctor profiles, specializations/search terms, initial verification, availability blocks, and slots. |
| 2 | `server/migrations/1788175300000_create-authentication-schema.js` | Patient profiles, PostgreSQL session table, and authentication-related constraints. |
| 3 | `server/migrations/1788175400000_create-appointment-booking-schema.js` | Appointments and in-app notifications with booking constraints/indexes. |
| 4 | `server/migrations/1788775500000_create-consultation-lifecycle.js` | Appointment room-open timestamp and one consultation per appointment. |
| 5 | `server/migrations/1789375600000_add-consultation-clinical-workspace.js` | Consultation notes/follow-up fields and ordered prescription items. |
| 6 | `server/migrations/1790000000000_add_search_aliases.js` | Inserts specialization search aliases. |
| 7 | `server/migrations/1790100000000_add-recurring-availability-rules.js` | Recurring availability rules and a link from generated blocks to rules. |
| 8 | `server/migrations/1790200000000_add-availability-exceptions.js` | Doctor availability exceptions and supporting constraints/indexes. |
| 9 | `server/migrations/1790300000000_add-availability-exception-groups.js` | Group UUID for all-day exception ranges. |
| 10 | `server/migrations/1790400000000_secure-doctor-verification.js` | Adds `missing_credentials`, verification versioning and credential checks, backfills Doctors lacking verification rows, and creates review history. This migration is described as pending below. |

### Doctor-verification migration status

The supplied Neon production migration list contains the first nine migration names above and does not contain `1790400000000_secure-doctor-verification`. **Based on that supplied list only**, the doctor-verification migration is pending. This was not independently checked against Neon or any database. Confirm the production migration history and actual schema before taking action.

The migration modifies `doctor_verifications`, inserts a `missing_credentials` row for Doctor profiles that lack one, and creates `doctor_verification_reviews`. It preserves existing verification rows in its backfill. Its `down()` intentionally throws; it is forward-only. See [doctor verification](doctor-verification.md) for more detail.

## Safe development migrations

Use only a local disposable development database. From the repository root, configure `server/.env` with that local connection and run:

```bash
npm --prefix server run migrate:up
```

The package script loads `server/.env` when present and invokes `server/scripts/migrate.js up`. The wrapper uses `public.pgmigrations`, checks ordering, enables the migration lock, and applies pending upward migrations in a single transaction. It reports how many it applied. Read the migration files before applying them. Never use this command with a production connection.

The development `migrate:down` script exists, but rollback can lose schema/data and is not an automatic recovery plan. Production runner mode accepts upward migrations only.

## Production migration precautions

The root script `npm run migrate:production` invokes the server production migration command. Production mode forces `NODE_ENV=production`, requires injected connection/TLS settings, does not load a local `.env`, checks the migration directory, and applies pending upward migrations under a lock and one transaction. The runner uses `public.pgmigrations` and checks ordering. Do not run this command without a reviewed migration plan, confirmed target, operator authorization, and recovery plan.

The pending verification migration depends on the existing `users`, `doctor_profiles`, and `doctor_verifications` tables and specifically named verification constraints. These are prerequisites in the earlier migrations. Repository order is valid, but live schema drift and the actual production history are unknown.

## Backups and recovery limits

This repository contains no documented database backup/restore command, retention policy, point-in-time recovery configuration, or recovery rehearsal. A migration transaction protects the migration batch from a partial commit on SQL failure; it is not a backup and does not reverse a committed migration. The verification migration is forward-only. The database provider's backup, restore, and point-in-time recovery procedures and recovery objectives must be confirmed outside this repository before production changes. Do not invent or assume them.
