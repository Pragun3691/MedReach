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
import {
  down as downAvailabilityExceptions,
  up as upAvailabilityExceptions,
} from '../migrations/1790200000000_add-availability-exceptions.js'

const { Pool } = pg

function migrationSql(migration) {
  const pgm = new MigrationBuilder({
    query: () => { throw new Error('Migration generation must not query the database') },
    select: () => { throw new Error('Migration generation must not query the database') },
  }, undefined, false, console)
  migration(pgm)
  return pgm.getSql()
}

describe('availability exception migration SQL', () => {
  it('creates only the deny-overlay table, constraints and partial indexes', () => {
    const sql = migrationSql(upAvailabilityExceptions)

    expect(sql).toContain('CREATE TABLE "availability_exceptions"')
    expect(sql).toContain('REFERENCES doctor_profiles(user_id) ON DELETE RESTRICT')
    expect(sql).toContain('availability_exceptions_shape_valid')
    expect(sql).toContain('availability_exceptions_half_hour_aligned')
    expect(sql).toContain('availability_exceptions_active_doctor_date_idx')
    expect(sql).toContain('availability_exceptions_active_all_day_unique')
    expect(sql).toContain('availability_exceptions_active_partial_unique')
    expect(sql).toContain('WHERE removed_at IS NULL')
    expect(sql).not.toContain('UPDATE "slots"')
    expect(sql).not.toContain('DELETE FROM')
  })

  it('drops only the exception table on reversal', () => {
    expect(migrationSql(downAvailabilityExceptions)).toContain(
      'DROP TABLE "availability_exceptions"',
    )
  })
})

const describeWithPostgres = process.env.DATABASE_URL ? describe : describe.skip

describeWithPostgres('availability exception migration PostgreSQL constraints', () => {
  let pool
  let client
  let schema
  let doctorId
  let existingBlockId
  let existingSlotId
  let existingAppointmentId

  async function insertException(overrides = {}) {
    const exception = {
      date: '2026-10-01',
      allDay: false,
      startTime: '09:00',
      endTime: '10:00',
      doctorId,
      ...overrides,
    }
    return client.query(
      `INSERT INTO availability_exceptions (
         doctor_id, exception_date, all_day, start_time, end_time
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        exception.doctorId,
        exception.date,
        exception.allDay,
        exception.startTime,
        exception.endTime,
      ],
    )
  }

  beforeAll(async () => {
    pool = new Pool({
      ...createDatabaseConfig(process.env),
      statement_timeout: 5000,
    })
    client = await pool.connect()
    schema = `availability_exception_migration_${randomUUID().replaceAll('-', '')}`
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
    ]) {
      await client.query(migrationSql(migration))
    }

    const doctor = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ('Exception Doctor', $1, 'test-only', 'doctor') RETURNING id`,
      [`exception-doctor-${randomUUID()}@example.test`],
    )
    doctorId = doctor.rows[0].id
    await client.query(
      `INSERT INTO doctor_profiles (user_id, qualification) VALUES ($1, 'MBBS')`,
      [doctorId],
    )
    const patient = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ('Exception Patient', $1, 'test-only', 'patient') RETURNING id`,
      [`exception-patient-${randomUUID()}@example.test`],
    )
    await client.query('INSERT INTO patient_profiles (user_id) VALUES ($1)', [patient.rows[0].id])
    const block = await client.query(
      `INSERT INTO availability_blocks (doctor_id, start_at, end_at)
       VALUES ($1, '2026-10-01T09:00:00+05:30', '2026-10-01T10:00:00+05:30')
       RETURNING id`,
      [doctorId],
    )
    existingBlockId = block.rows[0].id
    const slot = await client.query(
      `INSERT INTO slots (availability_block_id, start_at, end_at)
       VALUES ($1, '2026-10-01T09:00:00+05:30', '2026-10-01T09:30:00+05:30')
       RETURNING id`,
      [existingBlockId],
    )
    existingSlotId = slot.rows[0].id
    const appointment = await client.query(
      `INSERT INTO appointments (patient_id, slot_id) VALUES ($1, $2) RETURNING id`,
      [patient.rows[0].id, existingSlotId],
    )
    existingAppointmentId = appointment.rows[0].id
    await client.query(migrationSql(upAvailabilityExceptions))
  })

  afterAll(async () => {
    if (!client) return
    try {
      await client.query('RESET search_path')
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally {
      client.release()
      await pool.end()
    }
  })

  it('applies after the full schema without changing availability or appointments', async () => {
    const result = await client.query(
      `SELECT
         EXISTS (SELECT 1 FROM availability_blocks WHERE id = $1) AS block_exists,
         EXISTS (SELECT 1 FROM slots WHERE id = $2 AND is_active = TRUE) AS slot_exists,
         EXISTS (SELECT 1 FROM appointments WHERE id = $3 AND status = 'booked') AS appointment_exists`,
      [existingBlockId, existingSlotId, existingAppointmentId],
    )
    expect(result.rows[0]).toEqual({
      appointment_exists: true,
      block_exists: true,
      slot_exists: true,
    })
  })

  it('accepts valid all-day and partial exceptions on :00 and :30 boundaries', async () => {
    await insertException({ date: '2026-10-02', allDay: true, startTime: null, endTime: null })
    await insertException({ date: '2026-10-03', startTime: '09:00', endTime: '10:00' })
    await insertException({ date: '2026-10-04', startTime: '09:30', endTime: '10:30' })

    const result = await client.query(
      `SELECT COUNT(*)::int AS count FROM availability_exceptions
       WHERE exception_date BETWEEN '2026-10-02' AND '2026-10-04'`,
    )
    expect(result.rows[0].count).toBe(3)
  })

  it('rejects invalid minutes and fractional seconds', async () => {
    await expect(insertException({ date: '2026-10-05', startTime: '09:15' }))
      .rejects.toMatchObject({ code: '23514' })
    await expect(insertException({ date: '2026-10-05', startTime: '09:00:00.500' }))
      .rejects.toMatchObject({ code: '23514' })
  })

  it.each([
    [{ startTime: '10:00', endTime: '10:00' }, 'equal'],
    [{ startTime: '10:30', endTime: '10:00' }, 'overnight'],
  ])('rejects a %s partial range', async overrides => {
    await expect(insertException({ date: '2026-10-06', ...overrides }))
      .rejects.toMatchObject({ code: '23514' })
  })

  it.each([
    [{ allDay: true, startTime: '09:00', endTime: '10:00' }, 'all-day with times'],
    [{ allDay: false, startTime: null, endTime: null }, 'partial without times'],
    [{ allDay: false, startTime: '09:00', endTime: null }, 'partial without end'],
  ])('rejects malformed shape: %s', async overrides => {
    await expect(insertException({ date: '2026-10-07', ...overrides }))
      .rejects.toMatchObject({ code: '23514' })
  })

  it('rejects duplicate active all-day and exact partial exceptions', async () => {
    await insertException({ date: '2026-10-08', allDay: true, startTime: null, endTime: null })
    await expect(insertException({
      date: '2026-10-08',
      allDay: true,
      startTime: null,
      endTime: null,
    })).rejects.toMatchObject({ code: '23505' })

    await insertException({ date: '2026-10-09' })
    await expect(insertException({ date: '2026-10-09' }))
      .rejects.toMatchObject({ code: '23505' })
  })

  it('allows the same exception after soft removal', async () => {
    const first = await insertException({ date: '2026-10-10' })
    await client.query(
      'UPDATE availability_exceptions SET removed_at = current_timestamp WHERE id = $1',
      [first.rows[0].id],
    )
    await expect(insertException({ date: '2026-10-10' })).resolves.toMatchObject({ rowCount: 1 })
  })

  it('enforces Doctor ownership integrity', async () => {
    await expect(insertException({ doctorId: 999999, date: '2026-10-11' }))
      .rejects.toMatchObject({ code: '23503' })
  })

  it('reverses without changing existing availability or appointment data', async () => {
    await client.query(migrationSql(downAvailabilityExceptions))
    const result = await client.query(
      `SELECT
         to_regclass($4) AS exception_table,
         EXISTS (SELECT 1 FROM availability_blocks WHERE id = $1) AS block_exists,
         EXISTS (SELECT 1 FROM slots WHERE id = $2 AND is_active = TRUE) AS slot_exists,
         EXISTS (SELECT 1 FROM appointments WHERE id = $3 AND status = 'booked') AS appointment_exists`,
      [existingBlockId, existingSlotId, existingAppointmentId, `${schema}.availability_exceptions`],
    )
    expect(result.rows[0]).toEqual({
      appointment_exists: true,
      block_exists: true,
      exception_table: null,
      slot_exists: true,
    })
  })
})
