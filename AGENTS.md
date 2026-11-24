# Instructions for coding agents

## Project structure

- `client/` contains the React, Vite, React Router, and Tailwind frontend.
- `server/` contains the Express API, PostgreSQL access, sessions, and server scripts.
- `server/src/routes/`, `controllers/`, `services/`, and `data-access/` separate HTTP routing, request handling, business logic, and persistence.
- `server/migrations/` contains ordered PostgreSQL schema changes. `server/test/` and `client/src/` contain backend and frontend tests.
- `docs/` contains project documentation. The root `README.md` is the setup and handover entry point.

## Before making changes

1. Inspect the relevant source, tests, package scripts, and documentation before editing. Trace existing behavior and follow the established patterns.
2. Check the current Git status and preserve all user changes, including untracked files. Do not discard, overwrite, or silently reformat unrelated work.
3. Keep changes within the existing project architecture. Do not add frameworks, services, dependencies, or architectural layers unless explicitly approved.
4. Update relevant documentation when behavior, commands, configuration, or user-visible features change.

## Development and verification

- Use commands declared in `package.json` files. Do not invent project scripts.
- Add or update tests for relevant application-code changes. Run the focused tests and appropriate broader checks when authorized and safe; report tests that were not run.
- Tests that use PostgreSQL must use a disposable, non-production database. Confirm the target before running database-dependent commands.
- Do not claim a feature, test result, migration, deployment, or runtime behavior has been verified unless it was actually verified in the relevant environment. Passing automated tests does not prove production readiness.

## Database, migrations, and production safety

- Never connect to, inspect, or modify a production database unless the user explicitly requests that exact operation and the target is confirmed.
- Never run a migration, seed, reset, rollback, or destructive database command against production. Never use production data as a development or test fixture.
- Before executing any migration, inspect and explain its SQL/effects, dependencies, ordering, data impact, reversibility, environment target, and recovery plan. Obtain explicit user approval for the specific production migration operation.
- Treat all database connection strings and credentials as secrets. Do not print, quote, place in commands/history, commit, or expose them in client code.

## Secrets and deployment

- Do not read or reveal secret values when variable names are sufficient. Keep credentials in environment variables or the authorized secret store, never in source files or documentation.
- The Render + Neon deployment is planned, not verified live. Do not claim a deployment exists or invent Render/Neon settings. Confirm uncertain platform details before documenting or changing them.
- Never deploy, publish, or push unless explicitly authorized.

## Scope discipline

- Follow the user's read-only, file-scope, and runtime restrictions exactly.
- Do not modify dependencies, lockfiles, application configuration, or migrations for a documentation-only task.
- Report assumptions, unresolved questions, and verification limits clearly.
