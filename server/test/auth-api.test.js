import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createAuthService } from '../src/services/auth.service.js'

const patientPayload = {
  fullName: 'Ananya Rao',
  email: 'Ananya.Rao@Example.com ',
  password: 'Very secure password 2026',
}

const doctorPayload = {
  fullName: 'Dr. Vikram Sen',
  email: 'vikram.sen@example.com',
  password: 'Another secure password 2026',
  qualification: 'MBBS, MD',
  experienceYears: 8,
  specializationIds: [1, 2],
  bio: 'Provides careful, evidence-based consultations.',
  clinicName: 'MedReach Care Clinic',
  clinicCity: 'Kolkata',
  clinicDistrict: 'Kolkata',
  defaultFee: 700,
}

function databaseError(code) {
  const error = new Error('Simulated database constraint error')
  error.code = code
  return error
}

function createRepository() {
  let nextId = 1
  const users = []
  const patientProfiles = new Map()
  const doctorProfiles = new Map()
  const doctorSpecializations = new Map()
  const doctorVerifications = new Set()
  const validSpecializationIds = new Set([1, 2, 3])

  function insertUser(input, role) {
    if (users.some(user => user.email === input.email)) throw databaseError('23505')

    const user = {
      id: nextId++,
      full_name: input.fullName,
      email: input.email,
      password_hash: input.passwordHash,
      role,
      is_enabled: true,
    }
    users.push(user)
    return user
  }

  return {
    users,
    patientProfiles,
    doctorProfiles,
    doctorSpecializations,
    doctorVerifications,

    async createPatient(input) {
      const user = insertUser(input, 'patient')
      patientProfiles.set(user.id, {
        dateOfBirth: input.dateOfBirth ?? null,
        city: input.city ?? null,
      })
      return user
    },

    async createDoctor(input) {
      if (input.specializationIds.some(id => !validSpecializationIds.has(id))) return null

      const user = insertUser(input, 'doctor')
      doctorProfiles.set(user.id, {
        qualification: input.qualification,
        experienceYears: input.experienceYears,
      })
      doctorSpecializations.set(user.id, [...input.specializationIds])
      return user
    },

    async findByEmailForAuthentication(email) {
      return users.find(user => user.email === email) ?? null
    },

    async findSafeUserById(userId) {
      return users.find(user => user.id === userId) ?? null
    },

    disable(email) {
      const user = users.find(candidate => candidate.email === email)
      user.is_enabled = false
    },

    publicDoctorIds() {
      return users
        .filter(user => user.role === 'doctor' && user.is_enabled && doctorVerifications.has(user.id))
        .map(user => user.id)
    },
  }
}

function createTestContext() {
  const repository = createRepository()
  const auth = createAuthService(repository)
  const app = createApp({ auth })
  return { app, repository }
}

async function registerPatient(agent, overrides = {}) {
  return agent.post('/api/auth/register/patient').send({ ...patientPayload, ...overrides })
}

describe('authentication API', () => {
  let app
  let repository

  beforeEach(() => {
    ({ app, repository } = createTestContext())
  })

  it('registers a patient without starting a login session', async () => {
    const agent = request.agent(app)
    const response = await registerPatient(agent, {
      dateOfBirth: '1995-06-14',
      city: 'Kolkata',
    })

    expect(response.status).toBe(201)
    expect(response.body.user).toEqual({
      id: 1,
      fullName: 'Ananya Rao',
      email: 'ananya.rao@example.com',
      role: 'patient',
      isEnabled: true,
    })
    expect(repository.patientProfiles.get(1)).toEqual({
      dateOfBirth: '1995-06-14',
      city: 'Kolkata',
    })
    expect((await agent.get('/api/auth/me')).status).toBe(401)
  })

  it('registers a doctor with specializations but no public verification', async () => {
    const response = await request(app).post('/api/auth/register/doctor').send(doctorPayload)

    expect(response.status).toBe(201)
    expect(response.body.user.role).toBe('doctor')
    expect(repository.doctorProfiles.get(1)).toEqual({
      qualification: 'MBBS, MD',
      experienceYears: 8,
    })
    expect(repository.doctorSpecializations.get(1)).toEqual([1, 2])
    expect(repository.doctorVerifications.size).toBe(0)
    expect(repository.publicDoctorIds()).toEqual([])
  })

  it('rejects a duplicate normalized email', async () => {
    await request(app).post('/api/auth/register/patient').send(patientPayload)
    const response = await request(app).post('/api/auth/register/patient').send({
      ...patientPayload,
      email: '  ANANYA.RAO@example.com',
    })

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('EMAIL_IN_USE')
  })

  it('rejects invalid registration payloads before repository access', async () => {
    const response = await request(app).post('/api/auth/register/patient').send({
      fullName: 'A',
      email: 'not-an-email',
      password: 'short',
    })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(repository.users).toHaveLength(0)
  })

  it('rejects unknown doctor specialization IDs atomically', async () => {
    const response = await request(app).post('/api/auth/register/doctor').send({
      ...doctorPayload,
      specializationIds: [1, 999],
    })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_SPECIALIZATION')
    expect(repository.users).toHaveLength(0)
  })

  it('does not expose an admin registration endpoint', async () => {
    const response = await request(app).post('/api/auth/register/admin').send(patientPayload)

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND')
  })

  it('logs in with normalized credentials and returns only safe user fields', async () => {
    await registerPatient(request(app))
    const response = await request(app).post('/api/auth/login').send({
      email: '  ANANYA.RAO@EXAMPLE.COM ',
      password: patientPayload.password,
    })

    expect(response.status).toBe(200)
    expect(response.body.user.email).toBe('ananya.rao@example.com')
    expect(response.body.user).not.toHaveProperty('password_hash')
    expect(response.headers['set-cookie']?.[0]).toContain('medreach.sid=')
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly')
    expect(response.headers['set-cookie']?.[0]).toContain('SameSite=Lax')
  })

  it('uses the same generic failure for an incorrect password and unknown email', async () => {
    await registerPatient(request(app))
    const incorrectPassword = await request(app).post('/api/auth/login').send({
      email: 'ananya.rao@example.com',
      password: 'Incorrect password 2026',
    })
    const unknownEmail = await request(app).post('/api/auth/login').send({
      email: 'unknown@example.com',
      password: 'Incorrect password 2026',
    })

    expect(incorrectPassword.status).toBe(401)
    expect(unknownEmail.status).toBe(401)
    expect(incorrectPassword.body).toEqual(unknownEmail.body)
    expect(incorrectPassword.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('rejects disabled accounts after valid password verification', async () => {
    await registerPatient(request(app))
    repository.disable('ananya.rao@example.com')
    const response = await request(app).post('/api/auth/login').send({
      email: 'ananya.rao@example.com',
      password: patientPayload.password,
    })

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('ACCOUNT_DISABLED')
  })

  it('persists a login session across requests and reloads the current user', async () => {
    const agent = request.agent(app)
    await registerPatient(agent)
    await agent.post('/api/auth/login').send({
      email: 'ananya.rao@example.com',
      password: patientPayload.password,
    })

    const first = await agent.get('/api/auth/me')
    repository.users[0].full_name = 'Ananya R. Rao'
    const second = await agent.get('/api/auth/me')

    expect(first.status).toBe(200)
    expect(first.body.user.fullName).toBe('Ananya Rao')
    expect(second.body.user.fullName).toBe('Ananya R. Rao')
  })

  it('requires authentication for the current-user endpoint', async () => {
    const response = await request(app).get('/api/auth/me')

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED')
  })

  it('destroys the server session on logout', async () => {
    const agent = request.agent(app)
    await registerPatient(agent)
    await agent.post('/api/auth/login').send({
      email: 'ananya.rao@example.com',
      password: patientPayload.password,
    })

    const logout = await agent.post('/api/auth/logout')
    const afterLogout = await agent.get('/api/auth/me')

    expect(logout.status).toBe(200)
    expect(logout.headers['set-cookie']?.[0]).toContain('medreach.sid=;')
    expect(afterLogout.status).toBe(401)
  })

  it('requires a live enabled account on every authenticated request', async () => {
    const agent = request.agent(app)
    await registerPatient(agent)
    await agent.post('/api/auth/login').send({
      email: 'ananya.rao@example.com',
      password: patientPayload.password,
    })
    repository.disable('ananya.rao@example.com')

    const response = await agent.get('/api/auth/me')

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('ACCOUNT_DISABLED')
  })

  it('stores an Argon2id hash and never stores the plain password', async () => {
    await registerPatient(request(app))

    expect(repository.users[0].password_hash).toMatch(/^\$argon2id\$/)
    expect(repository.users[0].password_hash).not.toContain(patientPayload.password)
    expect(repository.users[0]).not.toHaveProperty('password')
  })

  it('fails safely when a seeded account has a placeholder password hash', async () => {
    repository.users.push({
      id: 99,
      full_name: 'Seeded Doctor',
      email: 'seeded@example.test',
      password_hash: 'intentionally-not-a-login-hash',
      role: 'doctor',
      is_enabled: true,
    })

    const response = await request(app).post('/api/auth/login').send({
      email: 'seeded@example.test',
      password: 'Any plausible password',
    })

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS')
  })
})
