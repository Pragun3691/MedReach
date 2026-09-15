import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAppointmentRepository } from '../src/data-access/appointment.repository.js'
import { createAvailabilityRepository } from '../src/data-access/availability.repository.js'

const { Pool } = pg
const describeWithPostgres = process.env.DATABASE_URL ? describe : describe.skip

describeWithPostgres('availability PostgreSQL concurrency', () => {
  let pool
  let appointmentRepository
  let availabilityRepository
  let patientId
  let doctorId
  let reviewerId
  const blockIds = []
  const suffix = randomUUID()

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
    const blockResult = await pool.query(
      `INSERT INTO availability_blocks (doctor_id, start_at, end_at)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [doctor, startAt, endAt],
    )
    const blockId = blockResult.rows[0].id
    blockIds.push(blockId)

    const slots = []
    for (let index = 0; index < slotCount; index += 1) {
      const slotStart = new Date(startAt.getTime() + index * 30 * 60 * 1000)
      const slotResult = await pool.query(
        `INSERT INTO slots (availability_block_id, start_at, end_at)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [blockId, slotStart, new Date(slotStart.getTime() + 30 * 60 * 1000)],
      )
      slots.push(slotResult.rows[0].id)
    }

    return { blockId, slots }
  }

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
      statement_timeout: 5000,
    })
    appointmentRepository = createAppointmentRepository(() => pool)
    availabilityRepository = createAvailabilityRepository(() => pool)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
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
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })

  afterAll(async () => {
    if (!pool) return

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `DELETE FROM notifications
         WHERE recipient_user_id = ANY($1::bigint[])`,
        [[reviewerId, doctorId, patientId].filter(Boolean)],
      )
      await client.query(
        'DELETE FROM appointments WHERE rescheduled_from_appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)',
        [patientId],
      )
      await client.query('DELETE FROM appointments WHERE patient_id = $1', [patientId])
      await client.query('DELETE FROM slots WHERE availability_block_id = ANY($1::bigint[])', [blockIds])
      await client.query('DELETE FROM availability_blocks WHERE id = ANY($1::bigint[])', [blockIds])
      await client.query('DELETE FROM doctor_verifications WHERE doctor_id = $1', [doctorId])
      await client.query('DELETE FROM doctor_profiles WHERE user_id = $1', [doctorId])
      await client.query('DELETE FROM patient_profiles WHERE user_id = $1', [patientId])
      await client.query('DELETE FROM users WHERE id = ANY($1::bigint[])', [
        [reviewerId, doctorId, patientId].filter(Boolean),
      ])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
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
    const state = await pool.query(
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
    const appointments = await pool.query(
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
})
