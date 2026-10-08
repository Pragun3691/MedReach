import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { AvailabilityDataError } from '../src/data-access/availability.repository.js'
import { createAvailabilityService } from '../src/services/availability.service.js'

const now = new Date('2026-09-15T00:00:00.000Z')
const validInput = {
  date: '2026-09-20',
  startTime: '09:00',
  endTime: '11:00',
}

function createTestContext() {
  const users = [
    { id: 1, fullName: 'Ananya Rao', email: 'patient@example.test', role: 'patient', isEnabled: true },
    { id: 10, fullName: 'Dr. Approved', email: 'approved@example.test', role: 'doctor', isEnabled: true },
    { id: 11, fullName: 'Dr. Pending', email: 'pending@example.test', role: 'doctor', isEnabled: true },
    { id: 12, fullName: 'Dr. Rejected', email: 'rejected@example.test', role: 'doctor', isEnabled: true },
    { id: 13, fullName: 'Dr. Other', email: 'other@example.test', role: 'doctor', isEnabled: true },
    { id: 14, fullName: 'Dr. Disabled', email: 'disabled@example.test', role: 'doctor', isEnabled: true },
  ]
  const statuses = new Map([[10, 'approved'], [11, 'pending'], [12, 'rejected'], [13, 'approved'], [14, 'approved']])
  const defaultFees = new Map([[10, 650], [11, 500], [12, 550], [13, null], [14, 600]])
  const databaseDisabledDoctorIds = new Set()
  const blocks = []
  const slots = []
  const appointments = []
  let nextBlockId = 1
  let nextSlotId = 100

  function addBlock({ doctorId, startAt, endAt, effectiveFee = null, recurringRuleId = null, slotStarts = [] }) {
    const block = {
      id: nextBlockId++,
      doctorId,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      effectiveFee,
      recurringRuleId,
    }
    blocks.push(block)

    const createdSlots = slotStarts.map(slotInput => {
      const input = typeof slotInput === 'string' ? { startAt: slotInput } : slotInput
      const slotStart = new Date(input.startAt)
      const slot = {
        id: nextSlotId++,
        blockId: block.id,
        startAt: slotStart,
        endAt: new Date(slotStart.getTime() + 30 * 60 * 1000),
        isActive: input.isActive ?? true,
        isExceptionBlocked: input.isExceptionBlocked ?? false,
      }
      slots.push(slot)
      return slot
    })

    return { block, slots: createdSlots }
  }

  const repository = {
    async listForDoctor(doctorId, currentTime) {
      const user = users.find(item => item.id === doctorId)
      if (!user?.isEnabled || databaseDisabledDoctorIds.has(doctorId)) {
        throw new AvailabilityDataError('ACCOUNT_DISABLED')
      }
      if (statuses.get(doctorId) !== 'approved') {
        throw new AvailabilityDataError('DOCTOR_NOT_APPROVED')
      }

      return blocks
        .filter(block => block.doctorId === doctorId && block.endAt > currentTime)
        .sort((left, right) => left.startAt - right.startAt || left.id - right.id)
        .flatMap(block => {
          const blockSlots = slots
            .filter(slot => slot.blockId === block.id)
            .sort((left, right) => left.startAt - right.startAt || left.id - right.id)
          const rows = blockSlots.length > 0 ? blockSlots : [null]

          return rows.map(slot => ({
            block_id: block.id,
            block_start_at: block.startAt,
            block_end_at: block.endAt,
            recurring_rule_id: block.recurringRuleId,
            effective_fee: block.effectiveFee ?? defaultFees.get(doctorId) ?? null,
            slot_id: slot?.id ?? null,
            slot_start_at: slot?.startAt ?? null,
            slot_end_at: slot?.endAt ?? null,
            slot_is_active: slot?.isActive ?? null,
            slot_is_exception_blocked: slot?.isExceptionBlocked ?? false,
            slot_is_booked: slot
              ? appointments.some(item => item.slotId === slot.id && item.status === 'booked')
              : false,
            slot_has_appointment_history: slot
              ? appointments.some(item => item.slotId === slot.id)
              : false,
          }))
        })
    },

    async create({ doctorId, startAt, endAt, fee }) {
      const user = users.find(item => item.id === doctorId)
      if (!user?.isEnabled || databaseDisabledDoctorIds.has(doctorId)) {
        throw new AvailabilityDataError('ACCOUNT_DISABLED')
      }
      if (statuses.get(doctorId) !== 'approved') {
        throw new AvailabilityDataError('DOCTOR_NOT_APPROVED')
      }
      if (blocks.some(block => block.doctorId === doctorId
        && block.startAt < endAt
        && block.endAt > startAt)) {
        throw new AvailabilityDataError('AVAILABILITY_OVERLAP')
      }

      const block = {
        id: nextBlockId++,
        doctorId,
        startAt,
        endAt,
        effectiveFee: fee,
      }
      blocks.push(block)

      const createdSlots = []
      for (let slotStart = startAt.getTime(); slotStart < endAt.getTime(); slotStart += 30 * 60 * 1000) {
        const slot = {
          id: nextSlotId++,
          blockId: block.id,
          startAt: new Date(slotStart),
          endAt: new Date(slotStart + 30 * 60 * 1000),
          isActive: true,
        }
        slots.push(slot)
        createdSlots.push(slot)
      }

      const timestamp = now.toISOString()
      return {
        block: {
          id: block.id,
          doctor_id: doctorId,
          start_at: startAt,
          end_at: endAt,
          effective_fee: fee,
          created_at: timestamp,
          updated_at: timestamp,
        },
        slots: createdSlots.map(slot => ({
          id: slot.id,
          start_at: slot.startAt,
          end_at: slot.endAt,
        })),
      }
    },

    async remove({ doctorId, blockId, now: currentTime }) {
      const user = users.find(item => item.id === doctorId)
      if (!user?.isEnabled || databaseDisabledDoctorIds.has(doctorId)) {
        throw new AvailabilityDataError('ACCOUNT_DISABLED')
      }
      if (statuses.get(doctorId) !== 'approved') {
        throw new AvailabilityDataError('DOCTOR_NOT_APPROVED')
      }

      const blockIndex = blocks.findIndex(block => block.id === blockId && block.doctorId === doctorId)
      if (blockIndex < 0) throw new AvailabilityDataError('AVAILABILITY_BLOCK_NOT_FOUND')

      const block = blocks[blockIndex]
      if (block.startAt <= currentTime) {
        throw new AvailabilityDataError('AVAILABILITY_BLOCK_NOT_DELETABLE')
      }

      const blockSlotIds = new Set(slots.filter(slot => slot.blockId === blockId).map(slot => slot.id))
      if (appointments.some(appointment => blockSlotIds.has(appointment.slotId))) {
        throw new AvailabilityDataError('AVAILABILITY_BLOCK_PROTECTED')
      }

      for (let index = slots.length - 1; index >= 0; index -= 1) {
        if (slots[index].blockId === blockId) slots.splice(index, 1)
      }
      blocks.splice(blockIndex, 1)
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

  const availability = createAvailabilityService(repository, () => now)
  return {
    app: createApp({ auth, availability }),
    addBlock,
    appointments,
    blocks,
    databaseDisabledDoctorIds,
    slots,
    users,
  }
}

async function login(app, email) {
  const agent = request.agent(app)
  const response = await agent.post('/api/auth/login').send({ email, password: 'test-password' })
  expect(response.status).toBe(200)
  return agent
}

describe('doctor availability creation API', () => {
  let context

  beforeEach(() => {
    context = createTestContext()
  })

  it('requires authentication', async () => {
    const response = await request(context.app).post('/api/doctors/me/availability').send(validInput)

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED')
  })

  it('allows an approved Doctor to create availability', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.post('/api/doctors/me/availability').send(validInput)

    expect(response.status).toBe(201)
    expect(response.body.availability).toMatchObject({
      doctorId: 10,
      date: validInput.date,
      startAt: '2026-09-20T03:30:00.000Z',
      endAt: '2026-09-20T05:30:00.000Z',
      fee: null,
    })
  })

  it('generates the correct number of 30-minute slots', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.post('/api/doctors/me/availability').send(validInput)

    expect(response.body.availability.slots).toHaveLength(4)
    expect(context.slots).toHaveLength(4)
    expect(context.slots.every(slot => slot.endAt - slot.startAt === 30 * 60 * 1000)).toBe(true)
  })

  it('accepts an omitted fee and stores a null block fee', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.post('/api/doctors/me/availability').send(validInput)

    expect(response.status).toBe(201)
    expect(context.blocks[0].effectiveFee).toBeNull()
    expect(response.body.availability.fee).toBeNull()
  })

  it('stores and returns an explicit fee', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.post('/api/doctors/me/availability').send({ ...validInput, fee: 725.5 })

    expect(response.status).toBe(201)
    expect(context.blocks[0].effectiveFee).toBe(725.5)
    expect(response.body.availability.fee).toBe(725.5)
  })

  it('rejects availability whose start is in the past', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.post('/api/doctors/me/availability').send({
      ...validInput,
      date: '2026-09-14',
    })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('AVAILABILITY_IN_PAST')
    expect(context.blocks).toHaveLength(0)
  })

  it('rejects an impossible calendar date without rolling it over', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.post('/api/doctors/me/availability').send({
      ...validInput,
      date: '2026-02-30',
    })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(response.body.error.details).toContainEqual(expect.objectContaining({ field: 'date' }))
    expect(context.blocks).toHaveLength(0)
  })

  it.each(['05:00', '05:30'])('rejects a same-date IST start at or before the fixed current time', async startTime => {
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.post('/api/doctors/me/availability').send({
      date: '2026-09-15',
      startTime,
      endTime: '06:30',
    })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('AVAILABILITY_IN_PAST')
    expect(context.blocks).toHaveLength(0)
  })

  it('accepts a later aligned time on the same Asia/Kolkata date', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.post('/api/doctors/me/availability').send({
      date: '2026-09-15',
      startTime: '06:00',
      endTime: '07:00',
    })

    expect(response.status).toBe(201)
    expect(response.body.availability).toMatchObject({
      startAt: '2026-09-15T00:30:00.000Z',
      endAt: '2026-09-15T01:30:00.000Z',
    })
  })

  it.each([
    [{ ...validInput, startTime: '09:15' }, 'startTime'],
    [{ ...validInput, endTime: '11:15' }, 'endTime'],
  ])('rejects a time that is not on a 30-minute boundary', async (input, field) => {
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.post('/api/doctors/me/availability').send(input)

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(response.body.error.details).toContainEqual(expect.objectContaining({ field }))
  })

  it.each(['09:00', '08:30'])('rejects an end time that is not after the start time', async endTime => {
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.post('/api/doctors/me/availability').send({
      ...validInput,
      startTime: '09:00',
      endTime,
    })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects overlapping availability for the same Doctor', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    await doctor.post('/api/doctors/me/availability').send(validInput)
    const response = await doctor.post('/api/doctors/me/availability').send({
      ...validInput,
      startTime: '10:30',
      endTime: '12:00',
    })

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('AVAILABILITY_OVERLAP')
    expect(context.blocks).toHaveLength(1)
  })

  it('allows touching half-open availability blocks', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const first = await doctor.post('/api/doctors/me/availability').send(validInput)
    const second = await doctor.post('/api/doctors/me/availability').send({
      ...validInput,
      startTime: '11:00',
      endTime: '12:00',
    })

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(context.blocks).toHaveLength(2)
  })

  it('allows different Doctors to create overlapping availability', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const otherDoctor = await login(context.app, 'other@example.test')
    const responses = await Promise.all([
      doctor.post('/api/doctors/me/availability').send(validInput),
      otherDoctor.post('/api/doctors/me/availability').send(validInput),
    ])

    expect(responses.map(response => response.status)).toEqual([201, 201])
    expect(context.blocks.map(block => block.doctorId).sort()).toEqual([10, 13])
  })

  it.each(['pending@example.test', 'rejected@example.test'])('rejects a non-approved Doctor', async email => {
    const doctor = await login(context.app, email)
    const response = await doctor.post('/api/doctors/me/availability').send(validInput)

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('DOCTOR_NOT_APPROVED')
    expect(context.blocks).toHaveLength(0)
  })

  it('rejects a non-Doctor through the existing role authorization', async () => {
    const patient = await login(context.app, 'patient@example.test')
    const response = await patient.post('/api/doctors/me/availability').send(validInput)

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('ROLE_FORBIDDEN')
  })

  it.each(['pending@example.test', 'rejected@example.test'])('rejects a non-approved Doctor', async email => {
    const doctor = await login(context.app, email)
    const response = await doctor.get('/api/doctors/me/availability')

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('DOCTOR_NOT_APPROVED')
  })

  it('rejects a disabled Doctor through the existing live-account check', async () => {
    const doctor = await login(context.app, 'disabled@example.test')
    context.users.find(user => user.id === 14).isEnabled = false
    const response = await doctor.post('/api/doctors/me/availability').send(validInput)

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('ACCOUNT_DISABLED')
  })

  it('preserves ACCOUNT_DISABLED when the transactional recheck detects a disable race', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    context.databaseDisabledDoctorIds.add(10)
    const response = await doctor.post('/api/doctors/me/availability').send(validInput)

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('ACCOUNT_DISABLED')
    expect(context.blocks).toHaveLength(0)
  })
})

describe('Doctor own availability API', () => {
  let context

  beforeEach(() => {
    context = createTestContext()
  })

  it('requires authentication', async () => {
    const response = await request(context.app).get('/api/doctors/me/availability')

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED')
  })

  it('returns only blocks owned by the signed-in Doctor', async () => {
    const own = context.addBlock({
      doctorId: 10,
      startAt: '2026-09-20T03:30:00.000Z',
      endAt: '2026-09-20T04:30:00.000Z',
      slotStarts: ['2026-09-20T03:30:00.000Z'],
    })
    const other = context.addBlock({
      doctorId: 13,
      startAt: '2026-09-20T03:30:00.000Z',
      endAt: '2026-09-20T04:30:00.000Z',
      slotStarts: ['2026-09-20T03:30:00.000Z'],
    })
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.get('/api/doctors/me/availability')

    expect(response.status).toBe(200)
    expect(response.body.items.map(item => item.id)).toEqual([own.block.id])
    expect(response.body.items.flatMap(item => item.slots).map(item => item.id)).not.toContain(other.slots[0].id)
  })

  it('exposes only the owned block source identifier for one-off and recurring availability', async () => {
    context.addBlock({
      doctorId: 10,
      startAt: '2026-09-20T03:30:00.000Z',
      endAt: '2026-09-20T04:00:00.000Z',
      recurringRuleId: null,
    })
    context.addBlock({
      doctorId: 10,
      startAt: '2026-09-21T03:30:00.000Z',
      endAt: '2026-09-21T04:00:00.000Z',
      recurringRuleId: 73,
    })
    context.addBlock({
      doctorId: 13,
      startAt: '2026-09-22T03:30:00.000Z',
      endAt: '2026-09-22T04:00:00.000Z',
      recurringRuleId: 99,
    })
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.get('/api/doctors/me/availability')

    expect(response.status).toBe(200)
    expect(response.body.items.map(item => item.recurringRuleId)).toEqual([null, 73])
    expect(JSON.stringify(response.body)).not.toContain('99')
  })

  it('sorts blocks and their slots by start time', async () => {
    const later = context.addBlock({
      doctorId: 10,
      startAt: '2026-09-21T06:30:00.000Z',
      endAt: '2026-09-21T07:30:00.000Z',
      slotStarts: ['2026-09-21T07:00:00.000Z', '2026-09-21T06:30:00.000Z'],
    })
    const earlier = context.addBlock({
      doctorId: 10,
      startAt: '2026-09-20T03:30:00.000Z',
      endAt: '2026-09-20T04:30:00.000Z',
      slotStarts: ['2026-09-20T04:00:00.000Z', '2026-09-20T03:30:00.000Z'],
    })
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.get('/api/doctors/me/availability')

    expect(response.body.items.map(item => item.id)).toEqual([earlier.block.id, later.block.id])
    expect(response.body.items[0].slots.map(item => item.startAt)).toEqual([
      '2026-09-20T03:30:00.000Z',
      '2026-09-20T04:00:00.000Z',
    ])
  })

  it('uses the block fee and falls back to the Doctor default fee', async () => {
    context.addBlock({
      doctorId: 10,
      startAt: '2026-09-20T03:30:00.000Z',
      endAt: '2026-09-20T04:00:00.000Z',
      effectiveFee: 725,
    })
    context.addBlock({
      doctorId: 10,
      startAt: '2026-09-21T03:30:00.000Z',
      endAt: '2026-09-21T04:00:00.000Z',
    })
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.get('/api/doctors/me/availability')

    expect(response.body.items.map(item => item.effectiveFee)).toEqual([725, 650])
  })

  it('returns null when both the block fee and Doctor default fee are null', async () => {
    context.addBlock({
      doctorId: 13,
      startAt: '2026-09-20T03:30:00.000Z',
      endAt: '2026-09-20T04:00:00.000Z',
    })
    const doctor = await login(context.app, 'other@example.test')
    const response = await doctor.get('/api/doctors/me/availability')

    expect(response.body.items[0].effectiveFee).toBeNull()
  })

  it('marks a future block with no appointment history as deletable', async () => {
    context.addBlock({
      doctorId: 10,
      startAt: '2026-09-20T03:30:00.000Z',
      endAt: '2026-09-20T04:00:00.000Z',
      slotStarts: ['2026-09-20T03:30:00.000Z'],
    })
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.get('/api/doctors/me/availability')

    expect(response.body.items[0]).toMatchObject({ isProtected: false, canDelete: true })
    expect(response.body.items[0].slots[0]).toMatchObject({
      isActive: true,
      isBooked: false,
      hasAppointmentHistory: false,
      isExceptionBlocked: false,
      isBookable: true,
    })
  })

  it('preserves raw slot activity while exposing exception-blocked effective bookability', async () => {
    context.addBlock({
      doctorId: 10,
      startAt: '2026-09-20T03:30:00.000Z',
      endAt: '2026-09-20T04:00:00.000Z',
      slotStarts: [{
        startAt: '2026-09-20T03:30:00.000Z',
        isActive: true,
        isExceptionBlocked: true,
      }],
    })
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.get('/api/doctors/me/availability')

    expect(response.body.items[0].slots[0]).toMatchObject({
      isActive: true,
      isBooked: false,
      isExceptionBlocked: true,
      isBookable: false,
    })
  })

  it('protects a block containing a booked appointment', async () => {
    const availability = context.addBlock({
      doctorId: 10,
      startAt: '2026-09-20T03:30:00.000Z',
      endAt: '2026-09-20T04:00:00.000Z',
      slotStarts: ['2026-09-20T03:30:00.000Z'],
    })
    context.appointments.push({ slotId: availability.slots[0].id, status: 'booked' })
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.get('/api/doctors/me/availability')

    expect(response.body.items[0]).toMatchObject({ isProtected: true, canDelete: false })
    expect(response.body.items[0].slots[0]).toMatchObject({
      isBooked: true,
      hasAppointmentHistory: true,
      isExceptionBlocked: false,
      isBookable: false,
    })
  })

  it.each(['cancelled', 'rescheduled', 'completed'])('protects a block with %s appointment history', async status => {
    const availability = context.addBlock({
      doctorId: 10,
      startAt: '2026-09-20T03:30:00.000Z',
      endAt: '2026-09-20T04:00:00.000Z',
      slotStarts: ['2026-09-20T03:30:00.000Z'],
    })
    context.appointments.push({ slotId: availability.slots[0].id, status })
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.get('/api/doctors/me/availability')

    expect(response.body.items[0]).toMatchObject({ isProtected: true, canDelete: false })
    expect(response.body.items[0].slots[0]).toMatchObject({
      isBooked: false,
      hasAppointmentHistory: true,
      isBookable: true,
    })
  })

  it('returns current availability, excludes ended blocks, and does not mark a current block deletable', async () => {
    const current = context.addBlock({
      doctorId: 10,
      startAt: '2026-09-14T23:30:00.000Z',
      endAt: '2026-09-15T00:30:00.000Z',
      slotStarts: ['2026-09-14T23:30:00.000Z'],
    })
    context.addBlock({
      doctorId: 10,
      startAt: '2026-09-14T22:00:00.000Z',
      endAt: '2026-09-14T23:00:00.000Z',
    })
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.get('/api/doctors/me/availability')

    expect(response.body.items).toEqual([
      expect.objectContaining({ id: current.block.id, canDelete: false }),
    ])
    expect(response.body.items[0].slots[0].isBookable).toBe(false)
  })

  it('rejects a non-Doctor through the existing role authorization', async () => {
    const patient = await login(context.app, 'patient@example.test')
    const response = await patient.get('/api/doctors/me/availability')

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('ROLE_FORBIDDEN')
  })

  it('rejects a disabled Doctor through the existing live-account check', async () => {
    const doctor = await login(context.app, 'disabled@example.test')
    context.users.find(user => user.id === 14).isEnabled = false
    const response = await doctor.get('/api/doctors/me/availability')

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('ACCOUNT_DISABLED')
  })

  it('returns an empty list cleanly', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.get('/api/doctors/me/availability')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ items: [] })
  })
})

describe('Doctor availability deletion API', () => {
  let context

  beforeEach(() => {
    context = createTestContext()
  })

  function addFutureBlock(doctorId = 10) {
    return context.addBlock({
      doctorId,
      startAt: '2026-09-20T03:30:00.000Z',
      endAt: '2026-09-20T04:30:00.000Z',
      slotStarts: ['2026-09-20T03:30:00.000Z', '2026-09-20T04:00:00.000Z'],
    })
  }

  it('allows the owner to delete a completely unused future block', async () => {
    const availability = addFutureBlock()
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.delete(`/api/doctors/me/availability/${availability.block.id}`)

    expect(response.status).toBe(204)
    expect(context.blocks).toHaveLength(0)
  })

  it('removes all child slots with the unused block', async () => {
    const availability = addFutureBlock()
    const doctor = await login(context.app, 'approved@example.test')
    await doctor.delete(`/api/doctors/me/availability/${availability.block.id}`)

    expect(context.slots).toHaveLength(0)
  })

  it('does not reveal another Doctor\'s block', async () => {
    const availability = addFutureBlock(13)
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.delete(`/api/doctors/me/availability/${availability.block.id}`)

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('AVAILABILITY_BLOCK_NOT_FOUND')
    expect(context.blocks).toHaveLength(1)
    expect(context.slots).toHaveLength(2)
  })

  it('rejects a non-Doctor through the existing role authorization', async () => {
    const availability = addFutureBlock()
    const patient = await login(context.app, 'patient@example.test')
    const response = await patient.delete(`/api/doctors/me/availability/${availability.block.id}`)

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('ROLE_FORBIDDEN')
  })

  it('rejects a disabled Doctor through the existing live-account check', async () => {
    const availability = addFutureBlock(14)
    const doctor = await login(context.app, 'disabled@example.test')
    context.users.find(user => user.id === 14).isEnabled = false
    const response = await doctor.delete(`/api/doctors/me/availability/${availability.block.id}`)

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('ACCOUNT_DISABLED')
    expect(context.blocks).toHaveLength(1)
  })

  it.each(['pending@example.test', 'rejected@example.test'])('rejects a non-approved Doctor', async email => {
    const doctorId = email === 'pending@example.test' ? 11 : 12
    const availability = addFutureBlock(doctorId)
    const doctor = await login(context.app, email)
    const response = await doctor.delete(`/api/doctors/me/availability/${availability.block.id}`)

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('DOCTOR_NOT_APPROVED')
    expect(context.blocks).toHaveLength(1)
  })

  it.each([
    ['current', '2026-09-14T23:30:00.000Z', '2026-09-15T00:30:00.000Z'],
    ['past', '2026-09-14T22:00:00.000Z', '2026-09-14T23:00:00.000Z'],
  ])('rejects a %s block', async (_label, startAt, endAt) => {
    const availability = context.addBlock({ doctorId: 10, startAt, endAt })
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.delete(`/api/doctors/me/availability/${availability.block.id}`)

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('AVAILABILITY_BLOCK_NOT_DELETABLE')
    expect(context.blocks).toHaveLength(1)
  })

  it.each(['booked', 'cancelled', 'completed', 'no_show', 'rescheduled'])('protects a block with %s appointment history', async status => {
    const availability = addFutureBlock()
    context.appointments.push({ slotId: availability.slots[0].id, status })
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.delete(`/api/doctors/me/availability/${availability.block.id}`)

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('AVAILABILITY_BLOCK_PROTECTED')
    expect(context.blocks).toHaveLength(1)
    expect(context.slots).toHaveLength(2)
  })

  it('handles an unknown block without leaking information', async () => {
    const doctor = await login(context.app, 'approved@example.test')
    const response = await doctor.delete('/api/doctors/me/availability/99999')

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('AVAILABILITY_BLOCK_NOT_FOUND')
  })
})
