import { describe, expect, it, vi } from 'vitest'
import {
  AvailabilityDataError,
  createAvailabilityRepository,
} from '../src/data-access/availability.repository.js'

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim()
}

const exclusiveAvailabilityLockSql = normalizeSql(`SELECT pg_advisory_xact_lock(
  hashtextextended('medreach:doctor-availability:' || $1::text, 0)
)`)

function createTransactionalDatabase({ exceptionConflict = false, failSlotInsert = false } = {}) {
  const blocks = []
  const slots = []
  const queries = []
  const lockTails = new Map()
  let nextBlockId = 1
  let nextSlotId = 100

  async function acquireDoctorLock(doctorId) {
    const previous = lockTails.get(doctorId) ?? Promise.resolve()
    let release
    const held = new Promise(resolve => { release = resolve })
    lockTails.set(doctorId, previous.then(() => held))
    await previous
    return release
  }

  function connect() {
    let pendingBlock = null
    let pendingSlots = []
    let releaseLock = null

    return {
      async query(sql, values = []) {
        const normalized = normalizeSql(sql)
        queries.push({ sql: normalized, values })

        if (normalized === 'BEGIN') return { rows: [], rowCount: 0 }
        if (normalized === 'COMMIT') {
          if (pendingBlock) blocks.push(pendingBlock)
          slots.push(...pendingSlots)
          releaseLock?.()
          return { rows: [], rowCount: 0 }
        }
        if (normalized === 'ROLLBACK') {
          pendingBlock = null
          pendingSlots = []
          releaseLock?.()
          return { rows: [], rowCount: 0 }
        }
        if (normalized.includes('pg_advisory_xact_lock')) {
          releaseLock = await acquireDoctorLock(Number(values[0]))
          return { rows: [{}], rowCount: 1 }
        }
        if (normalized.includes('FROM users u')) {
          return { rows: [{ is_enabled: true, verification_status: 'approved' }], rowCount: 1 }
        }
        if (normalized.endsWith('AS has_exception')) {
          return { rows: [{ has_exception: exceptionConflict }], rowCount: 1 }
        }
        if (normalized.includes('FROM recurring_availability_rules')) {
          return { rows: [], rowCount: 0 }
        }
        if (normalized.includes('FROM slots slot') && normalized.includes('JOIN availability_blocks block')) {
          await Promise.resolve()
          const [doctorId, startAt, endAt] = values
          const overlapping = slots.some(slot => {
            const block = blocks.find(item => item.id === slot.availability_block_id)
            return block?.doctor_id === doctorId
              && slot.start_at < endAt
              && slot.end_at > startAt
              && slot.is_active
          })
          return { rows: overlapping ? [{}] : [], rowCount: overlapping ? 1 : 0 }
        }
        if (normalized.includes('FROM availability_blocks')) {
          await Promise.resolve()
          const [doctorId, startAt, endAt] = values
          const overlapping = blocks.some(block => block.doctor_id === doctorId
            && block.start_at < endAt
            && block.end_at > startAt)
          return { rows: overlapping ? [{}] : [], rowCount: overlapping ? 1 : 0 }
        }
        if (normalized.startsWith('INSERT INTO availability_blocks')) {
          const [doctorId, startAt, endAt, fee] = values
          pendingBlock = {
            id: nextBlockId++,
            doctor_id: doctorId,
            start_at: startAt,
            end_at: endAt,
            effective_fee: fee,
            created_at: new Date('2026-09-15T00:00:00.000Z'),
            updated_at: new Date('2026-09-15T00:00:00.000Z'),
          }
          return { rows: [pendingBlock], rowCount: 1 }
        }
        if (normalized.startsWith('INSERT INTO slots')) {
          if (failSlotInsert) throw new Error('Simulated slot insert failure')
          const [blockId, startAt, endAt] = values
          pendingSlots = []
          for (let instant = startAt.getTime(); instant < endAt.getTime(); instant += 30 * 60 * 1000) {
            pendingSlots.push({
              id: nextSlotId++,
              availability_block_id: blockId,
              start_at: new Date(instant),
              end_at: new Date(instant + 30 * 60 * 1000),
              is_active: true,
              created_at: new Date('2026-09-15T00:00:00.000Z'),
            })
          }
          return { rows: pendingSlots, rowCount: pendingSlots.length }
        }

        throw new Error(`Unexpected query: ${normalized}`)
      },
      release() {},
    }
  }

  return {
    blocks,
    queries,
    slots,
    provider: () => ({ connect }),
  }
}

function createDeletionRaceDatabase({ failBlockDelete = false } = {}) {
  const statements = []
  const queries = []
  const state = {
    block: { id: 50, doctorId: 10, startAt: new Date('2026-09-20T03:30:00.000Z') },
    slots: [{ id: 500, blockId: 50 }],
    appointments: [],
  }
  let slotLockTail = Promise.resolve()

  async function acquireSlotLock() {
    const previous = slotLockTail
    let release
    const held = new Promise(resolve => { release = resolve })
    slotLockTail = previous.then(() => held)
    await previous
    return release
  }

  function connect() {
    let releaseSlotLock = null
    let deleteSlots = false
    let deleteBlock = false

    return {
      async query(sql, values = []) {
        statements.push(sql)
        const normalized = normalizeSql(sql)
        queries.push({ sql: normalized, values })

        if (normalized === 'BEGIN') return { rows: [], rowCount: 0 }
        if (normalized === 'COMMIT') {
          if (deleteSlots) state.slots = []
          if (deleteBlock) state.block = null
          releaseSlotLock?.()
          return { rows: [], rowCount: 0 }
        }
        if (normalized === 'ROLLBACK') {
          releaseSlotLock?.()
          return { rows: [], rowCount: 0 }
        }
        if (normalized.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 }
        if (normalized.includes('FROM users u')) {
          return { rows: [{ is_enabled: true, verification_status: 'approved' }], rowCount: 1 }
        }
        if (normalized.includes('SELECT slot.id') && normalized.includes('FOR UPDATE OF slot')) {
          releaseSlotLock = await acquireSlotLock()
          return { rows: state.slots.map(slot => ({ id: slot.id })), rowCount: state.slots.length }
        }
        if (normalized.includes('SELECT id, start_at') && normalized.includes('FROM availability_blocks')) {
          return state.block
            ? { rows: [{ id: state.block.id, start_at: state.block.startAt }], rowCount: 1 }
            : { rows: [], rowCount: 0 }
        }
        if (normalized.includes('FROM appointments appointment')) {
          return {
            rows: state.appointments.length > 0 ? [{}] : [],
            rowCount: state.appointments.length > 0 ? 1 : 0,
          }
        }
        if (normalized.startsWith('DELETE FROM slots')) {
          deleteSlots = true
          return { rows: [], rowCount: state.slots.length }
        }
        if (normalized.startsWith('DELETE FROM availability_blocks')) {
          if (failBlockDelete) throw new Error('Simulated block delete failure')
          deleteBlock = true
          return { rows: [], rowCount: state.block ? 1 : 0 }
        }

        throw new Error(`Unexpected query: ${normalized}`)
      },
      release() {},
    }
  }

  return {
    state,
    queries,
    statements,
    provider: () => ({ connect }),
    async book() {
      const release = await acquireSlotLock()
      try {
        if (!state.block || state.slots.length === 0) return false
        state.appointments.push({ slotId: state.slots[0].id, status: 'booked' })
        return true
      } finally {
        release()
      }
    },
  }
}

const interval = {
  doctorId: 10,
  startAt: new Date('2026-09-20T03:30:00.000Z'),
  endAt: new Date('2026-09-20T05:30:00.000Z'),
  fee: null,
}

describe('availability repository transactions', () => {
  it('scopes current and future availability to the requested Doctor in sorted order', async () => {
    const database = { query: vi.fn().mockResolvedValue({
      rows: [{
        is_enabled: true,
        verification_status: 'approved',
        block_id: null,
      }],
    }) }
    const repository = createAvailabilityRepository(() => database)
    const currentTime = new Date('2026-09-15T00:00:00.000Z')

    await repository.listForDoctor(10, currentTime)

    const [sql, values] = database.query.mock.calls[0]
    expect(sql).toContain('ON block.doctor_id = u.id')
    expect(sql).toContain('AND block.end_at > $2')
    expect(sql).toContain('WHERE u.id = $1')
    expect(sql).toContain('ORDER BY block.start_at ASC')
    expect(sql).toContain('slot.start_at ASC')
    expect(sql).toContain('FROM appointments appointment_history')
    expect(sql).toContain('block.recurring_rule_id')
    expect(sql).not.toContain('appointment_history.status')
    expect(values).toEqual([10, currentTime])
  })

  it('normalizes recurring-rule PostgreSQL dates at the repository boundary', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          is_enabled: true,
          verification_status: 'approved',
          rule_id: 41,
          weekdays: [1, 5],
          start_time: '09:00:00',
          end_time: '12:00:00',
          starts_on: new Date('2026-09-27T18:30:00.000Z'),
          ends_on: new Date('2026-10-30T18:30:00.000Z'),
          effective_fee: '650',
          status: 'active',
          materialized_through: new Date('2026-10-30T18:30:00.000Z'),
          materialized_occurrence_count: 10,
          created_at: new Date('2026-09-18T00:00:00.000Z'),
          updated_at: new Date('2026-09-18T00:00:00.000Z'),
        }],
      }),
      release: vi.fn(),
    }
    const repository = createAvailabilityRepository(() => ({ connect: async () => client }))

    const rules = await repository.listRecurringForDoctor(10)

    expect(rules[0]).toMatchObject({
      startsOn: '2026-09-28',
      endsOn: '2026-10-31',
      materializedThrough: '2026-10-31',
      materializedOccurrenceCount: 10,
    })
    expect(client.release).toHaveBeenCalledOnce()
  })

  it('rolls back the block when slot creation fails', async () => {
    const database = createTransactionalDatabase({ failSlotInsert: true })
    const repository = createAvailabilityRepository(database.provider)

    await expect(repository.create(interval)).rejects.toThrow('Simulated slot insert failure')
    expect(database.blocks).toHaveLength(0)
    expect(database.slots).toHaveLength(0)
  })

  it('serializes same-Doctor creation so concurrent overlaps cannot both succeed', async () => {
    const database = createTransactionalDatabase()
    const repository = createAvailabilityRepository(database.provider)

    const results = await Promise.allSettled([
      repository.create(interval),
      repository.create({
        ...interval,
        startAt: new Date('2026-09-20T04:30:00.000Z'),
        endAt: new Date('2026-09-20T06:30:00.000Z'),
      }),
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejection = results.find(result => result.status === 'rejected')
    expect(rejection.reason).toBeInstanceOf(AvailabilityDataError)
    expect(rejection.reason.code).toBe('AVAILABILITY_OVERLAP')
    expect(database.blocks).toHaveLength(1)
    expect(database.slots).toHaveLength(4)
    const advisoryLocks = database.queries.filter(query => query.sql === exclusiveAvailabilityLockSql)
    expect(advisoryLocks).toHaveLength(2)
    expect(advisoryLocks.every(query => query.values[0] === 10)).toBe(true)
  })

  it('rejects one-off creation over an active exception before writing a block', async () => {
    const database = createTransactionalDatabase({ exceptionConflict: true })
    const repository = createAvailabilityRepository(database.provider)

    await expect(repository.create(interval)).rejects.toMatchObject({
      code: 'AVAILABILITY_EXCEPTION_CONFLICT',
    })
    expect(database.blocks).toHaveLength(0)
    expect(database.slots).toHaveLength(0)
  })

  it('atomically removes slots and their unused future block', async () => {
    const database = createDeletionRaceDatabase()
    const repository = createAvailabilityRepository(database.provider)

    await repository.remove({
      doctorId: 10,
      blockId: 50,
      now: new Date('2026-09-15T00:00:00.000Z'),
    })

    expect(database.state.block).toBeNull()
    expect(database.state.slots).toEqual([])
    expect(database.state.appointments).toEqual([])
    const advisoryLock = database.queries.findIndex(query => query.sql === exclusiveAvailabilityLockSql)
    const slotLock = database.statements.findIndex(sql => sql.includes('FOR UPDATE OF slot'))
    const historyCheck = database.statements.findIndex(sql => sql.includes('FROM appointments appointment'))
    const slotDelete = database.statements.findIndex(sql => sql.startsWith('DELETE FROM slots'))
    const blockDelete = database.statements.findIndex(sql => sql.startsWith('DELETE FROM availability_blocks'))
    expect(advisoryLock).toBeLessThan(slotLock)
    expect(slotLock).toBeLessThan(historyCheck)
    expect(historyCheck).toBeLessThan(slotDelete)
    expect(slotDelete).toBeLessThan(blockDelete)
    expect(database.statements[historyCheck]).not.toContain('appointment.status')
    expect(database.queries[advisoryLock].values).toEqual([10])
  })

  it('rolls back deleted child slots when deleting the block fails', async () => {
    const database = createDeletionRaceDatabase({ failBlockDelete: true })
    const repository = createAvailabilityRepository(database.provider)

    await expect(repository.remove({
      doctorId: 10,
      blockId: 50,
      now: new Date('2026-09-15T00:00:00.000Z'),
    })).rejects.toThrow('Simulated block delete failure')

    expect(database.state.block).not.toBeNull()
    expect(database.state.slots).toEqual([{ id: 500, blockId: 50 }])
    expect(database.state.appointments).toEqual([])
    expect(database.statements).toContain('ROLLBACK')
    expect(database.statements).not.toContain('COMMIT')
  })

  it('allows only booking or deletion to win their concurrent slot race', async () => {
    const database = createDeletionRaceDatabase()
    const repository = createAvailabilityRepository(database.provider)

    const [deletion, booking] = await Promise.allSettled([
      repository.remove({
        doctorId: 10,
        blockId: 50,
        now: new Date('2026-09-15T00:00:00.000Z'),
      }),
      database.book(),
    ])
    const deletionSucceeded = deletion.status === 'fulfilled'
    const bookingSucceeded = booking.status === 'fulfilled' && booking.value

    expect(Number(deletionSucceeded) + Number(bookingSucceeded)).toBe(1)
    if (deletionSucceeded) {
      expect(database.state.block).toBeNull()
      expect(database.state.slots).toEqual([])
      expect(database.state.appointments).toEqual([])
    } else {
      expect(deletion.reason).toMatchObject({ code: 'AVAILABILITY_BLOCK_PROTECTED' })
      expect(database.state.block).not.toBeNull()
      expect(database.state.slots).toHaveLength(1)
      expect(database.state.appointments).toHaveLength(1)
    }
  })
})
