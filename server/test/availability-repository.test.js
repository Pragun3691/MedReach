import { describe, expect, it } from 'vitest'
import {
  AvailabilityDataError,
  createAvailabilityRepository,
} from '../src/data-access/availability.repository.js'

function createTransactionalDatabase({ failSlotInsert = false } = {}) {
  const blocks = []
  const slots = []
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
        const normalized = sql.replace(/\s+/g, ' ').trim()

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
    slots,
    provider: () => ({ connect }),
  }
}

const interval = {
  doctorId: 10,
  startAt: new Date('2026-09-20T03:30:00.000Z'),
  endAt: new Date('2026-09-20T05:30:00.000Z'),
  fee: null,
}

describe('availability repository transactions', () => {
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
  })
})
