import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { AvailabilityDataError } from '../src/data-access/availability.repository.js'
import { createAvailabilityService } from '../src/services/availability.service.js'

const now = new Date('2026-09-18T09:40:00.000Z')

function createContext() {
  const users = [
    { id: 1, fullName: 'Patient', email: 'patient@example.test', role: 'patient', isEnabled: true },
    { id: 10, fullName: 'Approved Doctor', email: 'approved@example.test', role: 'doctor', isEnabled: true },
    { id: 11, fullName: 'Pending Doctor', email: 'pending@example.test', role: 'doctor', isEnabled: true },
    { id: 12, fullName: 'Rejected Doctor', email: 'rejected@example.test', role: 'doctor', isEnabled: true },
    { id: 13, fullName: 'Disabled Doctor', email: 'disabled@example.test', role: 'doctor', isEnabled: true },
    { id: 20, fullName: 'Admin', email: 'admin@example.test', role: 'admin', isEnabled: true },
  ]
  const verification = new Map([[10, 'approved'], [11, 'pending'], [12, 'rejected'], [13, 'approved']])
  const databaseDisabledDoctorIds = new Set()
  const exceptions = []
  let nextId = 1
  let createError = null
  let nextRangeId = 1

  function assertEligible(doctorId) {
    const user = users.find(item => item.id === doctorId)
    if (!user?.isEnabled || databaseDisabledDoctorIds.has(doctorId)) {
      throw new AvailabilityDataError('ACCOUNT_DISABLED')
    }
    if (verification.get(doctorId) !== 'approved') {
      throw new AvailabilityDataError('DOCTOR_NOT_APPROVED')
    }
  }

  const repository = {
    async create() {
      throw new AvailabilityDataError('AVAILABILITY_EXCEPTION_CONFLICT')
    },
    async listExceptions({ doctorId }) {
      assertEligible(doctorId)
      return exceptions
        .filter(item => item.doctorId === doctorId && item.removedAt === null)
        .sort((left, right) => left.date.localeCompare(right.date)
          || (left.startTime ?? '').localeCompare(right.startTime ?? '')
          || left.id - right.id)
    },
    async createException(input) {
      assertEligible(input.doctorId)
      if (createError) throw new AvailabilityDataError(createError.code, createError.details)
      const exception = {
        id: nextId++,
        doctorId: input.doctorId,
        date: input.date,
        allDay: input.allDay,
        startTime: input.allDay ? null : input.startTime,
        endTime: input.allDay ? null : input.endTime,
        createdAt: now.toISOString(),
        removedAt: null,
        rangeId: null,
        rangeStartDate: null,
        rangeEndDate: null,
      }
      exceptions.push(exception)
      return exception
    },
    async createExceptionRange(input) {
      assertEligible(input.doctorId)
      if (createError) throw new AvailabilityDataError(createError.code, createError.details)
      const rangeId = `00000000-0000-4000-8000-${String(nextRangeId++).padStart(12, '0')}`
      for (let date = input.startDate; date <= input.endDate;) {
        exceptions.push({
          id: nextId++,
          doctorId: input.doctorId,
          date,
          allDay: true,
          startTime: null,
          endTime: null,
          createdAt: now.toISOString(),
          removedAt: null,
          rangeId,
          rangeStartDate: input.startDate,
          rangeEndDate: input.endDate,
        })
        const next = new Date(`${date}T00:00:00.000Z`)
        next.setUTCDate(next.getUTCDate() + 1)
        date = next.toISOString().slice(0, 10)
      }
      return { rangeId, startDate: input.startDate, endDate: input.endDate, allDay: true }
    },
    async removeException({ doctorId, exceptionId }) {
      assertEligible(doctorId)
      const exception = exceptions.find(item => item.id === exceptionId && item.doctorId === doctorId)
      if (!exception) throw new AvailabilityDataError('AVAILABILITY_EXCEPTION_NOT_FOUND')
      if (exception.rangeId !== null) throw new AvailabilityDataError('AVAILABILITY_EXCEPTION_RANGE_REQUIRED')
      if (exception.removedAt === null) exception.removedAt = now.toISOString()
      return { exception, removed: exception.removedAt === now.toISOString() }
    },
    async removeExceptionRange({ doctorId, rangeId }) {
      assertEligible(doctorId)
      const grouped = exceptions.filter(item => item.doctorId === doctorId && item.rangeId === rangeId)
      if (grouped.length === 0) throw new AvailabilityDataError('AVAILABILITY_EXCEPTION_NOT_FOUND')
      for (const exception of grouped) {
        if (exception.removedAt === null) exception.removedAt = now.toISOString()
      }
      return { removed: true }
    },
  }
  const auth = {
    async authenticate(email, password) {
      const user = users.find(item => item.email === email)
      if (!user || password !== 'test-password') throw new Error('Invalid test login')
      return user
    },
    async getSessionUser(userId) {
      return users.find(item => item.id === userId) ?? null
    },
  }

  return {
    app: createApp({ auth, availability: createAvailabilityService(repository, () => now) }),
    databaseDisabledDoctorIds,
    exceptions,
    setCreateError(code, details = null) {
      createError = { code, details }
    },
    users,
  }
}

async function login(app, email) {
  const agent = request.agent(app)
  const response = await agent.post('/api/auth/login').send({ email, password: 'test-password' })
  expect(response.status).toBe(200)
  return agent
}

describe('Doctor availability exception API', () => {
  let context

  beforeEach(() => {
    context = createContext()
  })

  it('requires authentication and the Doctor role on every endpoint', async () => {
    const anonymous = request(context.app)
    expect((await anonymous.get('/api/doctors/me/availability/exceptions')).status).toBe(401)
    expect((await anonymous.post('/api/doctors/me/availability/exceptions').send({
      date: '2026-09-29', allDay: true,
    })).status).toBe(401)
    expect((await anonymous.delete('/api/doctors/me/availability/exceptions/1')).status).toBe(401)
    expect((await anonymous.delete('/api/doctors/me/availability/exceptions/ranges/00000000-0000-4000-8000-000000000001')).status).toBe(401)

    for (const email of ['patient@example.test', 'admin@example.test']) {
      const agent = await login(context.app, email)
      const response = await agent.get('/api/doctors/me/availability/exceptions')
      expect(response.status).toBe(403)
      expect(response.body.error.code).toBe('ROLE_FORBIDDEN')
    }
  })

  it('creates normalized all-day and partial exceptions without DB fields', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const allDay = await doctor.post('/api/doctors/me/availability/exceptions').send({
      date: '2026-09-29', allDay: true,
    })
    const partial = await doctor.post('/api/doctors/me/availability/exceptions').send({
      date: '2026-09-30', allDay: false, startTime: '04:00', endTime: '05:00',
    })

    expect(allDay.status).toBe(201)
    expect(allDay.body.exception).toEqual({
      id: 1,
      date: '2026-09-29',
      allDay: true,
      startTime: null,
      endTime: null,
      createdAt: now.toISOString(),
    })
    expect(partial.status).toBe(201)
    expect(partial.body.exception).toMatchObject({
      id: 2,
      date: '2026-09-30',
      allDay: false,
      startTime: '04:00',
      endTime: '05:00',
    })
    expect(JSON.stringify(partial.body)).not.toContain('doctorId')
    expect(JSON.stringify(partial.body)).not.toContain('doctor_id')
  })

  it.each([
    [{ date: '2026-02-30', allDay: true }, 'date'],
    [{ date: '2026-09-29', allDay: true, startTime: '04:00' }, ''],
    [{ date: '2026-09-29', allDay: false, startTime: '04:00' }, 'endTime'],
    [{ date: '2026-09-29', allDay: false, startTime: '04:15', endTime: '05:00' }, 'startTime'],
    [{ date: '2026-09-29', allDay: false, startTime: '05:00', endTime: '05:00' }, 'endTime'],
    [{ date: '2026-09-29', allDay: true, doctorId: 999 }, ''],
  ])('strictly rejects malformed exception payload %#', async (payload, field) => {
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.post('/api/doctors/me/availability/exceptions').send(payload)

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    if (field) expect(response.body.error.details).toContainEqual(expect.objectContaining({ field }))
    expect(context.exceptions).toHaveLength(0)
  })

  it.each([
    [{ startDate: '2026-10-12', endDate: '2026-10-12', allDay: true }, 'endDate'],
    [{ startDate: '2026-10-13', endDate: '2026-10-12', allDay: true }, 'endDate'],
    [{ startDate: '2026-10-01', endDate: '2026-11-01', allDay: true }, 'endDate'],
    [{ startDate: '2026-10-12', endDate: '2026-10-16', allDay: false }, 'allDay'],
    [{ startDate: '2026-10-12', endDate: '2026-10-16', allDay: true, startTime: '09:00' }, 'startTime'],
    [{ startDate: '2026-10-12', endDate: '2026-10-16', allDay: true, extra: true }, ''],
  ])('strictly rejects malformed range payload %#', async (payload, field) => {
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.post('/api/doctors/me/availability/exceptions').send(payload)

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    if (field) expect(response.body.error.details).toContainEqual(expect.objectContaining({ field }))
    expect(context.exceptions).toHaveLength(0)
  })

  it('creates, lists and atomically removes a logical all-day range', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const created = await doctor.post('/api/doctors/me/availability/exceptions').send({
      startDate: '2026-10-12', endDate: '2026-10-16', allDay: true,
    })

    expect(created.status).toBe(201)
    expect(created.body.range).toEqual({
      rangeId: expect.any(String),
      startDate: '2026-10-12',
      endDate: '2026-10-16',
      allDay: true,
    })
    const rangeId = created.body.range.rangeId
    const listed = await doctor.get('/api/doctors/me/availability/exceptions')
    expect(listed.body.exceptions).toHaveLength(5)
    expect(listed.body.exceptions.every(item => item.rangeId === rangeId)).toBe(true)
    expect(listed.body.exceptions.every(item => item.rangeStartDate === '2026-10-12')).toBe(true)
    expect(listed.body.exceptions.every(item => item.rangeEndDate === '2026-10-16')).toBe(true)

    expect((await doctor.delete(`/api/doctors/me/availability/exceptions/ranges/${rangeId}`)).status).toBe(204)
    expect((await doctor.delete(`/api/doctors/me/availability/exceptions/ranges/${rangeId}`)).status).toBe(204)
    expect((await doctor.get('/api/doctors/me/availability/exceptions')).body).toEqual({ exceptions: [] })
  })

  it('exposes only conflictCount for a range booked conflict', async () => {
    context.setCreateError('AVAILABILITY_EXCEPTION_BOOKED_CONFLICT', {
      conflictCount: 2,
      conflicts: [{ patientId: 99, appointmentId: 50, startAt: now.toISOString() }],
    })
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.post('/api/doctors/me/availability/exceptions').send({
      startDate: '2026-10-12', endDate: '2026-10-16', allDay: true,
    })

    expect(response.status).toBe(409)
    expect(response.body.error).toEqual({
      code: 'AVAILABILITY_EXCEPTION_BOOKED_CONFLICT',
      message: 'Availability exception overlaps a booked appointment',
      details: { conflictCount: 2 },
    })
    expect(JSON.stringify(response.body).toLowerCase()).not.toContain('patient')
    expect(JSON.stringify(response.body)).not.toContain('appointmentId')
    expect(JSON.stringify(response.body)).not.toContain('startAt')
  })

  it.each([
    ['AVAILABILITY_EXCEPTION_IN_PAST', 409],
    ['AVAILABILITY_EXCEPTION_OVERLAP', 409],
    ['AVAILABILITY_EXCEPTION_BOOKED_CONFLICT', 409],
  ])('maps %s without leaking internal conflict details', async (code, status) => {
    context.setCreateError(code)
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.post('/api/doctors/me/availability/exceptions').send({
      date: '2026-09-29', allDay: true,
    })

    expect(response.status).toBe(status)
    expect(response.body.error.code).toBe(code)
    expect(JSON.stringify(response.body).toLowerCase()).not.toContain('patient')
    expect(context.exceptions).toHaveLength(0)
  })

  it('maps a one-off overlap to the stable Doctor-side exception conflict', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.post('/api/doctors/me/availability').send({
      date: '2026-09-29',
      startTime: '04:30',
      endTime: '06:00',
    })

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('AVAILABILITY_EXCEPTION_CONFLICT')
  })

  it('lists only active owned exceptions and safely repeats owned deletion', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const other = { id: 90, doctorId: 99, date: '2026-09-28', allDay: true, startTime: null, endTime: null, createdAt: now.toISOString(), removedAt: null }
    context.exceptions.push(other)
    const created = await doctor.post('/api/doctors/me/availability/exceptions').send({
      date: '2026-09-29', allDay: true,
    })
    const id = created.body.exception.id

    expect((await doctor.get('/api/doctors/me/availability/exceptions')).body).toEqual({
      exceptions: [{
        ...created.body.exception,
        rangeId: null,
        rangeStartDate: null,
        rangeEndDate: null,
      }],
    })
    expect((await doctor.delete(`/api/doctors/me/availability/exceptions/${id}`)).status).toBe(204)
    expect((await doctor.delete(`/api/doctors/me/availability/exceptions/${id}`)).status).toBe(204)
    expect((await doctor.get('/api/doctors/me/availability/exceptions')).body).toEqual({ exceptions: [] })
  })

  it('returns safe not-found for unknown or non-owned exception IDs', async () => {
    context.exceptions.push({
      id: 90,
      doctorId: 99,
      date: '2026-09-29',
      allDay: true,
      startTime: null,
      endTime: null,
      createdAt: now.toISOString(),
      removedAt: null,
    })
    const doctor = await login(context.app, 'approved@example.test')

    for (const id of [90, 999]) {
      const response = await doctor.delete(`/api/doctors/me/availability/exceptions/${id}`)
      expect(response.status).toBe(404)
      expect(response.body.error.code).toBe('AVAILABILITY_EXCEPTION_NOT_FOUND')
    }
  })

  it.each(['pending@example.test', 'rejected@example.test'])(
    'preserves approval checks for %s',
    async email => {
      const doctor = await login(context.app, email)
      const response = await doctor.get('/api/doctors/me/availability/exceptions')
      expect(response.status).toBe(403)
      expect(response.body.error.code).toBe('DOCTOR_NOT_APPROVED')
    },
  )

  it('preserves the live disabled-account check and transactional recheck', async () => {
    const disabled = await login(context.app, 'disabled@example.test')
    context.users.find(user => user.id === 13).isEnabled = false
    const middlewareResponse = await disabled.get('/api/doctors/me/availability/exceptions')
    expect(middlewareResponse.status).toBe(403)
    expect(middlewareResponse.body.error.code).toBe('ACCOUNT_DISABLED')

    const approved = await login(context.app, 'approved@example.test')
    context.databaseDisabledDoctorIds.add(10)
    const repositoryResponse = await approved.post('/api/doctors/me/availability/exceptions').send({
      date: '2026-09-29', allDay: true,
    })
    expect(repositoryResponse.status).toBe(403)
    expect(repositoryResponse.body.error.code).toBe('ACCOUNT_DISABLED')
  })
})
