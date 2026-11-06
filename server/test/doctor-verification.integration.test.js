import { randomUUID } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import pg from 'pg'
import request from 'supertest'
import session from 'express-session'
import { MigrationBuilder } from 'node-pg-migrate'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createSessionMiddleware } from '../src/session/session.js'
import { createAuthRepository } from '../src/data-access/auth.repository.js'
import { createVerificationRepository } from '../src/data-access/verification.repository.js'
import { createPublicDoctorRepository } from '../src/data-access/public-doctor.repository.js'
import { createAvailabilityRepository } from '../src/data-access/availability.repository.js'
import { createAuthService } from '../src/services/auth.service.js'
import { createVerificationService } from '../src/services/verification.service.js'
import { createPublicDoctorService } from '../src/services/public-doctor.service.js'
import { createAvailabilityService } from '../src/services/availability.service.js'
import { bootstrapAdmin } from '../src/services/admin-bootstrap.service.js'
import { verifyPassword } from '../src/security/password.js'
import { backfillDoctorVerificationsSql, up, down } from '../migrations/1790400000000_secure-doctor-verification.js'

function migrationSql(migration) {
  const pgm = new MigrationBuilder({ query() { throw new Error('SQL generation only') } }, undefined, false, console)
  migration(pgm)
  return pgm.getSql()
}

describe('doctor verification migration SQL', () => {
  it('retains legacy reviewed rows and adds explicit incomplete state without fabricated credentials', () => {
    const sql = migrationSql(up)
    expect(sql).toContain("'missing_credentials'")
    expect(sql).toContain('NULL, NULL, \'missing_credentials\', NULL')
    expect(sql).toContain('ON CONFLICT (doctor_id) DO NOTHING')
    expect(sql).toContain('NOT VALID')
    expect(sql).not.toMatch(/DELETE FROM|DROP TABLE|UPDATE users/i)
    expect(() => down()).toThrow('forward-only')
  })
})

const databaseUrl = process.env.DATABASE_URL
const withDatabase = databaseUrl ? describe : describe.skip
const password = 'Local integration password 2026'
const credentials = { registrationNumber: 'TEST/REG-123', issuingAuthority: 'Test Medical Council' }
const doctorInput = {
  fullName: 'Doctor Verification Test', email: 'doctor@example.test', password,
  qualification: 'MBBS, MD', experienceYears: 7, specializationIds: [1, 2], ...credentials,
}

withDatabase('doctor verification PostgreSQL and HTTP integration', () => {
  let pool, basePool, schema, app, authRepository, repository, legacyId, preserved, adminId
  const provider = () => pool

  async function login(email) {
    const agent = request.agent(app)
    const response = await agent.post('/api/auth/login').send({ email, password })
    expect(response.status).toBe(200)
    const token = await agent.get('/api/auth/csrf')
    expect(token.status).toBe(200)
    return { agent, csrf: token.body.csrfToken }
  }
  async function register(label) {
    const input = { ...doctorInput, email: `${label}@example.test`, registrationNumber: `TEST-${label}` }
    const response = await request(app).post('/api/auth/register/doctor').send(input)
    expect(response.status).toBe(201)
    const id = response.body.user.id
    const verification = (await pool.query('SELECT * FROM doctor_verifications WHERE doctor_id = $1', [id])).rows[0]
    return { id, verification, input }
  }
  async function review(admin, row, action, extra = {}) {
    return admin.agent.post(`/api/admin/doctor-verifications/${row.id}/${action}`)
      .set('X-CSRF-Token', admin.csrf).send({ version: row.version, ...extra })
  }

  beforeAll(async () => {
    // This suite is deliberately restricted to disposable loopback databases.
    const url = new URL(databaseUrl)
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      throw new Error('Verification integration tests require a disposable localhost database')
    }
    basePool = new pg.Pool({ connectionString: databaseUrl, ssl: false })
    schema = `verification_${randomUUID().replaceAll('-', '')}`
    await basePool.query(`CREATE SCHEMA "${schema}"`)
    pool = new pg.Pool({ connectionString: databaseUrl, ssl: false, options: `-c search_path=${schema}`, max: 8, statement_timeout: 5000 })
    const directory = new URL('../migrations/', import.meta.url)
    for (const file of (await readdir(directory)).sort()) {
      if (!file.endsWith('.js') || file.startsWith('179040')) continue
      await pool.query(migrationSql((await import(new URL(file, directory))).up))
    }
    await pool.query("INSERT INTO specializations (id, name) VALUES (1, 'General Medicine'), (2, 'Cardiology')")
    await bootstrapAdmin({ fullName: 'Trusted Reviewer', email: 'reviewer@example.test', password }, provider)
    adminId = (await pool.query("SELECT id FROM users WHERE role = 'admin'")).rows[0].id
    const legacy = await pool.query("INSERT INTO users (full_name, email, password_hash, role) SELECT 'Legacy Doctor', 'legacy@example.test', password_hash, 'doctor' FROM users WHERE id = $1 RETURNING id", [adminId])
    legacyId = legacy.rows[0].id
    await pool.query("INSERT INTO doctor_profiles (user_id, qualification) VALUES ($1, 'MBBS')", [legacyId])
    const verified = await pool.query("INSERT INTO users (full_name, email, password_hash, role) VALUES ('Verified Legacy', 'verified@example.test', 'test-only', 'doctor') RETURNING id")
    await pool.query("INSERT INTO doctor_profiles (user_id, qualification) VALUES ($1, 'MD')", [verified.rows[0].id])
    preserved = (await pool.query(`INSERT INTO doctor_verifications (doctor_id, registration_number, issuing_authority, status, reviewed_by_user_id, reviewed_at)
      VALUES ($1, 'LEGACY-VERIFIED', 'Legacy Council', 'approved', $2, current_timestamp) RETURNING *`, [verified.rows[0].id, adminId])).rows[0]
    const migrationClient = await pool.connect()
    await migrationClient.query('BEGIN')
    try {
      await migrationClient.query(migrationSql(up))
      await migrationClient.query('COMMIT')
    } catch (error) {
      await migrationClient.query('ROLLBACK')
      throw error
    } finally {
      migrationClient.release()
    }
    authRepository = createAuthRepository(provider)
    repository = createVerificationRepository(provider)
    app = createApp({
      sessionMiddleware: createSessionMiddleware({ store: new session.MemoryStore() }),
      auth: createAuthService(authRepository), verifications: createVerificationService(repository),
      doctors: createPublicDoctorService(createPublicDoctorRepository(provider)),
      availability: createAvailabilityService(createAvailabilityRepository(provider)),
    })
  }, 30000)

  afterAll(async () => {
    await pool?.end()
    if (schema && basePool) await basePool.query(`DROP SCHEMA "${schema}" CASCADE`)
    await basePool?.end()
  })

  it('backfills missing rows with genuine nulls and preserves every existing verification field', async () => {
    const row = (await pool.query('SELECT * FROM doctor_verifications WHERE doctor_id = $1', [legacyId])).rows[0]
    expect(row).toMatchObject({ status: 'missing_credentials', registration_number: null, issuing_authority: null, submitted_at: null, reviewed_at: null, reviewed_by_user_id: null })
    const after = (await pool.query('SELECT * FROM doctor_verifications WHERE id = $1', [preserved.id])).rows[0]
    expect(after).toEqual({ ...preserved, version: 1 })
    const before = (await pool.query('SELECT * FROM doctor_verifications ORDER BY id')).rows
    await pool.query(backfillDoctorVerificationsSql)
    await pool.query(backfillDoctorVerificationsSql)
    expect((await pool.query('SELECT * FROM doctor_verifications ORDER BY id')).rows).toEqual(before)
  })

  it('creates the Doctor, profile, multiple specializations and pending verification atomically', async () => {
    const { id, verification } = await register('atomic')
    expect(verification).toMatchObject({ status: 'pending', registration_number: 'TEST-atomic', issuing_authority: credentials.issuingAuthority, reviewed_at: null, reviewed_by_user_id: null })
    expect((await pool.query('SELECT * FROM doctor_profiles WHERE user_id = $1', [id])).rowCount).toBe(1)
    expect((await pool.query('SELECT * FROM doctor_specializations WHERE doctor_id = $1', [id])).rowCount).toBe(2)
    const failed = await request(app).post('/api/auth/register/doctor').send({ ...doctorInput, email: 'rollback@example.test', registrationNumber: 'TEST-atomic' })
    expect(failed.status).toBe(409)
    expect(failed.body.error.code).toBe('CREDENTIALS_IN_USE')
    expect((await pool.query("SELECT * FROM users WHERE email = 'rollback@example.test'")).rowCount).toBe(0)
    // A failure at the last insert also rolls back profile and specialization writes.
    await expect(authRepository.createDoctor({ ...doctorInput, email: 'null-rollback@example.test', registrationNumber: null, passwordHash: 'test-only' })).rejects.toMatchObject({ code: '23514' })
    expect((await pool.query("SELECT * FROM users WHERE email = 'null-rollback@example.test'")).rowCount).toBe(0)
  })

  it.each([
    { registrationNumber: '' }, { issuingAuthority: ' ' }, { registrationNumber: 'x'.repeat(101) },
    { issuingAuthority: 'x'.repeat(161) }, { registrationNumber: 'REG\n123' }, { role: 'admin' },
  ])('rejects invalid credentials or privilege fields: %j', async override => {
    const response = await request(app).post('/api/auth/register/doctor').send({ ...doctorInput, ...override })
    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect((await pool.query("SELECT * FROM users WHERE email = 'doctor@example.test'")).rowCount).toBe(0)
  })

  it('rejects missing credential fields and public Admin creation', async () => {
    const { registrationNumber: _registrationNumber, issuingAuthority: _issuingAuthority, ...missing } = doctorInput
    expect((await request(app).post('/api/auth/register/doctor').send(missing)).status).toBe(400)
    expect((await request(app).post('/api/auth/register/admin').send(doctorInput)).status).toBe(404)
    expect((await request(app).post('/api/auth/register/patient').send({ fullName: 'Patient', email: 'elevate@example.test', password, role: 'admin' })).status).toBe(400)
  })

  it('allows Admin listing/detail, excludes clinical data, and requires actual live roles', async () => {
    const doctor = await register('authorization')
    const patient = await request(app).post('/api/auth/register/patient').send({ fullName: 'Test Patient', email: 'patient@example.test', password })
    expect(patient.status).toBe(201)
    const admin = await login('reviewer@example.test')
    const listing = await admin.agent.get('/api/admin/doctor-verifications?status=pending&limit=1')
    expect(listing.status).toBe(200)
    expect(listing.body.items).toHaveLength(1)
    expect(listing.headers['cache-control']).toBe('no-store')
    const detail = await admin.agent.get(`/api/admin/doctor-verifications/${doctor.verification.id}`)
    expect(detail.body.verification).toMatchObject({ qualification: 'MBBS, MD', registrationNumber: doctor.input.registrationNumber, specializations: expect.any(Array) })
    expect(Object.keys(detail.body.verification).sort()).toEqual([
      'id', 'doctorId', 'status', 'version', 'registrationNumber', 'issuingAuthority', 'rejectionReason', 'submittedAt', 'reviewedByUserId', 'reviewedAt', 'fullName', 'isEnabled', 'qualification', 'experienceYears', 'bio', 'clinicName', 'clinicCity', 'clinicDistrict', 'specializations',
    ].sort())
    for (const email of [doctor.input.email, 'patient@example.test']) {
      const other = await login(email)
      expect((await other.agent.get('/api/admin/doctor-verifications')).status).toBe(403)
      expect((await other.agent.get(`/api/admin/doctor-verifications/${doctor.verification.id}`)).status).toBe(403)
      expect((await review(other, doctor.verification, 'approve')).status).toBe(403)
      expect((await review(other, doctor.verification, 'reject', { reason: 'forged' })).status).toBe(403)
    }
    expect((await request(app).get('/api/admin/doctor-verifications')).status).toBe(401)
    expect((await request(app).post(`/api/admin/doctor-verifications/${doctor.verification.id}/approve`).send({ version: 1 })).status).toBe(401)
    await pool.query('UPDATE users SET is_enabled = FALSE WHERE id = $1', [adminId])
    expect((await admin.agent.get('/api/admin/doctor-verifications')).status).toBe(403)
    expect((await review(admin, doctor.verification, 'approve')).status).toBe(401)
    await pool.query('UPDATE users SET is_enabled = TRUE WHERE id = $1', [adminId])
  })

  it('blocks absent, forged, cross-session and old-session CSRF tokens', async () => {
    const { verification } = await register('csrf')
    const admin = await login('reviewer@example.test')
    const second = await login('reviewer@example.test')
    for (const token of ['', 'x'.repeat(64), second.csrf]) {
      const result = await admin.agent.post(`/api/admin/doctor-verifications/${verification.id}/approve`).set('X-CSRF-Token', token).send({ version: 1 })
      expect(result.status).toBe(403)
      expect(result.body.error.code).toBe('CSRF_INVALID')
    }
    await admin.agent.post('/api/auth/logout')
    await admin.agent.post('/api/auth/login').send({ email: 'reviewer@example.test', password })
    expect((await review(admin, verification, 'approve')).body.error.code).toBe('CSRF_INVALID')
    expect((await pool.query('SELECT status FROM doctor_verifications WHERE id = $1', [verification.id])).rows[0].status).toBe('pending')
  })

  it('blocks approval of missing credentials and review of disabled Doctors', async () => {
    const admin = await login('reviewer@example.test')
    const row = (await pool.query('SELECT * FROM doctor_verifications WHERE doctor_id = $1', [legacyId])).rows[0]
    const legacy = await login('legacy@example.test')
    expect((await legacy.agent.get('/api/doctors/me/verification')).body.verification.status).toBe('missing_credentials')
    expect((await request(app).get(`/api/doctors/${legacyId}`)).status).toBe(404)
    expect((await legacy.agent.get('/api/doctors/me/availability')).status).toBe(403)
    expect((await review(admin, row, 'approve')).status).toBe(409)
    await expect(pool.query("UPDATE doctor_verifications SET status = 'approved', reviewed_by_user_id = $2, reviewed_at = current_timestamp WHERE id = $1", [row.id, adminId])).rejects.toMatchObject({ code: '23514' })
    const disabled = await register('disabled')
    const doctorSession = await login(disabled.input.email)
    await pool.query('UPDATE users SET is_enabled = FALSE WHERE id = $1', [disabled.id])
    expect((await review(admin, disabled.verification, 'approve')).status).toBe(409)
    expect((await doctorSession.agent.get('/api/doctors/me/verification')).status).toBe(403)
  })

  it('requires rejection reasons, records reviewer metadata, and prevents repeated/conflicting reviews', async () => {
    const { verification } = await register('review')
    const admin = await login('reviewer@example.test')
    for (const extra of [{}, { reason: '' }, { reason: ' ' }, { reason: 'x'.repeat(2001) }, { reason: 'Invalid\u0000reason' }]) {
      expect((await review(admin, verification, 'reject', extra)).status).toBe(400)
    }
    expect((await review(admin, verification, 'approve', { reviewedByUserId: 99 })).status).toBe(400)
    expect((await review(admin, verification, 'reject', { reason: ' Council does not match the registration. ' })).status).toBe(200)
    const row = (await pool.query('SELECT * FROM doctor_verifications WHERE id = $1', [verification.id])).rows[0]
    expect(row).toMatchObject({ status: 'rejected', rejection_reason: 'Council does not match the registration.', reviewed_by_user_id: adminId, version: 2 })
    expect(row.reviewed_at).toBeInstanceOf(Date)
    expect((await review(admin, row, 'approve')).status).toBe(409)
    expect((await review(admin, verification, 'reject', { reason: 'again' })).status).toBe(409)
    const history = (await pool.query('SELECT * FROM doctor_verification_reviews WHERE verification_id = $1', [verification.id])).rows
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ decision: 'rejected', reviewed_by_user_id: adminId, submission_version: 1 })
  })

  it('permits one of concurrent approve/reject actions and records exactly one decision', async () => {
    const { verification } = await register('race')
    const admin = await login('reviewer@example.test')
    const other = await login('reviewer@example.test')
    const responses = await Promise.all([review(admin, verification, 'approve'), review(other, verification, 'reject', { reason: 'Conflicting decision' })])
    expect(responses.map(value => value.status).sort()).toEqual([200, 409])
    expect((await pool.query('SELECT * FROM doctor_verification_reviews WHERE verification_id = $1', [verification.id])).rowCount).toBe(1)
  })

  it('limits credential access to the owner, allows missing/rejected resubmission, and defeats stale reviews', async () => {
    const doctor = await register('owner')
    const other = await register('other-owner')
    const owner = await login(doctor.input.email)
    const admin = await login('reviewer@example.test')
    expect((await owner.agent.get('/api/doctors/me/verification')).body.verification.registrationNumber).toBe(doctor.input.registrationNumber)
    expect((await request(app).get('/api/doctors/me/verification')).status).toBe(401)
    for (const email of ['reviewer@example.test', 'patient@example.test']) {
      const wrongRole = await login(email)
      expect((await wrongRole.agent.get('/api/doctors/me/verification')).status).toBe(403)
      expect((await wrongRole.agent.post('/api/doctors/me/verification').set('X-CSRF-Token', wrongRole.csrf).send({ ...credentials, version: 1 })).status).toBe(403)
    }
    expect((await owner.agent.post('/api/doctors/me/verification').set('X-CSRF-Token', owner.csrf).send({ ...credentials, version: 1, doctorId: other.id })).status).toBe(400)
    expect((await owner.agent.post('/api/doctors/me/verification').set('X-CSRF-Token', owner.csrf).send({ ...credentials, version: 1 })).status).toBe(409)
    await review(admin, doctor.verification, 'reject', { reason: 'Please correct your council.' })
    const rejected = (await owner.agent.get('/api/doctors/me/verification')).body.verification
    expect(rejected.rejectionReason).toBe('Please correct your council.')
    const updated = { registrationNumber: 'CORRECTED-OWNER', issuingAuthority: 'Corrected Council', version: rejected.version }
    expect((await owner.agent.post('/api/doctors/me/verification').send(updated)).status).toBe(403)
    expect((await owner.agent.post('/api/doctors/me/verification').set('X-CSRF-Token', owner.csrf).send(updated)).status).toBe(200)
    expect((await review(admin, doctor.verification, 'approve')).status).toBe(409)
    const pending = (await owner.agent.get('/api/doctors/me/verification')).body.verification
    expect(pending).toMatchObject({ ...updated, version: 3, status: 'pending', rejectionReason: null })
    expect((await review(admin, pending, 'approve')).status).toBe(200)
    expect((await owner.agent.post('/api/doctors/me/verification').set('X-CSRF-Token', owner.csrf).send({ ...updated, version: 4 })).status).toBe(409)
    expect((await repository.getMine(other.id)).registrationNumber).toBe(other.input.registrationNumber)
    expect((await pool.query('SELECT * FROM doctor_verification_reviews WHERE verification_id = $1 ORDER BY id', [pending.id])).rows.map(row => row.decision)).toEqual(['rejected', 'approved'])
    const legacy = (await pool.query('SELECT * FROM doctor_verifications WHERE doctor_id = $1', [legacyId])).rows[0]
    const legacySession = await login('legacy@example.test')
    expect((await legacySession.agent.post('/api/doctors/me/verification').set('X-CSRF-Token', legacySession.csrf).send({ ...credentials, version: legacy.version })).status).toBe(200)
    expect((await repository.getMine(legacyId)).status).toBe('pending')
  })

  it('keeps pending/rejected/missing Doctors private and blocks availability; approval enables both', async () => {
    const doctor = await register('discoverability')
    const owner = await login(doctor.input.email)
    const admin = await login('reviewer@example.test')
    const availability = { date: '2090-01-02', startTime: '09:00', endTime: '10:00' }
    const assertPrivate = async () => {
      expect((await request(app).get(`/api/doctors/${doctor.id}`)).status).toBe(404)
      expect((await request(app).get(`/api/doctors?name=${encodeURIComponent(doctor.input.fullName)}`)).body.items.some(item => item.id === doctor.id)).toBe(false)
      expect((await owner.agent.get('/api/doctors/me/availability')).status).toBe(403)
      expect((await owner.agent.post('/api/doctors/me/availability').send(availability)).status).toBe(403)
    }
    await assertPrivate()
    await review(admin, doctor.verification, 'reject', { reason: 'Needs correction' })
    await assertPrivate()
    const row = await repository.getMine(doctor.id)
    await repository.submit(doctor.id, { ...credentials, registrationNumber: 'DISCOVERABLE', version: row.version })
    const pending = await repository.getMine(doctor.id)
    expect((await review(admin, pending, 'approve')).status).toBe(200)
    expect((await request(app).get(`/api/doctors/${doctor.id}`)).status).toBe(200)
    expect((await owner.agent.post('/api/doctors/me/availability').send(availability)).status).toBe(201)
    expect((await owner.agent.get('/api/doctors/me/availability')).status).toBe(200)
  })

  it('bootstraps an Argon2id Admin without promoting or replacing an existing account', async () => {
    const user = (await pool.query('SELECT * FROM users WHERE id = $1', [adminId])).rows[0]
    expect(user.password_hash).toMatch(/^\$argon2id\$/)
    expect(await verifyPassword(user.password_hash, password)).toBe(true)
    await expect(bootstrapAdmin({ fullName: 'Impostor', email: 'patient@example.test', password }, provider)).rejects.toMatchObject({ code: '23505' })
    expect((await pool.query("SELECT role FROM users WHERE email = 'patient@example.test'")).rows[0].role).toBe('patient')
    await expect(bootstrapAdmin({ fullName: 'Admin', email: 'bad@example.test', password: 'short' }, provider)).rejects.toBeDefined()
  })
})
