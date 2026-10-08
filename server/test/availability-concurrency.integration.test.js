import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { createDatabaseConfig } from '../src/config/database.js'
import { MigrationBuilder } from 'node-pg-migrate'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { up as upPublicDiscovery } from '../migrations/1788175200000_create-public-discovery-schema.js'
import { up as upAuthentication } from '../migrations/1788175300000_create-authentication-schema.js'
import { up as upAppointmentBooking } from '../migrations/1788175400000_create-appointment-booking-schema.js'
import { up as upConsultationLifecycle } from '../migrations/1788775500000_create-consultation-lifecycle.js'
import { up as upClinicalWorkspace } from '../migrations/1789375600000_add-consultation-clinical-workspace.js'
import { up as upSearchAliases } from '../migrations/1790000000000_add_search_aliases.js'
import { up as upRecurringAvailability } from '../migrations/1790100000000_add-recurring-availability-rules.js'
import { up as upAvailabilityExceptions } from '../migrations/1790200000000_add-availability-exceptions.js'
import { up as upAvailabilityExceptionGroups } from '../migrations/1790300000000_add-availability-exception-groups.js'
import { createAppointmentRepository } from '../src/data-access/appointment.repository.js'
import { createAvailabilityRepository } from '../src/data-access/availability.repository.js'

const { Pool } = pg
const describeWithPostgres = process.env.DATABASE_URL ? describe : describe.skip

function migrationSql(migration) {
  const pgm = new MigrationBuilder({
    query: () => { throw new Error('Migration generation must not query the database') },
    select: () => { throw new Error('Migration generation must not query the database') },
  }, undefined, false, console)
  migration(pgm)
  return pgm.getSql()
}

describeWithPostgres('availability PostgreSQL concurrency', () => {
  let pool
  let schema
  let appointmentRepository
  let availabilityRepository
  let patientId
  let doctorId
  let reviewerId
  const suffix = randomUUID()

  async function schemaClient() {
    const client = await pool.connect()
    await client.query(`SET search_path TO "${schema}"`)
    return client
  }

  async function query(sql, values = []) {
    const client = await schemaClient()
    try {
      return await client.query(sql, values)
    } finally {
      client.release()
    }
  }

  async function insertUser(client, role, label) {
    const result = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [`Concurrency ${label}`, `availability-${label}-${suffix}@example.test`, 'integration-test-only', role],
    )
    return result.rows[0].id
  }

  async function createBlock(doctor, offsetMinutes, slotCount = 1) {
    const startAt = new Date(Date.now() + (7 * 24 * 60 + offsetMinutes) * 60 * 1000)
    startAt.setUTCSeconds(0, 0)
    const endAt = new Date(startAt.getTime() + slotCount * 30 * 60 * 1000)
    const blockResult = await query(
      `INSERT INTO availability_blocks (doctor_id, start_at, end_at)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [doctor, startAt, endAt],
    )
    const blockId = blockResult.rows[0].id
    const slots = []
    for (let index = 0; index < slotCount; index += 1) {
      const slotStart = new Date(startAt.getTime() + index * 30 * 60 * 1000)
      const slotResult = await query(
        `INSERT INTO slots (availability_block_id, start_at, end_at)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [blockId, slotStart, new Date(slotStart.getTime() + 30 * 60 * 1000)],
      )
      slots.push(slotResult.rows[0].id)
    }

    return { blockId, slots }
  }

  function instrumentedProvider({ pauseAfter, signalBefore } = {}) {
    let releasePause
    let signalPaused
    let signalAttempted
    let hasPaused = false
    let hasSignalled = false
    const pause = new Promise(resolve => { releasePause = resolve })
    const paused = new Promise(resolve => { signalPaused = resolve })
    const attempted = new Promise(resolve => { signalAttempted = resolve })

    return {
      attempted,
      paused,
      provider: () => ({
        async connect() {
          const client = await schemaClient()
          return {
            release: () => client.release(),
            async query(...args) {
              const sql = typeof args[0] === 'string' ? args[0] : args[0].text
              if (!hasSignalled && signalBefore?.(sql)) {
                hasSignalled = true
                signalAttempted()
              }
              const result = await client.query(...args)
              if (!hasPaused && pauseAfter?.(sql)) {
                hasPaused = true
                signalPaused()
                await pause
              }
              return result
            },
          }
        },
      }),
      release: () => releasePause(),
    }
  }

  async function slotDate(slotId) {
    const result = await query(
      `SELECT (start_at AT TIME ZONE 'Asia/Kolkata')::date::text AS date
       FROM slots WHERE id = $1`,
      [slotId],
    )
    return result.rows[0].date
  }

  function nextDate(date) {
    const next = new Date(`${date}T00:00:00.000Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    return next.toISOString().slice(0, 10)
  }

  beforeAll(async () => {
    pool = new Pool({
      ...createDatabaseConfig(process.env),
      statement_timeout: 5000,
    })
    schema = `availability_concurrency_${randomUUID().replaceAll('-', '')}`
    const client = await pool.connect()
    try {
      await client.query(`CREATE SCHEMA "${schema}"`)
      await client.query(`SET search_path TO "${schema}"`)
      for (const migration of [
        upPublicDiscovery,
        upAuthentication,
        upAppointmentBooking,
        upConsultationLifecycle,
        upClinicalWorkspace,
        upSearchAliases,
        upRecurringAvailability,
        upAvailabilityExceptions,
        upAvailabilityExceptionGroups,
      ]) {
        await client.query(migrationSql(migration))
      }
      reviewerId = await insertUser(client, 'admin', 'reviewer')
      doctorId = await insertUser(client, 'doctor', 'doctor')
      patientId = await insertUser(client, 'patient', 'patient')
      await client.query(
        `INSERT INTO doctor_profiles (user_id, qualification, experience_years, default_fee)
         VALUES ($1, 'MBBS', 1, 500)`,
        [doctorId],
      )
      await client.query(
        `INSERT INTO doctor_verifications (
           doctor_id, registration_number, issuing_authority, status,
           reviewed_by_user_id, reviewed_at
         ) VALUES ($1, $2, 'Integration Test Authority', 'approved', $3, current_timestamp)`,
        [doctorId, `integration-${suffix}`, reviewerId],
      )
      await client.query('INSERT INTO patient_profiles (user_id) VALUES ($1)', [patientId])
    } finally {
      client.release()
    }

    const provider = () => ({ connect: schemaClient })
    appointmentRepository = createAppointmentRepository(provider)
    availabilityRepository = createAvailabilityRepository(provider)
  })

  afterAll(async () => {
    if (!pool) return

    const client = await pool.connect()
    try {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally {
      client.release()
      await pool.end()
    }
  })

  it('allows only a real booking or deletion to succeed', async () => {
    const { blockId, slots } = await createBlock(doctorId, 0)

    const [booking, deletion] = await Promise.allSettled([
      appointmentRepository.book({ patientId: Number(patientId), patientName: 'Concurrency Patient', slotId: Number(slots[0]) }),
      availabilityRepository.remove({
        doctorId,
        blockId,
        now: new Date(),
      }),
    ])

    expect([booking, deletion].filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const state = await query(
      `SELECT
         EXISTS (SELECT 1 FROM availability_blocks WHERE id = $1) AS block_exists,
         EXISTS (SELECT 1 FROM slots WHERE id = $2) AS slot_exists,
         EXISTS (SELECT 1 FROM appointments WHERE slot_id = $2) AS appointment_exists`,
      [blockId, slots[0]],
    )
    const row = state.rows[0]
    expect(row.block_exists).toBe(row.slot_exists)
    expect(row.appointment_exists).toBe(row.slot_exists)
  })

  it('reschedules while a protected-block deletion fails without deadlock or corruption', async () => {
    const originalBlock = await createBlock(doctorId, 120)
    const targetBlock = await createBlock(doctorId, 180)
    const original = await appointmentRepository.book({
      patientId: Number(patientId),
      patientName: 'Concurrency Patient',
      slotId: Number(originalBlock.slots[0]),
    })

    const [reschedule, deletion] = await Promise.allSettled([
      appointmentRepository.reschedule({
        appointmentId: Number(original.id),
        patientId: Number(patientId),
        slotId: Number(targetBlock.slots[0]),
        now: new Date(),
      }),
      availabilityRepository.remove({
        doctorId,
        blockId: originalBlock.blockId,
        now: new Date(),
      }),
    ])

    expect(reschedule.status).toBe('fulfilled')
    expect(deletion.status).toBe('rejected')
    expect(deletion.reason).toMatchObject({ code: 'AVAILABILITY_BLOCK_PROTECTED' })
    const appointments = await query(
      `SELECT slot_id, status, rescheduled_from_appointment_id
       FROM appointments
       WHERE id = $1 OR rescheduled_from_appointment_id = $1
       ORDER BY id`,
      [original.id],
    )
    expect(appointments.rows).toEqual([
      expect.objectContaining({ slot_id: originalBlock.slots[0], status: 'rescheduled' }),
      expect.objectContaining({
        slot_id: targetBlock.slots[0],
        status: 'booked',
        rescheduled_from_appointment_id: original.id,
      }),
    ])
  })

  it('allows independent same-Doctor slots to be booked concurrently', async () => {
    const { slots } = await createBlock(doctorId, 300, 2)

    const bookings = await Promise.all([
      appointmentRepository.book({ patientId: Number(patientId), patientName: 'Concurrency Patient', slotId: Number(slots[0]) }),
      appointmentRepository.book({ patientId: Number(patientId), patientName: 'Concurrency Patient', slotId: Number(slots[1]) }),
    ])

    expect(bookings).toHaveLength(2)
    expect(new Set(bookings.map(booking => Number(booking.slot_id)))).toEqual(
      new Set(slots.map(Number)),
    )
  })

  it('lets a booking holding the shared lock commit before rejecting the entire waiting range', async () => {
    const { slots } = await createBlock(doctorId, 10 * 24 * 60)
    const date = await slotDate(slots[0])
    const bookingControl = instrumentedProvider({
      pauseAfter: sql => sql.includes('INSERT INTO appointments'),
    })
    const rangeControl = instrumentedProvider({
      signalBefore: sql => sql.includes('pg_advisory_xact_lock('),
    })
    const bookingRepository = createAppointmentRepository(bookingControl.provider)
    const rangeRepository = createAvailabilityRepository(rangeControl.provider)

    const booking = bookingRepository.book({
      patientId: Number(patientId), patientName: 'Concurrency Patient', slotId: Number(slots[0]),
    })
    await bookingControl.paused
    const range = rangeRepository.createExceptionRange({
      doctorId, startDate: date, endDate: nextDate(date),
    }, new Date())
    await rangeControl.attempted
    bookingControl.release()

    await expect(booking).resolves.toMatchObject({ slot_id: slots[0] })
    await expect(range).rejects.toMatchObject({
      code: 'AVAILABILITY_EXCEPTION_BOOKED_CONFLICT', details: { conflictCount: 1 },
    })
    const stored = await query(
      `SELECT COUNT(*)::int AS count FROM availability_exceptions
       WHERE exception_group_id IS NOT NULL
         AND exception_date BETWEEN $1::date AND $2::date`,
      [date, nextDate(date)],
    )
    expect(stored.rows[0].count).toBe(0)
  })

  it('lets a range holding the exclusive lock commit before rejecting a waiting booking', async () => {
    const { slots } = await createBlock(doctorId, 13 * 24 * 60)
    const date = await slotDate(slots[0])
    const rangeControl = instrumentedProvider({
      pauseAfter: sql => sql.includes('INSERT INTO availability_exceptions'),
    })
    const bookingControl = instrumentedProvider({
      signalBefore: sql => sql.includes('pg_advisory_xact_lock_shared'),
    })
    const rangeRepository = createAvailabilityRepository(rangeControl.provider)
    const bookingRepository = createAppointmentRepository(bookingControl.provider)

    const range = rangeRepository.createExceptionRange({
      doctorId, startDate: date, endDate: nextDate(date),
    }, new Date())
    await rangeControl.paused
    const booking = bookingRepository.book({
      patientId: Number(patientId), patientName: 'Concurrency Patient', slotId: Number(slots[0]),
    })
    await bookingControl.attempted
    rangeControl.release()

    await expect(range).resolves.toMatchObject({ startDate: date, endDate: nextDate(date) })
    await expect(booking).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' })
    const appointments = await query(
      'SELECT COUNT(*)::int AS count FROM appointments WHERE slot_id = $1',
      [slots[0]],
    )
    expect(appointments.rows[0].count).toBe(0)
  })

  it('protects a target slot when rescheduling waits behind an exclusive range lock', async () => {
    const original = await createBlock(doctorId, 16 * 24 * 60)
    const target = await createBlock(doctorId, 17 * 24 * 60)
    const appointment = await appointmentRepository.book({
      patientId: Number(patientId),
      patientName: 'Concurrency Patient',
      slotId: Number(original.slots[0]),
    })
    const targetDate = await slotDate(target.slots[0])
    const rangeControl = instrumentedProvider({
      pauseAfter: sql => sql.includes('INSERT INTO availability_exceptions'),
    })
    const rescheduleControl = instrumentedProvider({
      signalBefore: sql => sql.includes('pg_advisory_xact_lock_shared'),
    })
    const rangeRepository = createAvailabilityRepository(rangeControl.provider)
    const rescheduleRepository = createAppointmentRepository(rescheduleControl.provider)

    const range = rangeRepository.createExceptionRange({
      doctorId, startDate: targetDate, endDate: nextDate(targetDate),
    }, new Date())
    await rangeControl.paused
    const reschedule = rescheduleRepository.reschedule({
      appointmentId: Number(appointment.id),
      patientId: Number(patientId),
      slotId: Number(target.slots[0]),
      now: new Date(),
    })
    await rescheduleControl.attempted
    rangeControl.release()

    await expect(range).resolves.toMatchObject({ startDate: targetDate })
    await expect(reschedule).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' })
    const originalState = await query('SELECT status FROM appointments WHERE id = $1', [appointment.id])
    expect(originalState.rows[0].status).toBe('booked')
  })
})
