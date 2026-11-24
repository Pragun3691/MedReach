# Doctor verification implementation and local validation

This change is based on reviewed commit `4317579050e228b4f499938242e8aaf1f4b21c4c`, on branch `feat/admin-doctor-verification`. It preserves the registration validation UX. The note that a registration review patch was untracked records the worktree state at the time this document was written; it is historical, not an ongoing project instruction. Check the current worktree to determine that patch's present status.

## Architecture and state transitions

- New Doctor registration collects `registrationNumber` (2–100 trimmed characters) and `issuingAuthority` (2–160). Control characters are rejected. The existing transaction now inserts the user, profile, multiple specializations, and a Pending verification together. Any failure rolls all writes back. Patient registration is unchanged.
- `missing_credentials → pending → approved` or `rejected`. Only a missing/rejected request may be submitted or corrected by its authenticated Doctor owner. Pending credentials are frozen during review. Approved credentials cannot be edited through this workflow; revocation and changing an approved license require a separate future policy.
- No request body can choose a role, Doctor owner, reviewer, status, or review timestamp. Strict schemas reject extra fields. Doctor ownership is derived from the live authenticated session.
- Review requires an enabled Admin, an enabled Doctor, a Pending submission, complete credentials, and the version shown in the review view. Rows are locked in a transaction; the version changes on each submission/decision. Repeated, conflicting, and stale decisions return 409, including a review opened before rejection and resubmission.
- Review metadata is stored on the current verification. `doctor_verification_reviews` retains the decision, credential snapshot, reason, reviewer and timestamp for each reviewed submission. Resubmission clears current review metadata but preserves this history. No API edits or deletes history.
- Admin queries explicitly select only professional identity, profile, specialization and verification fields. They never query clinical notes, prescriptions, patient profiles or appointments. Existing clinical endpoint role restrictions are unchanged and covered by the regression suite.
- Public discovery, booking eligibility and availability retain the existing requirement for an enabled, approved Doctor. Missing, Pending and Rejected accounts remain private and cannot manage availability.

## Migration and backfill

`server/migrations/1790400000000_secure-doctor-verification.js` is additive and forward-only. It permits NULL registration credentials and submission date for the new `missing_credentials` state, adds a positive version, updates status/metadata checks, and creates the review history table. It retains the existing credential-pair uniqueness constraint.

The backfill selects Doctor profiles without a verification and inserts `missing_credentials` with NULL credentials and NULL submission date. `ON CONFLICT (doctor_id) DO NOTHING` makes the backfill safe to repeat and safe against a concurrent insert. It neither invents credentials nor approves accounts. Existing verification rows, including Approved rows, are not rewritten. User/profile/specialization/appointment data is preserved. Doctor users without profiles need separate manual investigation; the migration does not fabricate professional profiles.

The new credential-shape check is `NOT VALID` to preserve any malformed historical rows without making deployment destructive. PostgreSQL enforces it on all subsequent inserts/updates. Before later validating this constraint, an authorized operator should audit historical rows in an approved maintenance workflow. Application review independently rejects incomplete credentials. This task did not inspect or change any production data.

The existing migration runner applies all pending upward migrations in one transaction and records them. The migration does not create an Admin. Reversal throws an explanatory error instead of dropping credentials or review history; rollback requires a reviewed corrective forward migration.

## HTTP endpoints

The complete route/method/role inventory and request-validation notes are maintained in the [API reference](API.md). Verification endpoints set `Cache-Control: no-store`.

Doctor verification submission and Admin approve/reject mutations require `X-CSRF-Token`, obtained from the authenticated session endpoint. Tokens are random, compared in constant time, stored only in the server session, and invalidated by the existing login session regeneration/logout. The client obtains the current token for each verification mutation. Cross-origin callers cannot read it; no permissive CORS was introduced. Existing HttpOnly, SameSite=Lax cookies remain in use, with Secure cookies in production. This change scopes explicit CSRF enforcement to these mutations; it does not claim to retrofit every pre-existing mutation.

## UI

- `/doctor/verification`: all four statuses; rejection reason; accessible credential validation; correction and resubmission; success/error/reload states; availability link after approval.
- `/admin/doctor-verifications`: four status filters, paginated queue, professional and credential detail view, explicit approval confirmation, mandatory rejection reason, stale-request handling, disabled/incomplete request safeguards, loading/empty/error/success states.
- Both routes use `ProtectedRoute`, backed by mandatory server role checks. Header navigation is role-aware; the Doctor footer verification link now points to the authenticated status page. Styling follows the existing cream/green professional pages and collapses to one column on narrow screens. Review details receive keyboard focus when loaded.

## Explicit Admin bootstrap — manual operation only

There was no existing trusted Admin bootstrap command. The new `server/scripts/bootstrap-admin.js` is never called by startup, deployment, seed, or migration. It requires `--confirm-create-admin` and JSON on piped stdin. It accepts no default identity/password and refuses interactive echoed password input. It uses existing Argon2id hashing and a parameterized insert with the role fixed to Admin. An email collision fails; it never promotes, resets, or replaces an existing account. Success/failure output does not contain input, hashes, connection details, or passwords.

First verify the intended database and inject its environment through a trusted local shell or secret manager. The script deliberately does not automatically read `.env`. Review target host/database before invocation. For this task, use only a separate disposable localhost database. Production operation requires separate explicit approval and a trusted operator.

PowerShell example, from the repository root (prompts collect the real operator-selected identity; no credentials in command history):

```powershell
node server/scripts/bootstrap-admin.js --help
$adminSecret = Read-Host 'New Admin password (12–128 characters)' -AsSecureString
$adminBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminSecret)
try {
  @{
    fullName = Read-Host 'Trusted Admin full name'
    email = Read-Host 'Trusted Admin email'
    password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminBstr)
  } | ConvertTo-Json -Compress | node server/scripts/bootstrap-admin.js --confirm-create-admin
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminBstr)
  $adminSecret.Dispose()
  Remove-Variable adminSecret, adminBstr
}
```

Do not paste the resulting JSON into chat/logs, save it to disk, put passwords in arguments, or reuse test fixture credentials. A secret manager may pipe the same three JSON fields directly instead. Login uses the existing `/login` page; then open `/admin/doctor-verifications`.

## Local testing without production access

Use a freshly initialized disposable PostgreSQL cluster bound to loopback, with a dedicated port/database, never a copied production URL. No `.env` file is needed or loaded by the commands below. In this validation run the cluster was created under the OS temporary directory at `127.0.0.1:55439`; existing development and release worktrees were not used.

From the repository root, in PowerShell:

```powershell
npm.cmd --prefix server ci --include=dev
npm.cmd --prefix client ci --include=dev
$env:NODE_ENV = 'test'
$env:DATABASE_URL = 'postgresql://medreach_test@127.0.0.1:55439/postgres'
$env:DATABASE_SSL = 'false'
node server/scripts/migrate.js up
node server/scripts/migrate.js up
npm.cmd --prefix server test -- --maxWorkers=2
npm.cmd --prefix client test -- --maxWorkers=2
npm.cmd run lint
npm.cmd run build
git diff --check
```

The example database user/port refer to a disposable local test cluster, not application/Admin credentials. Use the actual user/port of your own disposable cluster. The new database suite refuses non-loopback URLs and uses its own temporary schema, dropping only that schema afterward. Existing database integration tests require `DATABASE_URL`; without it they skip. The full local run above includes them. The first migration run applies pending migrations; the second must report zero applied.

For manual UI validation, run the application against only that local database and serve the built client or use an isolated Vite/API port pair. Register a fictitious Doctor with multiple specializations, sign in to see Pending, then use a manually bootstrapped local Admin to reject with a reason. Sign back in as the Doctor, correct and resubmit; use a fresh Admin review to approve. Confirm public visibility and availability access only after approval. Test patient/wrong-role access and an unauthenticated browser as well. Never point the browser at production for this validation.

## Historical validation results and limitations

The following results were recorded in an earlier validation run. The exact run date, commit, and test-file scope are not recorded here; the reviewed base commit named above is not identified as the commit tested. These figures are not a statement about the current worktree and have not been rerun for this document.

- Full backend suite: 31 files, 629 tests passed, including real PostgreSQL migration/backfill, registration rollback, role/ownership checks, disabled users, CSRF session isolation/rotation, rejected resubmission, review races, public discovery and availability. Existing patient/appointment/clinical authorization tests pass.
- Full frontend suite: 14 files, 156 tests passed, including registration and new dashboard/status flows, route guards, confirmation, rejection reasons, escaping text, stale conflicts and CSRF client helpers.
- Backend and frontend lint: passed without new warnings. Production client build: passed. Local migrations: 10 applied, then 0 on rerun.
- One initial unrestricted-worker backend run passed all assertions but exited on a late-handled rejection in the unchanged existing recurring-availability race test. The full suite passes with `--maxWorkers=2`; no unrelated availability code or tests were changed.
- Historical dependency finding: a prior scan reported [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) for `source-map-js` as high severity in each package. The scan date and dependency versions in scope are not recorded. This is not a claim that the advisory is current; refresh it through an authorized dependency audit before using it for a decision.
- Approval records a human decision; submitted text is not independent license verification. No uploads, registry integration, automated approval, or clinical-record access was added. A trusted reviewer must perform the actual manual check outside the application. Historical decisions predating the new audit table remain in existing verification metadata; no historical reviewer/decision is fabricated.

Before deployment, review the diff and approve it, refresh the historical dependency finding, rehearse migrations on a disposable/restored non-production database, define the trusted manual review procedure, and arrange explicit Admin creation via the CLI if needed. Deploy compatible backend/frontend code together with the upward migration so required fields and schema agree. This task does not authorize or perform deployment, production migration, production bootstrap, commit, push, or merge.

## Exact files changed

- `client/src/App.jsx`
- `client/src/components/ProtectedRoute.jsx`
- `client/src/components/PublicFooter.jsx`
- `client/src/components/PublicHeader.jsx`
- `client/src/index.css`
- `client/src/lib/api.js`
- `client/src/lib/api.test.js`
- `client/src/lib/verification.js`
- `client/src/pages/AdminDoctorVerificationsPage.jsx`
- `client/src/pages/DoctorVerificationPage.jsx`
- `client/src/pages/RegisterPage.jsx`
- `client/src/pages/RegisterPage.test.jsx`
- `client/src/pages/VerificationPages.test.jsx`
- `docs/doctor-verification.md`
- `server/migrations/1790400000000_secure-doctor-verification.js`
- `server/scripts/bootstrap-admin.js`
- `server/src/app.js`
- `server/src/data-access/auth.repository.js`
- `server/src/data-access/verification.repository.js`
- `server/src/middleware/csrf.js`
- `server/src/routes/auth.routes.js`
- `server/src/routes/verification.routes.js`
- `server/src/services/admin-bootstrap.service.js`
- `server/src/services/auth.service.js`
- `server/src/services/verification.service.js`
- `server/src/validation/auth.schemas.js`
- `server/src/validation/verification.schemas.js`
- `server/test/auth-api.test.js`
- `server/test/doctor-verification.integration.test.js`
