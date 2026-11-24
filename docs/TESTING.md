# Testing and verification

This guide describes available package scripts and test organization. **No tests were run while creating this document.** A command being available is not evidence that it passed or that production is ready.

## Commands

Run from the repository root:

| Purpose | Command | Package script source |
|---|---|---|
| All backend and frontend tests | `npm test` | Root `test` calls server tests, then client tests. |
| Backend tests only | `npm --prefix server test` | Server `test` runs `vitest run`. |
| Frontend tests only | `npm --prefix client test` | Client `test` runs `vitest run`. |
| Lint client and server | `npm run lint` | Root script runs client lint, then server lint. |
| Build frontend | `npm run build` | Root script runs the client production build. |

The package scripts do not define a combined build-and-test command. The frontend build does not build the backend.

## Test organization

- `server/test/` contains Vitest tests for API routes, services/repositories, validation/configuration, migration behavior, booking/availability, consultation behavior, and Admin doctor verification. API tests use Supertest. Files named `*.integration.test.js` and selected migration tests exercise PostgreSQL behavior.
- `client/src/` contains Vitest tests alongside pages, components, context, and API helpers. They cover rendering and client behavior in the configured test environment; they are not proof of browser/device/provider behavior in production.
- `server/migrations/` defines schema changes. Migration tests may generate SQL or use PostgreSQL; a unit test that inspects SQL is distinct from applying the migration to a real deployment database.

## PostgreSQL tests: safe setup

Some database-backed tests are skipped when `DATABASE_URL` is absent. When it is present, tests can create temporary schemas and later drop them. The doctor-verification integration test explicitly rejects non-loopback database URLs; that guard is not a substitute for a safe target across the entire suite.

Before running database-backed tests:

1. Use a disposable local PostgreSQL instance/database containing no production or personal data.
2. Set `DATABASE_URL` in the test process to that disposable database. Do not rely on `server/.env` being loaded by Vitest; the package test scripts invoke Vitest directly.
3. Check the tests being run for their setup and teardown behavior. Some create and drop schemas. Do not run tests against production, shared staging, or a database whose contents must be preserved.
4. Keep test connection details and passwords out of logs, command history, documentation, and commits.

No database-provisioning command is supplied here because the repository does not define one. Use an approved local development setup. Test database cleanup behavior is test-specific; inspect it before execution.

## Manual browser and external-service checks

Vitest tests are not end-to-end browser tests. No Playwright, Cypress, or browser E2E script is defined in the package manifests. Manual checks should use a local or explicitly approved non-production environment and fictitious accounts/data. Depending on the change, check registration/login, role-protected pages, doctor verification, discovery and slots, booking lifecycle, availability, notifications, consultation records, and video with configured JaaS credentials.

Do not report a manual check as passed unless it was performed. Live Render/Neon deployment, production database state, and live JaaS calls remain unverified by this document. Historical doctor-verification validation notes are in [doctor-verification.md](doctor-verification.md); they are historical records, not results of this task.
