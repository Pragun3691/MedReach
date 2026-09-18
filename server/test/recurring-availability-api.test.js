import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { AvailabilityDataError } from '../src/data-access/availability.repository.js'
import { createAvailabilityService } from '../src/services/availability.service.js'

const now = new Date('2026-09-17T00:00:00.000Z')
const validInput = {
  weekdays: [5, 1, 5, 3],
  startTime: '09:00',
  endTime: '12:00',
  startsOn: '2026-09-21',
  endsOn: '2026-10-31',
}

function createTestContext() {
  const users = [
    { id: 1, email: 'patient@example.test', role: 'patient', isEnabled: true },
    { id: 10, email: 'approved@example.test', role: 'doctor', isEnabled: true },
    { id: 11, email: 'pending@example.test', role: 'doctor', isEnabled: true },
    { id: 12, email: 'rejected@example.test', role: 'doctor', isEnabled: true },
    { id: 13, email: 'other@example.test', role: 'doctor', isEnabled: true },
    { id: 14, email: 'disabled@example.test', role: 'doctor', isEnabled: true },
  ]
  const statuses = new Map([[10, 'approved'], [11, 'pending'], [12, 'rejected'], [13, 'approved'], [14, 'approved']])
  const rules = []
  let nextRuleId = 1
  let failure = null

  function ensureEligible(doctorId) {
    const user = users.find(item => item.id === doctorId)
    if (!user?.isEnabled) throw new AvailabilityDataError('ACCOUNT_DISABLED')
    if (statuses.get(doctorId) !== 'approved') throw new AvailabilityDataError('DOCTOR_NOT_APPROVED')
  }

  function ruleRow(rule) {
    return {
      rule_id: rule.id,
      weekdays: rule.weekdays,
      start_time: rule.startTime,
      end_time: rule.endTime,
      starts_on: rule.startsOn,
      ends_on: rule.endsOn,
      effective_fee: rule.fee,
      status: rule.status,
      materialized_through: rule.materializedThrough,
      materialized_occurrence_count: rule.materializedOccurrenceCount,
      created_at: rule.createdAt,
      updated_at: rule.createdAt,
    }
  }

  function rulesOverlap(left, right) {
    const sharedWeekday = left.weekdays.some(weekday => right.weekdays.includes(weekday))
    const leftEnd = left.endsOn ?? '9999-12-31'
    const rightEnd = right.endsOn ?? '9999-12-31'
    const datesOverlap = left.startsOn <= rightEnd && right.startsOn <= leftEnd
    const timesOverlap = left.startTime < right.endTime && left.endTime > right.startTime
    return sharedWeekday && datesOverlap && timesOverlap
  }

  const repository = {
    async createRecurring(input) {
      ensureEligible(input.doctorId)
      if (failure) throw failure
      if (rules.some(rule => rule.doctorId === input.doctorId
        && rule.status === 'active'
        && rulesOverlap(rule, input))) {
        throw new AvailabilityDataError('AVAILABILITY_OVERLAP')
      }

      const rule = {
        id: nextRuleId++,
        doctorId: input.doctorId,
        weekdays: [...new Set(input.weekdays)].sort((left, right) => left - right),
        startTime: input.startTime,
        endTime: input.endTime,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        fee: input.fee,
        status: 'active',
        materializedThrough: input.endsOn ?? '2026-12-16',
        materializedOccurrenceCount: 18,
        createdAt: new Date(now.getTime() + nextRuleId).toISOString(),
      }
      rules.push(rule)
      return {
        rule,
        materialized: Array.from({ length: rule.materializedOccurrenceCount }, () => ({})),
      }
    },

    async listRecurringForDoctor(doctorId) {
      ensureEligible(doctorId)
      return rules
        .filter(rule => rule.doctorId === doctorId)
        .sort((left, right) => {
          if (left.status !== right.status) return left.status === 'active' ? -1 : 1
          return right.createdAt.localeCompare(left.createdAt)
        })
        .map(ruleRow)
    },

    async stopRecurring({ doctorId, ruleId }) {
      ensureEligible(doctorId)
      if (failure) throw failure
      const rule = rules.find(item => item.id === ruleId && item.doctorId === doctorId)
      if (!rule) throw new AvailabilityDataError('RECURRING_AVAILABILITY_RULE_NOT_FOUND')
      rule.status = 'stopped'
      rule.materializedOccurrenceCount = 0
    },

    async listForDoctor(doctorId) {
      ensureEligible(doctorId)
      return []
    },

    async create({ doctorId, startAt, endAt, fee }) {
      ensureEligible(doctorId)
      return {
        block: {
          id: 50,
          doctor_id: doctorId,
          start_at: startAt,
          end_at: endAt,
          effective_fee: fee,
          created_at: now,
          updated_at: now,
        },
        slots: [{ id: 60, start_at: startAt, end_at: endAt }],
      }
    },

    async remove({ doctorId }) {
      ensureEligible(doctorId)
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
    failWith(error) {
      failure = error
    },
    rules,
    users,
  }
}

async function login(app, email) {
  const agent = request.agent(app)
  const response = await agent.post('/api/auth/login').send({ email, password: 'test-password' })
  expect(response.status).toBe(200)
  return agent
}

describe('recurring availability create API', () => {
  let context

  beforeEach(() => {
    context = createTestContext()
  })

  it('requires authentication and the Doctor role', async () => {
    const anonymous = await request(context.app).post('/api/doctors/me/availability/rules').send(validInput)
    const patient = await login(context.app, 'patient@example.test')
    const forbidden = await patient.post('/api/doctors/me/availability/rules').send(validInput)

    expect(anonymous.status).toBe(401)
    expect(forbidden.status).toBe(403)
    expect(forbidden.body.error.code).toBe('ROLE_FORBIDDEN')
  })

  it.each(['pending@example.test', 'rejected@example.test'])('rejects a non-approved Doctor (%s)', async email => {
    const doctor = await login(context.app, email)
    const response = await doctor.post('/api/doctors/me/availability/rules').send(validInput)

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('DOCTOR_NOT_APPROVED')
  })

  it('rejects a disabled Doctor', async () => {
    const doctor = await login(context.app, 'disabled@example.test')
    context.users.find(user => user.id === 14).isEnabled = false
    const response = await doctor.post('/api/doctors/me/availability/rules').send(validInput)

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('ACCOUNT_DISABLED')
  })

  it('creates through the repository, canonicalizes weekdays, and returns materialization metadata', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.post('/api/doctors/me/availability/rules').send({ ...validInput, fee: 725.5 })

    expect(response.status).toBe(201)
    expect(response.body).toEqual({
      rule: {
        id: 1,
        weekdays: [1, 3, 5],
        startTime: '09:00',
        endTime: '12:00',
        startsOn: '2026-09-21',
        endsOn: '2026-10-31',
        effectiveFee: 725.5,
        status: 'active',
        materializedThrough: '2026-10-31',
        materializedOccurrenceCount: 18,
      },
    })
    expect(context.rules[0].doctorId).toBe(10)
  })

  it('rejects a body-level doctorId and keeps ownership bound to the authenticated Doctor', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.post('/api/doctors/me/availability/rules').send({
      ...validInput,
      doctorId: 13,
    })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(context.rules).toHaveLength(0)
  })

  it('preserves an omitted fee as null and accepts an omitted end date', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const { endsOn: _endsOn, ...input } = validInput
    const response = await doctor.post('/api/doctors/me/availability/rules').send(input)

    expect(response.status).toBe(201)
    expect(response.body.rule).toMatchObject({ endsOn: null, effectiveFee: null })
    expect(context.rules[0]).toMatchObject({ endsOn: null, fee: null })
  })

  it.each([
    [{ ...validInput, weekdays: [] }, 'weekdays'],
    [{ ...validInput, weekdays: [0, 1] }, 'weekdays.0'],
    [{ ...validInput, weekdays: [1, 8] }, 'weekdays.1'],
    [{ ...validInput, startTime: '9:00' }, 'startTime'],
    [{ ...validInput, startTime: '09:15' }, 'startTime'],
    [{ ...validInput, endTime: '09:00' }, 'endTime'],
    [{ ...validInput, startsOn: '2026-02-30' }, 'startsOn'],
    [{ ...validInput, endsOn: '2026-09-20' }, 'endsOn'],
    [{ ...validInput, fee: -1 }, 'fee'],
  ])('rejects invalid recurring input at %s', async (input, field) => {
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.post('/api/doctors/me/availability/rules').send(input)

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(response.body.error.details).toContainEqual(expect.objectContaining({ field }))
  })

  it('returns a stable overlap conflict', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    await doctor.post('/api/doctors/me/availability/rules').send(validInput)
    const response = await doctor.post('/api/doctors/me/availability/rules').send(validInput)

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('AVAILABILITY_OVERLAP')
  })

  it('maps an overlap with one-off availability to the same stable conflict', async () => {
    context.failWith(new AvailabilityDataError('AVAILABILITY_OVERLAP'))
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.post('/api/doctors/me/availability/rules').send(validInput)

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('AVAILABILITY_OVERLAP')
  })

  it('allows touching half-open recurring time ranges', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const first = await doctor.post('/api/doctors/me/availability/rules').send({
      ...validInput,
      endTime: '10:00',
    })
    const second = await doctor.post('/api/doctors/me/availability/rules').send({
      ...validInput,
      startTime: '10:00',
      endTime: '11:00',
    })

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
  })

  it('returns the repository past-only rule error as a safe client error', async () => {
    context.failWith(new AvailabilityDataError('RECURRING_AVAILABILITY_IN_PAST'))
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.post('/api/doctors/me/availability/rules').send(validInput)

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('RECURRING_AVAILABILITY_IN_PAST')
  })

  it('does not expose an unexpected repository failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    context.failWith(new Error('database secret'))
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.post('/api/doctors/me/availability/rules').send(validInput)

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Something went wrong' } })
    expect(JSON.stringify(response.body)).not.toContain('database secret')
    expect(context.rules).toHaveLength(0)
  })
})

describe('recurring availability list API', () => {
  let context

  beforeEach(() => {
    context = createTestContext()
  })

  it('requires authentication and returns an empty list', async () => {
    const anonymous = await request(context.app).get('/api/doctors/me/availability/rules')
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.get('/api/doctors/me/availability/rules')

    expect(anonymous.status).toBe(401)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ items: [] })
  })

  it('rejects list access for a non-Doctor and a disabled Doctor', async () => {
    const patient = await login(context.app, 'patient@example.test')
    const forbidden = await patient.get('/api/doctors/me/availability/rules')
    const doctor = await login(context.app, 'disabled@example.test')
    context.users.find(user => user.id === 14).isEnabled = false
    const disabled = await doctor.get('/api/doctors/me/availability/rules')

    expect(forbidden.status).toBe(403)
    expect(forbidden.body.error.code).toBe('ROLE_FORBIDDEN')
    expect(disabled.status).toBe(403)
    expect(disabled.body.error.code).toBe('ACCOUNT_DISABLED')
  })

  it('returns only owned active and stopped rules, active first then newest', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const other = await login(context.app, 'other@example.test')
    await doctor.post('/api/doctors/me/availability/rules').send({ ...validInput, endTime: '10:00' })
    context.rules[0].status = 'stopped'
    await doctor.post('/api/doctors/me/availability/rules').send({ ...validInput, startTime: '13:00', endTime: '14:00' })
    await other.post('/api/doctors/me/availability/rules').send(validInput)

    const response = await doctor.get('/api/doctors/me/availability/rules')

    expect(response.status).toBe(200)
    expect(response.body.items.map(rule => rule.id)).toEqual([2, 1])
    expect(response.body.items.map(rule => rule.status)).toEqual(['active', 'stopped'])
    expect(response.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ effectiveFee: null, materializedOccurrenceCount: 18 }),
    ]))
    expect(response.body.items.map(rule => rule.id)).not.toContain(3)
  })

  it('preserves a stopped indefinite rule with null fee and no materialized occurrences', async () => {
    context.rules.push({
      id: 20,
      doctorId: 10,
      weekdays: [2, 4],
      startTime: '09:00',
      endTime: '10:00',
      startsOn: '2026-09-22',
      endsOn: null,
      fee: null,
      status: 'stopped',
      materializedThrough: '2026-12-16',
      materializedOccurrenceCount: 0,
      createdAt: '2026-09-17T00:00:00.000Z',
    })
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.get('/api/doctors/me/availability/rules')

    expect(response.status).toBe(200)
    expect(response.body.items).toEqual([
      expect.objectContaining({
        id: 20,
        status: 'stopped',
        endsOn: null,
        effectiveFee: null,
        materializedOccurrenceCount: 0,
      }),
    ])
  })

  it('serializes PostgreSQL date objects as stable calendar-date strings', async () => {
    context.rules.push({
      id: 21,
      doctorId: 10,
      weekdays: [1, 5],
      startTime: '09:00',
      endTime: '12:00',
      startsOn: new Date('2026-09-27T18:30:00.000Z'),
      endsOn: new Date('2026-10-30T18:30:00.000Z'),
      fee: 650,
      status: 'active',
      materializedThrough: new Date('2026-10-30T18:30:00.000Z'),
      materializedOccurrenceCount: 10,
      createdAt: '2026-09-18T00:00:00.000Z',
    })
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.get('/api/doctors/me/availability/rules')

    expect(response.status).toBe(200)
    expect(response.body.items[0]).toMatchObject({
      startsOn: '2026-09-28',
      endsOn: '2026-10-31',
      materializedThrough: '2026-10-31',
    })
  })

  it.each(['pending@example.test', 'rejected@example.test'])('rejects list access for a non-approved Doctor (%s)', async email => {
    const doctor = await login(context.app, email)
    const response = await doctor.get('/api/doctors/me/availability/rules')

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('DOCTOR_NOT_APPROVED')
  })

  it('keeps existing one-off create, list, and delete routes reachable', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const created = await doctor.post('/api/doctors/me/availability').send({
      date: '2026-09-21',
      startTime: '09:00',
      endTime: '09:30',
    })
    const listed = await doctor.get('/api/doctors/me/availability')
    const removed = await doctor.delete('/api/doctors/me/availability/50')

    expect(created.status).toBe(201)
    expect(listed.status).toBe(200)
    expect(removed.status).toBe(204)
  })
})

describe('recurring availability stop API', () => {
  let context

  beforeEach(() => {
    context = createTestContext()
  })

  async function createRule(agent, input = validInput) {
    const response = await agent.post('/api/doctors/me/availability/rules').send(input)
    expect(response.status).toBe(201)
    return response.body.rule
  }

  it('lets the owner stop an active rule and keeps it listed as stopped', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const rule = await createRule(doctor)

    const stopped = await doctor.delete(`/api/doctors/me/availability/rules/${rule.id}`)
    const listed = await doctor.get('/api/doctors/me/availability/rules')

    expect(stopped.status).toBe(204)
    expect(stopped.text).toBe('')
    expect(listed.body.items).toEqual([
      expect.objectContaining({ id: rule.id, status: 'stopped' }),
    ])
  })

  it('is idempotent for an already-stopped owned rule', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const rule = await createRule(doctor)

    expect((await doctor.delete(`/api/doctors/me/availability/rules/${rule.id}`)).status).toBe(204)
    expect((await doctor.delete(`/api/doctors/me/availability/rules/${rule.id}`)).status).toBe(204)
  })

  it('returns the same safe not-found error for unknown and another Doctor rule', async () => {
    const owner = await login(context.app, 'approved@example.test')
    const other = await login(context.app, 'other@example.test')
    const rule = await createRule(owner)

    for (const ruleId of [rule.id, 99999]) {
      const response = await other.delete(`/api/doctors/me/availability/rules/${ruleId}`)
      expect(response.status).toBe(404)
      expect(response.body.error.code).toBe('RECURRING_AVAILABILITY_RULE_NOT_FOUND')
    }
    expect(context.rules[0].status).toBe('active')
  })

  it.each(['pending@example.test', 'rejected@example.test'])(
    'rejects a non-approved Doctor (%s)',
    async email => {
      const doctor = await login(context.app, email)
      const response = await doctor.delete('/api/doctors/me/availability/rules/1')

      expect(response.status).toBe(403)
      expect(response.body.error.code).toBe('DOCTOR_NOT_APPROVED')
    },
  )

  it('rejects a disabled Doctor and a non-Doctor', async () => {
    const disabled = await login(context.app, 'disabled@example.test')
    context.users.find(user => user.id === 14).isEnabled = false
    const disabledResponse = await disabled.delete('/api/doctors/me/availability/rules/1')
    const patient = await login(context.app, 'patient@example.test')
    const patientResponse = await patient.delete('/api/doctors/me/availability/rules/1')

    expect(disabledResponse.status).toBe(403)
    expect(disabledResponse.body.error.code).toBe('ACCOUNT_DISABLED')
    expect(patientResponse.status).toBe(403)
    expect(patientResponse.body.error.code).toBe('ROLE_FORBIDDEN')
  })

  it('requires authentication and validates the rule id', async () => {
    const anonymous = await request(context.app).delete('/api/doctors/me/availability/rules/1')
    const doctor = await login(context.app, 'approved@example.test')
    const invalid = await doctor.delete('/api/doctors/me/availability/rules/not-a-rule')

    expect(anonymous.status).toBe(401)
    expect(invalid.status).toBe(400)
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('does not expose an unexpected repository failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const doctor = await login(context.app, 'approved@example.test')
    const rule = await createRule(doctor)
    context.failWith(new Error('stop database secret'))

    const response = await doctor.delete(`/api/doctors/me/availability/rules/${rule.id}`)

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Something went wrong' } })
    expect(JSON.stringify(response.body)).not.toContain('stop database secret')
    expect(context.rules[0].status).toBe('active')
  })
})
