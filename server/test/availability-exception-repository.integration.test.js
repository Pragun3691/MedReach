import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { createDatabaseConfig } from '../src/config/database.js'
import { MigrationBuilder } from 'node-pg-migrate'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { up as upPublicDiscovery } from '../migrations/1788175200000_create-public-discovery-schema.js'
import { up as upAuthentication } from '../migrations/1788175300000_create-authentication-schema.js'
import { up as upAppointmentBooking } from '../migrations/1788175400000_create-appointment-booking-schema.js'
import { up as upConsultationLifecycle } from '../migrations/1788775500000_create-consultation-lifecycle.js'
import { up as upClinicalWorkspace } from '../migrations/1789375600000_add-consultation-clinical-workspace.js'
import { up as upSearchAliases } from '../migrations/1790000000000_add_search_aliases.js'
import { up as upRecurringAvailability } from '../migrations/1790100000000_add-recurring-availability-rules.js'
import { up as upAvailabilityExceptions } from '../migrations/1790200000000_add-availability-exceptions.js'
import { up as upAvailabilityExceptionGroups } from '../migrations/1790300000000_add-availability-exception-groups.js'
import {
  activeAvailabilityExceptionExistsSql,
} from '../src/data-access/availability-exception-predicate.js'
import {
  AvailabilityDataError,
  createAvailabilityRepository,
} from '../src/data-access/availability.repository.js'
import { createPublicDoctorRepository } from '../src/data-access/public-doctor.repository.js'

const { Pool } = pg
const now = new Date('2026-09-18T09:40:00.000Z') // 15:10 in Asia/Kolkata

function migrationSql(migration) {
  const pgm = new MigrationBuilder({
    query: () => { throw new Error('Migration generation must not query the database') },
    select: () => { throw new Error('Migration generation must not query the database') },
  }, undefined, false, console)
  migration(pgm)
  return pgm.getSql()
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim()
}

describe('active availability exception predicate', () => {
  it('uses Doctor scope, active rows, India-local date and half-open interval overlap', () => {
    const sql = activeAvailabilityExceptionExistsSql({
      doctorId: 'block.doctor_id',
      startAt: 'slot.start_at',
      endAt: 'slot.end_at',
    })

    expect(sql).toContain('availability_exception.doctor_id = block.doctor_id')
    expect(sql).toContain('availability_exception.removed_at IS NULL')
    expect(sql).toContain("slot.start_at AT TIME ZONE 'Asia/Kolkata'")
    expect(sql).toContain('availability_exception.all_day = TRUE')
    expect(sql).toContain('availability_exception.start_time')
    expect(sql).toContain('availability_exception.end_time')
  })

  it('allows parameter placeholders and rejects unsafe SQL composition', () => {
    expect(() => activeAvailabilityExceptionExistsSql({
      doctorId: '$1',
      startAt: '$2',
      endAt: '$3',
    })).not.toThrow()
    expect(() => activeAvailabilityExceptionExistsSql({
      doctorId: 'block.doctor_id; DELETE FROM slots',
      startAt: '$2',
      endAt: '$3',
    })).toThrow(TypeError)
  })
})

const describeWithPostgres = process.env.DATABASE_URL ? describe : describe.skip

describeWithPostgres('availability exception repository PostgreSQL integration', () => {
  let pool
  let schema
  let provider
  let repository
  let publicRepository
  let reviewerId
  let doctorId
  let otherDoctorId
  let disabledDoctorId
  let pendingDoctorId
  let patientId

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

  async function insertDoctor(label, { enabled = true, verification = 'approved' } = {}) {
    const user = await query(
      `INSERT INTO users (full_name, email, password_hash, role, is_enabled)
       VALUES ($1, $2, 'test-only', 'doctor', $3) RETURNING id`,
      [`Exception ${label}`, `exception-${label}-${randomUUID()}@example.test`, enabled],
    )
    const id = Number(user.rows[0].id)
    await query(
      `INSERT INTO doctor_profiles (user_id, qualification) VALUES ($1, 'MBBS')`,
      [id],
    )
    await query(
      `INSERT INTO doctor_verifications (
         doctor_id, registration_number, issuing_authority, status,
         reviewed_by_user_id, reviewed_at
       ) VALUES ($1, $2, 'Exception Test Authority', $3, $4, $5)`,
      [
        id,
        `exception-${randomUUID()}`,
        verification,
        verification === 'pending' ? null : reviewerId,
        verification === 'pending' ? null : now,
      ],
    )
    return id
  }

  function partial(overrides = {}) {
    return {
      doctorId,
      date: '2026-09-29',
      allDay: false,
      startTime: '04:00',
      endTime: '05:00',
      ...overrides,
    }
  }

  function allDay(overrides = {}) {
    return {
      doctorId,
      date: '2026-09-29',
      allDay: true,
      ...overrides,
    }
  }

  function range(overrides = {}) {
    return {
      doctorId,
      startDate: '2026-09-29',
      endDate: '2026-10-03',
      ...overrides,
    }
  }

  async function insertSlot({
    ownerId = doctorId,
    date = '2026-09-29',
    startTime = '04:30',
    endTime = '05:00',
    active = true,
  } = {}) {
    const block = await query(
      `INSERT INTO availability_blocks (doctor_id, start_at, end_at)
       VALUES (
         $1,
         ($2::date + $3::time) AT TIME ZONE 'Asia/Kolkata',
         ($2::date + $4::time) AT TIME ZONE 'Asia/Kolkata'
       ) RETURNING id`,
      [ownerId, date, startTime, endTime],
    )
    const slot = await query(
      `INSERT INTO slots (availability_block_id, start_at, end_at, is_active)
       VALUES (
         $1,
         ($2::date + $3::time) AT TIME ZONE 'Asia/Kolkata',
         ($2::date + $4::time) AT TIME ZONE 'Asia/Kolkata',
         $5
       ) RETURNING id, start_at, end_at`,
      [block.rows[0].id, date, startTime, endTime, active],
    )
    return slot.rows[0]
  }

  async function insertAppointment(slotId, status = 'booked') {
    const cancellationColumns = status === 'cancelled'
      ? ', cancelled_by_user_id, cancelled_at'
      : ''
    const cancellationValues = status === 'cancelled' ? ', $4, $5' : ''
    const values = status === 'cancelled'
      ? [patientId, slotId, status, patientId, now]
      : [patientId, slotId, status]
    return query(
      `INSERT INTO appointments (
         patient_id, slot_id, status${cancellationColumns}
       ) VALUES ($1, $2, $3${cancellationValues}) RETURNING id`,
      values,
    )
  }

  beforeAll(async () => {
    pool = new Pool({
      ...createDatabaseConfig(process.env),
      statement_timeout: 5000,
    })
    schema = `availability_exception_repository_${randomUUID().replaceAll('-', '')}`
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
      const reviewer = await client.query(
        `INSERT INTO users (full_name, email, password_hash, role)
         VALUES ('Exception Reviewer', $1, 'test-only', 'admin') RETURNING id`,
        [`exception-reviewer-${randomUUID()}@example.test`],
      )
      reviewerId = reviewer.rows[0].id
    } finally {
      client.release()
    }

    provider = () => ({ connect: schemaClient })
    repository = createAvailabilityRepository(provider)
    publicRepository = createPublicDoctorRepository(() => ({ query }))
    doctorId = await insertDoctor('approved')
    otherDoctorId = await insertDoctor('other')
    disabledDoctorId = await insertDoctor('disabled', { enabled: false })
    pendingDoctorId = await insertDoctor('pending', { verification: 'pending' })
    const patient = await query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ('Exception Patient', $1, 'test-only', 'patient') RETURNING id`,
      [`exception-patient-${randomUUID()}@example.test`],
    )
    patientId = Number(patient.rows[0].id)
    await query('INSERT INTO patient_profiles (user_id) VALUES ($1)', [patientId])
  })

  beforeEach(async () => {
    await query('DELETE FROM appointments')
    await query('DELETE FROM slots')
    await query('DELETE FROM availability_blocks')
    await query('DELETE FROM availability_exceptions')
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

  it('creates and normalizes future all-day and partial exceptions', async () => {
    const day = await repository.createException(allDay(), now)
    const interval = await repository.createException(partial({ date: '2026-09-30' }), now)

    expect(day).toMatchObject({
      doctorId,
      date: '2026-09-29',
      allDay: true,
      startTime: null,
      endTime: null,
    })
    expect(interval).toMatchObject({
      date: '2026-09-30',
      allDay: false,
      startTime: '04:00',
      endTime: '05:00',
    })
    expect(day.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('accepts today all-day and a partial interval with future time remaining', async () => {
    await expect(repository.createException(allDay({ date: '2026-09-18' }), now))
      .resolves.toMatchObject({ date: '2026-09-18', allDay: true })
    await query('DELETE FROM availability_exceptions')
    await expect(repository.createException(partial({
      date: '2026-09-18',
      startTime: '14:00',
      endTime: '17:00',
    }), now)).resolves.toMatchObject({ startTime: '14:00', endTime: '17:00' })
  })

  it('rejects a past date and a today interval ending at or before now', async () => {
    await expect(repository.createException(allDay({ date: '2026-09-17' }), now))
      .rejects.toMatchObject({ code: 'AVAILABILITY_EXCEPTION_IN_PAST' })
    await expect(repository.createException(partial({
      date: '2026-09-18',
      startTime: '14:00',
      endTime: '15:00',
    }), now)).rejects.toMatchObject({ code: 'AVAILABILITY_EXCEPTION_IN_PAST' })
  })

  it.each([
    ['disabled', () => disabledDoctorId, 'ACCOUNT_DISABLED'],
    ['unapproved', () => pendingDoctorId, 'DOCTOR_NOT_APPROVED'],
  ])('requires an enabled, approved Doctor: %s', async (_label, id, code) => {
    await expect(repository.createException(partial({ doctorId: id() }), now))
      .rejects.toMatchObject({ code })
  })

  it('enforces all-day and partial overlap in both directions', async () => {
    await repository.createException(allDay(), now)
    await expect(repository.createException(partial(), now))
      .rejects.toMatchObject({ code: 'AVAILABILITY_EXCEPTION_OVERLAP' })

    await query('DELETE FROM availability_exceptions')
    await repository.createException(partial(), now)
    await expect(repository.createException(allDay(), now))
      .rejects.toMatchObject({ code: 'AVAILABILITY_EXCEPTION_OVERLAP' })
  })

  it('rejects overlapping partials but allows touching intervals', async () => {
    await repository.createException(partial(), now)
    await expect(repository.createException(partial({
      startTime: '04:30',
      endTime: '05:30',
    }), now)).rejects.toMatchObject({ code: 'AVAILABILITY_EXCEPTION_OVERLAP' })
    await expect(repository.createException(partial({
      startTime: '05:00',
      endTime: '06:00',
    }), now)).resolves.toMatchObject({ startTime: '05:00' })
  })

  it('ignores removed exceptions and scopes overlap by Doctor and date', async () => {
    const created = await repository.createException(partial(), now)
    await repository.removeException({ doctorId, exceptionId: created.id }, now)
    await expect(repository.createException(partial(), now)).resolves.toBeDefined()
    await expect(repository.createException(partial({ doctorId: otherDoctorId }), now))
      .resolves.toBeDefined()
    await expect(repository.createException(partial({ date: '2026-09-30' }), now))
      .resolves.toBeDefined()
  })

  it('rejects overlapping one-off availability atomically but allows touching ranges', async () => {
    await repository.createException(partial(), now)
    const before = await query('SELECT COUNT(*)::int AS count FROM availability_blocks')

    await expect(repository.create({
      doctorId,
      startAt: new Date('2026-09-28T23:00:00.000Z'),
      endAt: new Date('2026-09-29T00:30:00.000Z'),
      fee: null,
    })).rejects.toMatchObject({ code: 'AVAILABILITY_EXCEPTION_CONFLICT' })
    expect((await query('SELECT COUNT(*)::int AS count FROM availability_blocks')).rows[0])
      .toEqual(before.rows[0])

    await expect(repository.create({
      doctorId,
      startAt: new Date('2026-09-28T23:30:00.000Z'),
      endAt: new Date('2026-09-29T00:30:00.000Z'),
      fee: null,
    })).resolves.toBeDefined()
  })

  it('rejects every one-off range on an all-day exception date', async () => {
    await repository.createException(allDay(), now)

    await expect(repository.create({
      doctorId,
      startAt: new Date('2026-09-29T12:30:00.000Z'),
      endAt: new Date('2026-09-29T13:30:00.000Z'),
      fee: null,
    })).rejects.toMatchObject({ code: 'AVAILABILITY_EXCEPTION_CONFLICT' })
    expect((await query('SELECT COUNT(*)::int AS count FROM availability_blocks')).rows[0].count)
      .toBe(0)
  })

  it('rejects a booked partial conflict with non-PHI conflict details', async () => {
    const slot = await insertSlot()
    await insertAppointment(slot.id)

    let error
    try {
      await repository.createException(partial(), now)
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(AvailabilityDataError)
    expect(error).toMatchObject({
      code: 'AVAILABILITY_EXCEPTION_BOOKED_CONFLICT',
      details: {
        conflictCount: 1,
        conflicts: [{
          startAt: '2026-09-28T23:00:00.000Z',
          endAt: '2026-09-28T23:30:00.000Z',
        }],
      },
    })
    expect(Object.keys(error.details.conflicts[0]).sort()).toEqual(['endAt', 'startAt'])
    expect(JSON.stringify(error.details).toLowerCase()).not.toContain('patient')
  })

  it('rejects all-day creation when any booked appointment exists that India date', async () => {
    const slot = await insertSlot({ startTime: '23:30', endTime: '24:00' })
    await insertAppointment(slot.id)

    await expect(repository.createException(allDay(), now))
      .rejects.toMatchObject({ code: 'AVAILABILITY_EXCEPTION_BOOKED_CONFLICT' })
  })

  it.each(['cancelled', 'completed', 'no_show', 'rescheduled'])(
    'does not let %s appointment history block creation',
    async status => {
      const slot = await insertSlot()
      await insertAppointment(slot.id, status)

      await expect(repository.createException(partial(), now)).resolves.toBeDefined()
    },
  )

  it('soft-removes an owned row, retains it, and is idempotent for its owner', async () => {
    const created = await repository.createException(partial(), now)
    const first = await repository.removeException({ doctorId, exceptionId: created.id }, now)
    const second = await repository.removeException({ doctorId, exceptionId: created.id }, now)
    const stored = await query(
      'SELECT removed_at IS NOT NULL AS removed FROM availability_exceptions WHERE id = $1',
      [created.id],
    )

    expect(first).toMatchObject({ removed: true, exception: { id: created.id } })
    expect(second).toMatchObject({ removed: false, exception: { id: created.id } })
    expect(stored.rows).toEqual([{ removed: true }])
  })

  it('returns safe not-found when another Doctor tries to remove an exception', async () => {
    const created = await repository.createException(partial(), now)

    await expect(repository.removeException({
      doctorId: otherDoctorId,
      exceptionId: created.id,
    }, now)).rejects.toMatchObject({ code: 'AVAILABILITY_EXCEPTION_NOT_FOUND' })
    const stored = await query(
      'SELECT removed_at FROM availability_exceptions WHERE id = $1',
      [created.id],
    )
    expect(stored.rows[0].removed_at).toBeNull()
  })

  it('lists only owned active current/future exceptions with normalized values', async () => {
    const own = await repository.createException(partial(), now)
    const removed = await repository.createException(partial({ date: '2026-09-30' }), now)
    await repository.removeException({ doctorId, exceptionId: removed.id }, now)
    await repository.createException(partial({ doctorId: otherDoctorId }), now)
    await query(
      `INSERT INTO availability_exceptions (
         doctor_id, exception_date, all_day, start_time, end_time
       ) VALUES ($1, '2026-09-17', TRUE, NULL, NULL)`,
      [doctorId],
    )

    const listed = await repository.listExceptions({ doctorId }, now)

    expect(listed).toEqual([own])
    expect(listed[0]).toMatchObject({ date: '2026-09-29', startTime: '04:00', endTime: '05:00' })
  })

  it('marks an underlying active Doctor slot as exception-blocked without mutating it', async () => {
    const slot = await insertSlot()
    await repository.createException(partial(), now)

    const readRepository = createAvailabilityRepository(() => ({ query }))
    const rows = await readRepository.listForDoctor(doctorId, now)
    const listed = rows.find(row => Number(row.slot_id) === Number(slot.id))

    expect(listed).toMatchObject({
      slot_is_active: true,
      slot_is_booked: false,
      slot_is_exception_blocked: true,
    })
    expect((await query('SELECT is_active FROM slots WHERE id = $1', [slot.id])).rows[0])
      .toEqual({ is_active: true })
  })

  it('acquires the established exclusive Doctor lock before overlap and booked checks', async () => {
    const statements = []
    const recordingRepository = createAvailabilityRepository(() => ({
      async connect() {
        const client = await schemaClient()
        return {
          query(sql, values) {
            statements.push(normalizeSql(sql))
            return client.query(sql, values)
          },
          release: () => client.release(),
        }
      },
    }))

    const created = await recordingRepository.createException(partial(), now)
    await recordingRepository.removeException({ doctorId, exceptionId: created.id }, now)
    const lock = statements.findIndex(sql => sql.includes('pg_advisory_xact_lock('))
    const overlap = statements.findIndex(sql => sql.includes('FROM availability_exceptions existing_exception'))
    const booked = statements.findIndex(sql => sql.includes('FROM appointments appointment'))

    expect(statements[lock]).toContain("'medreach:doctor-availability:' || $1::text")
    expect(lock).toBeGreaterThanOrEqual(0)
    expect(lock).toBeLessThan(overlap)
    expect(lock).toBeLessThan(booked)
    expect(statements.some(sql => /^(UPDATE|DELETE FROM) slots\b/.test(sql))).toBe(false)
    expect(statements.some(sql => /^(UPDATE|DELETE FROM) appointments\b/.test(sql))).toBe(false)
    expect(statements.some(sql => /^DELETE FROM availability_blocks\b/.test(sql))).toBe(false)
  })

  it('never mutates slots, blocks or appointments when creating and removing', async () => {
    const slot = await insertSlot({ active: false })
    const before = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM availability_blocks) AS blocks,
         (SELECT COUNT(*)::int FROM slots) AS slots,
         (SELECT COUNT(*)::int FROM appointments) AS appointments,
         (SELECT is_active FROM slots WHERE id = $1) AS active`,
      [slot.id],
    )
    const created = await repository.createException(partial(), now)
    await repository.removeException({ doctorId, exceptionId: created.id }, now)
    const after = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM availability_blocks) AS blocks,
         (SELECT COUNT(*)::int FROM slots) AS slots,
         (SELECT COUNT(*)::int FROM appointments) AS appointments,
         (SELECT is_active FROM slots WHERE id = $1) AS active`,
      [slot.id],
    )

    expect(before.rows[0].active).toBe(false)
    expect(after.rows[0]).toEqual(before.rows[0])
  })

  it('rolls back an exception insert failure without touching scheduling data', async () => {
    const slot = await insertSlot()
    await query(`
      CREATE FUNCTION fail_exception_insert() RETURNS trigger AS $failure$
      BEGIN
        RAISE EXCEPTION 'simulated exception insert failure';
      END
      $failure$ LANGUAGE plpgsql
    `)
    await query(`
      CREATE TRIGGER fail_exception_insert
      BEFORE INSERT ON availability_exceptions
      FOR EACH ROW EXECUTE FUNCTION fail_exception_insert()
    `)

    try {
      await expect(repository.createException(partial(), now))
        .rejects.toThrow('simulated exception insert failure')
      const state = await query(
        `SELECT
           (SELECT COUNT(*)::int FROM availability_exceptions) AS exceptions,
           (SELECT is_active FROM slots WHERE id = $1) AS active`,
        [slot.id],
      )
      expect(state.rows[0]).toEqual({ active: true, exceptions: 0 })
    } finally {
      await query('DROP TRIGGER fail_exception_insert ON availability_exceptions')
      await query('DROP FUNCTION fail_exception_insert()')
    }
  })

  it('rolls back a soft-removal failure and leaves the overlay active', async () => {
    const created = await repository.createException(partial(), now)
    await query(`
      CREATE FUNCTION fail_exception_removal() RETURNS trigger AS $failure$
      BEGIN
        IF NEW.removed_at IS NOT NULL THEN
          RAISE EXCEPTION 'simulated exception removal failure';
        END IF;
        RETURN NEW;
      END
      $failure$ LANGUAGE plpgsql
    `)
    await query(`
      CREATE TRIGGER fail_exception_removal
      BEFORE UPDATE ON availability_exceptions
      FOR EACH ROW EXECUTE FUNCTION fail_exception_removal()
    `)

    try {
      await expect(repository.removeException({ doctorId, exceptionId: created.id }, now))
        .rejects.toThrow('simulated exception removal failure')
      const stored = await query(
        'SELECT removed_at FROM availability_exceptions WHERE id = $1',
        [created.id],
      )
      expect(stored.rows[0].removed_at).toBeNull()
    } finally {
      await query('DROP TRIGGER fail_exception_removal ON availability_exceptions')
      await query('DROP FUNCTION fail_exception_removal()')
    }
  })

  it('the reusable predicate matches India-local date, interval, all-day and removed state', async () => {
    const covered = await insertSlot()
    const outside = await insertSlot({ startTime: '05:00', endTime: '05:30' })
    const predicate = activeAvailabilityExceptionExistsSql({
      doctorId: 'block.doctor_id',
      startAt: 'slot.start_at',
      endAt: 'slot.end_at',
    })
    const selectCoverage = () => query(
      `SELECT slot.id, ${predicate} AS covered
       FROM slots slot
       JOIN availability_blocks block ON block.id = slot.availability_block_id
       ORDER BY slot.id`,
    )

    const created = await repository.createException(partial(), now)
    let rows = (await selectCoverage()).rows
    expect(rows).toEqual([
      { id: covered.id, covered: true },
      { id: outside.id, covered: false },
    ])

    await repository.removeException({ doctorId, exceptionId: created.id }, now)
    rows = (await selectCoverage()).rows
    expect(rows.every(row => row.covered === false)).toBe(true)

    await repository.createException(allDay(), now)
    rows = (await selectCoverage()).rows
    expect(rows.every(row => row.covered === true)).toBe(true)
  })

  it('suppresses exception slots from next availability, date search and public slot listing', async () => {
    const date = '2026-11-29'
    const first = await insertSlot({ date, startTime: '04:00', endTime: '04:30' })
    const second = await insertSlot({ date, startTime: '04:30', endTime: '05:00' })
    const visible = await insertSlot({ date, startTime: '05:00', endTime: '05:30' })
    await repository.createException(partial({ date }), now)

    const profile = await publicRepository.findById(doctorId)
    const slots = await publicRepository.findSlotsByDate(doctorId, date)
    const dated = await publicRepository.search({ date, limit: 20, offset: 0 })

    expect(Number(profile.next_available_at)).toBe(Number(new Date(visible.start_at)))
    expect(slots.map(slot => Number(slot.id))).toEqual([Number(visible.id)])
    expect(slots.map(slot => Number(slot.id))).not.toContain(Number(first.id))
    expect(slots.map(slot => Number(slot.id))).not.toContain(Number(second.id))
    expect(dated.rows.map(row => Number(row.id))).toContain(doctorId)

    await repository.createException(partial({ date, startTime: '05:00', endTime: '05:30' }), now)
    const fullySuppressed = await publicRepository.search({
      date,
      limit: 20,
      offset: 0,
    })
    expect(fullySuppressed.rows.map(row => Number(row.id))).not.toContain(doctorId)
  })

  it('matches exception dates at both Asia/Kolkata day boundaries', async () => {
    const date = '2026-11-29'
    const midnight = await insertSlot({ date, startTime: '00:00', endTime: '00:30' })
    await repository.createException(partial({ date, startTime: '00:00', endTime: '00:30' }), now)
    expect(new Date(midnight.start_at).toISOString()).toBe('2026-11-28T18:30:00.000Z')
    expect(await publicRepository.findSlotsByDate(doctorId, date)).toEqual([])

    await query('DELETE FROM availability_exceptions')
    await query('DELETE FROM slots')
    await query('DELETE FROM availability_blocks')
    const late = await insertSlot({ date, startTime: '23:30', endTime: '24:00' })
    await repository.createException(allDay({ date }), now)
    expect(new Date(late.start_at).toISOString()).toBe('2026-11-29T18:00:00.000Z')
    expect(await publicRepository.findSlotsByDate(doctorId, date)).toEqual([])
  })

  it('restores only otherwise-bookable slots when exceptions are removed', async () => {
    const date = '2026-11-29'
    const active = await insertSlot({ date, startTime: '04:00', endTime: '04:30' })
    const inactive = await insertSlot({ date, startTime: '04:30', endTime: '05:00', active: false })
    const booked = await insertSlot({ date, startTime: '05:00', endTime: '05:30' })
    const exception = await repository.createException(allDay({ date }), now)
    await insertAppointment(booked.id)

    expect(await publicRepository.findSlotsByDate(doctorId, date)).toEqual([])
    await repository.removeException({ doctorId, exceptionId: exception.id }, now)
    const restored = await publicRepository.findSlotsByDate(doctorId, date)
    expect(restored.map(slot => Number(slot.id))).toEqual([Number(active.id)])
    expect(restored.map(slot => Number(slot.id))).not.toContain(Number(inactive.id))
    expect(restored.map(slot => Number(slot.id))).not.toContain(Number(booked.id))
  })

  it('keeps a slot suppressed while another overlapping active exception remains', async () => {
    const date = '2026-11-29'
    const slot = await insertSlot({ date, startTime: '04:30', endTime: '05:00' })
    const first = await repository.createException(partial({ date }), now)
    await query(
      `INSERT INTO availability_exceptions (
         doctor_id, exception_date, all_day, start_time, end_time
       ) VALUES ($1, $2, FALSE, '04:30', '05:30')`,
      [doctorId, date],
    )

    await repository.removeException({ doctorId, exceptionId: first.id }, now)
    const listed = await publicRepository.findSlotsByDate(doctorId, date)
    expect(listed.map(item => Number(item.id))).not.toContain(Number(slot.id))
  })

  it('atomically creates valid 2-day and 31-day all-day ranges with one UUID per range', async () => {
    const twoDay = await repository.createExceptionRange(range({ endDate: '2026-09-30' }), now)
    const thirtyOneDay = await repository.createExceptionRange(range({
      startDate: '2026-10-01', endDate: '2026-10-31',
    }), now)
    const stored = await query(
      `SELECT exception_group_id, COUNT(*)::int AS days,
         BOOL_AND(all_day AND start_time IS NULL AND end_time IS NULL) AS all_day
       FROM availability_exceptions
       GROUP BY exception_group_id
       ORDER BY days`,
    )

    expect(twoDay).toMatchObject({
      rangeId: expect.any(String), startDate: '2026-09-29', endDate: '2026-09-30', allDay: true,
    })
    expect(thirtyOneDay).toMatchObject({
      rangeId: expect.any(String), startDate: '2026-10-01', endDate: '2026-10-31', allDay: true,
    })
    expect(stored.rows).toEqual([
      { exception_group_id: twoDay.rangeId, days: 2, all_day: true },
      { exception_group_id: thirtyOneDay.rangeId, days: 31, all_day: true },
    ])
  })

  it.each([
    [{ startDate: '2026-09-29', endDate: '2026-09-29' }, 'equal dates'],
    [{ startDate: '2026-09-30', endDate: '2026-09-29' }, 'end before start'],
    [{ startDate: '2026-09-29', endDate: '2026-10-30' }, '32 days'],
  ])('defensively rejects an invalid range with %s', async (overrides) => {
    await expect(repository.createExceptionRange(range(overrides), now))
      .rejects.toMatchObject({ code: 'AVAILABILITY_EXCEPTION_RANGE_INVALID' })
    expect((await query('SELECT COUNT(*)::int AS count FROM availability_exceptions')).rows[0].count).toBe(0)
  })

  it('rejects a past-starting range but permits all-day today through a future date', async () => {
    await expect(repository.createExceptionRange(range({
      startDate: '2026-09-17', endDate: '2026-09-19',
    }), now)).rejects.toMatchObject({ code: 'AVAILABILITY_EXCEPTION_IN_PAST' })

    await expect(repository.createExceptionRange(range({
      startDate: '2026-09-18', endDate: '2026-09-19',
    }), now)).resolves.toMatchObject({ startDate: '2026-09-18', endDate: '2026-09-19' })
  })

  it('rejects the entire range when any active exception overlaps a middle day', async () => {
    await repository.createException(partial({ date: '2026-10-01' }), now)

    await expect(repository.createExceptionRange(range(), now))
      .rejects.toMatchObject({ code: 'AVAILABILITY_EXCEPTION_OVERLAP' })
    const grouped = await query(
      'SELECT COUNT(*)::int AS count FROM availability_exceptions WHERE exception_group_id IS NOT NULL',
    )
    expect(grouped.rows[0].count).toBe(0)
  })

  it('ignores soft-removed overlap rows when creating a range', async () => {
    const existing = await repository.createException(partial({ date: '2026-10-01' }), now)
    await repository.removeException({ doctorId, exceptionId: existing.id }, now)

    await expect(repository.createExceptionRange(range(), now)).resolves.toMatchObject({
      startDate: '2026-09-29', endDate: '2026-10-03',
    })
  })

  it.each([
    ['first', '2026-09-29'],
    ['middle', '2026-10-01'],
    ['last', '2026-10-03'],
  ])('rejects the whole range for a booked appointment on the %s day', async (_label, date) => {
    const slot = await insertSlot({ date })
    await insertAppointment(slot.id)

    await expect(repository.createExceptionRange(range(), now)).rejects.toMatchObject({
      code: 'AVAILABILITY_EXCEPTION_BOOKED_CONFLICT',
      details: { conflictCount: 1 },
    })
    const grouped = await query(
      'SELECT COUNT(*)::int AS count FROM availability_exceptions WHERE exception_group_id IS NOT NULL',
    )
    expect(grouped.rows[0].count).toBe(0)
  })

  it.each(['cancelled', 'completed', 'no_show', 'rescheduled'])(
    'does not let %s appointment history block a range',
    async status => {
      const slot = await insertSlot()
      await insertAppointment(slot.id, status)

      await expect(repository.createExceptionRange(range(), now)).resolves.toMatchObject({
        startDate: '2026-09-29', endDate: '2026-10-03',
      })
    },
  )

  it('rolls back every range day after an injected insert failure without mutating scheduling data', async () => {
    const slot = await insertSlot()
    const before = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM availability_blocks) AS blocks,
         (SELECT COUNT(*)::int FROM slots) AS slots,
         (SELECT COUNT(*)::int FROM appointments) AS appointments,
         (SELECT is_active FROM slots WHERE id = $1) AS active`,
      [slot.id],
    )
    await query(`
      CREATE FUNCTION fail_grouped_exception_insert() RETURNS trigger AS $failure$
      BEGIN
        IF NEW.exception_date = DATE '2026-10-01' THEN
          RAISE EXCEPTION 'simulated grouped exception failure';
        END IF;
        RETURN NEW;
      END
      $failure$ LANGUAGE plpgsql
    `)
    await query(`
      CREATE TRIGGER fail_grouped_exception_insert
      BEFORE INSERT ON availability_exceptions
      FOR EACH ROW EXECUTE FUNCTION fail_grouped_exception_insert()
    `)

    try {
      await expect(repository.createExceptionRange(range(), now))
        .rejects.toThrow('simulated grouped exception failure')
      expect((await query('SELECT COUNT(*)::int AS count FROM availability_exceptions')).rows[0].count).toBe(0)
      const after = await query(
        `SELECT
           (SELECT COUNT(*)::int FROM availability_blocks) AS blocks,
           (SELECT COUNT(*)::int FROM slots) AS slots,
           (SELECT COUNT(*)::int FROM appointments) AS appointments,
           (SELECT is_active FROM slots WHERE id = $1) AS active`,
        [slot.id],
      )
      expect(after.rows[0]).toEqual(before.rows[0])
    } finally {
      await query('DROP TRIGGER fail_grouped_exception_insert ON availability_exceptions')
      await query('DROP FUNCTION fail_grouped_exception_insert()')
    }
  })

  it('lists daily rows with original range bounds after early days expire and null metadata for legacy rows', async () => {
    const created = await repository.createExceptionRange(range({
      startDate: '2026-09-18', endDate: '2026-09-20',
    }), now)
    await repository.createException(allDay({ date: '2026-09-21' }), now)
    await repository.createException(partial({ date: '2026-09-22' }), now)

    const listed = await repository.listExceptions(
      { doctorId },
      new Date('2026-09-19T04:30:00.000Z'),
    )
    const grouped = listed.filter(item => item.rangeId === created.rangeId)
    expect(grouped.map(item => item.date)).toEqual(['2026-09-19', '2026-09-20'])
    expect(grouped.every(item => item.rangeStartDate === '2026-09-18')).toBe(true)
    expect(grouped.every(item => item.rangeEndDate === '2026-09-20')).toBe(true)
    expect(listed.filter(item => item.rangeId === null)).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: '2026-09-21', rangeStartDate: null, rangeEndDate: null }),
      expect.objectContaining({ date: '2026-09-22', rangeStartDate: null, rangeEndDate: null }),
    ]))
    await expect(repository.listExceptions({ doctorId: otherDoctorId }, now)).resolves.toEqual([])
  })

  it('soft-removes a whole owned range idempotently and protects grouped children from partial removal', async () => {
    const date = '2026-11-29'
    const active = await insertSlot({ date })
    const inactive = await insertSlot({ date, startTime: '05:00', endTime: '05:30', active: false })
    const booked = await insertSlot({ date, startTime: '05:30', endTime: '06:00' })
    const created = await repository.createExceptionRange(range({
      startDate: date, endDate: '2026-12-03',
    }), now)
    await insertAppointment(booked.id)
    const child = await query(
      `SELECT id FROM availability_exceptions
       WHERE exception_group_id = $1 ORDER BY id LIMIT 1`,
      [created.rangeId],
    )

    await expect(repository.removeException({
      doctorId, exceptionId: Number(child.rows[0].id),
    }, now)).rejects.toMatchObject({ code: 'AVAILABILITY_EXCEPTION_RANGE_REQUIRED' })
    await expect(repository.removeExceptionRange({ doctorId: otherDoctorId, rangeId: created.rangeId }, now))
      .rejects.toMatchObject({ code: 'AVAILABILITY_EXCEPTION_NOT_FOUND' })
    await expect(repository.removeExceptionRange({ doctorId, rangeId: randomUUID() }, now))
      .rejects.toMatchObject({ code: 'AVAILABILITY_EXCEPTION_NOT_FOUND' })

    await expect(repository.removeExceptionRange({ doctorId, rangeId: created.rangeId }, now))
      .resolves.toEqual({ removed: true })
    await expect(repository.removeExceptionRange({ doctorId, rangeId: created.rangeId }, now))
      .resolves.toEqual({ removed: false })
    const stored = await query(
      `SELECT COUNT(*)::int AS rows,
         COUNT(removed_at)::int AS removed
       FROM availability_exceptions
       WHERE exception_group_id = $1`,
      [created.rangeId],
    )
    expect(stored.rows[0]).toEqual({ rows: 5, removed: 5 })
    const restored = await publicRepository.findSlotsByDate(doctorId, date)
    expect(restored.map(item => Number(item.id))).toEqual([Number(active.id)])
    expect(restored.map(item => Number(item.id))).not.toContain(Number(inactive.id))
    expect(restored.map(item => Number(item.id))).not.toContain(Number(booked.id))
    const scheduling = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM slots) AS slots,
         (SELECT COUNT(*)::int FROM appointments) AS appointments`,
    )
    expect(scheduling.rows[0]).toEqual({ slots: 3, appointments: 1 })
    await expect(repository.listExceptions({ doctorId }, now)).resolves.toEqual([])
  })

  it('keeps recurring materialization intact under a range overlay and reveals it after removal', async () => {
    const created = await repository.createExceptionRange(range({
      startDate: '2026-11-29', endDate: '2026-11-30',
    }), now)
    await repository.createRecurring({
      doctorId,
      weekdays: [7, 1],
      startTime: '09:00',
      endTime: '10:00',
      startsOn: '2026-11-29',
      endsOn: '2026-11-30',
      fee: null,
    }, now)

    const materialized = await query(
      `SELECT COUNT(*)::int AS slots, BOOL_AND(slot.is_active) AS active
       FROM slots slot
       JOIN availability_blocks block ON block.id = slot.availability_block_id
       WHERE block.recurring_rule_id IS NOT NULL`,
    )
    expect(materialized.rows[0]).toEqual({ slots: 4, active: true })
    expect(await publicRepository.findSlotsByDate(doctorId, '2026-11-29')).toEqual([])

    await repository.removeExceptionRange({ doctorId, rangeId: created.rangeId }, now)
    expect(await publicRepository.findSlotsByDate(doctorId, '2026-11-29')).toHaveLength(2)
  })
})
