import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { MigrationBuilder } from 'node-pg-migrate'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { up as upPublicDiscovery } from '../migrations/1788175200000_create-public-discovery-schema.js'
import { up as upAuthentication } from '../migrations/1788175300000_create-authentication-schema.js'
import { up as upAppointmentBooking } from '../migrations/1788175400000_create-appointment-booking-schema.js'
import { up as upConsultationLifecycle } from '../migrations/1788775500000_create-consultation-lifecycle.js'
import { up as upClinicalWorkspace } from '../migrations/1789375600000_add-consultation-clinical-workspace.js'
import { up as upSearchAliases } from '../migrations/1790000000000_add_search_aliases.js'
import { up as upRecurringAvailability } from '../migrations/1790100000000_add-recurring-availability-rules.js'
import {
  AvailabilityDataError,
  createAvailabilityRepository,
} from '../src/data-access/availability.repository.js'

const { Pool } = pg
const describeWithPostgres = process.env.DATABASE_URL ? describe : describe.skip
const now = new Date('2026-09-17T00:00:00.000Z')

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

describeWithPostgres('recurring availability repository', () => {
  let pool
  let schema
  let repository
  let provider
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
       VALUES ($1, $2, 'test-only', 'doctor', $3)
       RETURNING id`,
      [`Recurring ${label}`, `recurring-${label}-${randomUUID()}@example.test`, enabled],
    )
    const id = Number(user.rows[0].id)
    await query(
      `INSERT INTO doctor_profiles (user_id, qualification, default_fee)
       VALUES ($1, 'MBBS', 500)`,
      [id],
    )
    await query(
      `INSERT INTO doctor_verifications (
         doctor_id, registration_number, issuing_authority, status,
         reviewed_by_user_id, reviewed_at
       ) VALUES ($1, $2, 'Repository Test Authority', $3, $4, $5)`,
      [
        id,
        `repository-${randomUUID()}`,
        verification,
        verification === 'pending' ? null : reviewerId,
        verification === 'pending' ? null : now,
      ],
    )
    return id
  }

  function input(overrides = {}) {
    return {
      doctorId,
      weekdays: [1],
      startTime: '09:00',
      endTime: '12:00',
      startsOn: '2026-09-21',
      endsOn: '2026-10-05',
      fee: null,
      ...overrides,
    }
  }

  async function create(overrides = {}, clock = now) {
    return repository.createRecurring(input(overrides), clock)
  }

  async function occurrenceRows(ruleId) {
    const result = await query(
      `SELECT
         block.id,
         to_char(block.start_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS date,
         to_char(block.start_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS start_time,
         to_char(block.end_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS end_time,
         block.effective_fee,
         COUNT(slot.id)::int AS slot_count,
         MIN(slot.start_at) AS first_slot_start,
         MAX(slot.end_at) AS last_slot_end
       FROM availability_blocks block
       JOIN slots slot ON slot.availability_block_id = block.id
       WHERE block.recurring_rule_id = $1
       GROUP BY block.id
       ORDER BY block.start_at`,
      [ruleId],
    )
    return result.rows
  }

  async function insertOverlappingSlot({ active = true, appointmentStatus = null } = {}) {
    const blockResult = await query(
      `INSERT INTO availability_blocks (doctor_id, start_at, end_at)
       VALUES ($1, '2026-09-21T09:00:00+05:30', '2026-09-21T10:00:00+05:30')
       RETURNING id`,
      [doctorId],
    )
    const slotResult = await query(
      `INSERT INTO slots (availability_block_id, start_at, end_at, is_active)
       VALUES ($1, '2026-09-21T09:00:00+05:30', '2026-09-21T09:30:00+05:30', $2)
       RETURNING id`,
      [blockResult.rows[0].id, active],
    )
    if (appointmentStatus) {
      const cancellationColumns = appointmentStatus === 'cancelled'
        ? ', cancelled_by_user_id, cancelled_at'
        : ''
      const cancellationValues = appointmentStatus === 'cancelled' ? ', $4, $5' : ''
      const values = appointmentStatus === 'cancelled'
        ? [patientId, slotResult.rows[0].id, appointmentStatus, patientId, now]
        : [patientId, slotResult.rows[0].id, appointmentStatus]
      await query(
        `INSERT INTO appointments (
           patient_id, slot_id, status${cancellationColumns}
         ) VALUES ($1, $2, $3${cancellationValues})`,
        values,
      )
    }
  }

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
      statement_timeout: 5000,
    })
    schema = `recurring_repository_test_${randomUUID().replaceAll('-', '')}`
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
      ]) {
        await client.query(migrationSql(migration))
      }
      const reviewer = await client.query(
        `INSERT INTO users (full_name, email, password_hash, role)
         VALUES ('Recurring Reviewer', $1, 'test-only', 'admin')
         RETURNING id`,
        [`recurring-reviewer-${randomUUID()}@example.test`],
      )
      reviewerId = reviewer.rows[0].id
    } finally {
      client.release()
    }

    provider = () => ({ connect: schemaClient })
    repository = createAvailabilityRepository(provider)
    doctorId = await insertDoctor('approved')
    otherDoctorId = await insertDoctor('other')
    disabledDoctorId = await insertDoctor('disabled', { enabled: false })
    pendingDoctorId = await insertDoctor('pending', { verification: 'pending' })
    const patient = await query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ('Recurring Patient', $1, 'test-only', 'patient')
       RETURNING id`,
      [`recurring-patient-${randomUUID()}@example.test`],
    )
    patientId = Number(patient.rows[0].id)
    await query('INSERT INTO patient_profiles (user_id) VALUES ($1)', [patientId])
  })

  beforeEach(async () => {
    await query('DELETE FROM appointments')
    await query('DELETE FROM slots')
    await query('DELETE FROM availability_blocks')
    await query('DELETE FROM recurring_availability_rules')
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

  it('canonicalizes weekdays and stores an explicit fee', async () => {
    const result = await create({ weekdays: [5, 1, 5, 3, 1], fee: 725 })

    expect(result.rule).toMatchObject({ weekdays: [1, 3, 5], fee: 725, status: 'active' })
    const stored = await query(
      'SELECT weekdays, effective_fee FROM recurring_availability_rules WHERE id = $1',
      [result.rule.id],
    )
    expect(stored.rows[0].weekdays).toEqual([1, 3, 5])
    expect(Number(stored.rows[0].effective_fee)).toBe(725)
  })

  it('preserves a null rule fee on the rule and generated blocks', async () => {
    const result = await create()
    const occurrences = await occurrenceRows(result.rule.id)

    expect(result.rule.fee).toBeNull()
    expect(occurrences.every(occurrence => occurrence.effective_fee === null)).toBe(true)
  })

  it.each([
    ['disabled', () => disabledDoctorId, 'ACCOUNT_DISABLED'],
    ['unapproved', () => pendingDoctorId, 'DOCTOR_NOT_APPROVED'],
  ])('rejects a %s doctor', async (_label, resolveDoctorId, code) => {
    await expect(create({ doctorId: resolveDoctorId() })).rejects.toMatchObject({
      name: 'AvailabilityDataError',
      code,
    })
    const rules = await query('SELECT id FROM recurring_availability_rules')
    expect(rules.rowCount).toBe(0)
  })

  it('materializes one matching weekday using Asia/Kolkata dates', async () => {
    const result = await create()
    const occurrences = await occurrenceRows(result.rule.id)

    expect(occurrences.map(occurrence => occurrence.date)).toEqual([
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
    ])
  })

  it('materializes every selected weekday', async () => {
    const result = await create({ weekdays: [1, 3, 5], endsOn: '2026-09-30' })
    const occurrences = await occurrenceRows(result.rule.id)

    expect(occurrences.map(occurrence => occurrence.date)).toEqual([
      '2026-09-21',
      '2026-09-23',
      '2026-09-25',
      '2026-09-28',
      '2026-09-30',
    ])
  })

  it('generates exact block boundaries and fixed 30-minute slots', async () => {
    const result = await create({ endTime: '11:30', endsOn: '2026-09-21' })
    const [occurrence] = await occurrenceRows(result.rule.id)

    expect(occurrence).toMatchObject({ start_time: '09:00', end_time: '11:30', slot_count: 5 })
    expect(occurrence.first_slot_start.toISOString()).toBe('2026-09-21T03:30:00.000Z')
    expect(occurrence.last_slot_end.toISOString()).toBe('2026-09-21T06:00:00.000Z')
  })

  it('treats endsOn as inclusive', async () => {
    const result = await create({ endsOn: '2026-09-28' })
    const occurrences = await occurrenceRows(result.rule.id)

    expect(occurrences.map(occurrence => occurrence.date)).toEqual(['2026-09-21', '2026-09-28'])
  })

  it('caps open-ended materialization at today in IST plus 90 days', async () => {
    const result = await create({ weekdays: [3], startsOn: '2026-09-17', endsOn: null })
    const occurrences = await occurrenceRows(result.rule.id)

    expect(result.rule.materializedThrough).toBe('2026-12-16')
    expect(occurrences.at(-1).date).toBe('2026-12-16')
    expect(occurrences.every(occurrence => occurrence.date <= '2026-12-16')).toBe(true)
  })

  it('accepts a rule beginning beyond the horizon and records the last evaluated date', async () => {
    const result = await create({
      weekdays: [1],
      startsOn: '2027-01-04',
      endsOn: '2027-01-25',
    })
    const occurrences = await occurrenceRows(result.rule.id)

    expect(occurrences).toEqual([])
    expect(result.rule.materializedThrough).toBe('2026-12-16')
  })

  it('skips matching occurrences whose start is not in the future', async () => {
    const result = await create({ startsOn: '2026-09-14', endsOn: '2026-09-28' })
    const occurrences = await occurrenceRows(result.rule.id)

    expect(occurrences.map(occurrence => occurrence.date)).toEqual(['2026-09-21', '2026-09-28'])
    expect(result.rule.materializedThrough).toBe('2026-09-28')
  })

  it('rejects a past-only rule without retaining any data', async () => {
    await expect(create({ startsOn: '2026-09-01', endsOn: '2026-09-16' }))
      .rejects.toMatchObject({ code: 'RECURRING_AVAILABILITY_IN_PAST' })
    const counts = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM recurring_availability_rules) AS rules,
         (SELECT COUNT(*)::int FROM availability_blocks) AS blocks,
         (SELECT COUNT(*)::int FROM slots) AS slots`,
    )
    expect(counts.rows[0]).toEqual({ rules: 0, blocks: 0, slots: 0 })
  })

  it('rejects overlap with an existing one-off block', async () => {
    await insertOverlappingSlot()

    await expect(create()).rejects.toMatchObject({ code: 'AVAILABILITY_OVERLAP' })
  })

  it('allows a rule to touch an existing one-off block', async () => {
    await insertOverlappingSlot()

    const result = await create({ startTime: '09:30', endTime: '10:30' })
    expect(result.rule.id).toBeGreaterThan(0)
  })

  it.each(['cancelled', 'completed', 'no_show', 'rescheduled'])(
    'allows an inactive overlapping slot with %s appointment history',
    async appointmentStatus => {
      await insertOverlappingSlot({ active: false, appointmentStatus })

      const result = await create({ endsOn: '2026-09-21' })
      expect(result.rule.id).toBeGreaterThan(0)
    },
  )

  it('rejects an inactive overlapping slot with a booked appointment', async () => {
    await insertOverlappingSlot({ active: false, appointmentStatus: 'booked' })

    await expect(create({ endsOn: '2026-09-21' }))
      .rejects.toMatchObject({ code: 'AVAILABILITY_OVERLAP' })
  })

  it('rejects an active overlapping slot without appointment history', async () => {
    await insertOverlappingSlot({ active: true })

    await expect(create({ endsOn: '2026-09-21' }))
      .rejects.toMatchObject({ code: 'AVAILABILITY_OVERLAP' })
  })

  it('rejects overlap with an existing materialized recurring block', async () => {
    await create({ endsOn: '2026-09-21' })

    await expect(create({ startTime: '09:30', endTime: '10:30', endsOn: '2026-09-21' }))
      .rejects.toMatchObject({ code: 'AVAILABILITY_OVERLAP' })
  })

  it('allows a stopped rule occurrence after all its slots are deactivated', async () => {
    const existing = await create({ endsOn: '2026-09-21' })
    await query(
      `UPDATE recurring_availability_rules
       SET status = 'stopped'
       WHERE id = $1`,
      [existing.rule.id],
    )
    await query(
      `UPDATE slots
       SET is_active = FALSE
       WHERE availability_block_id IN (
         SELECT id FROM availability_blocks WHERE recurring_rule_id = $1
       )`,
      [existing.rule.id],
    )

    const replacement = await create({ endsOn: '2026-09-21' })
    expect(replacement.rule.id).toBeGreaterThan(0)
  })

  it('rejects an active rule conflict beyond all currently materialized rows', async () => {
    const existing = await create({ endTime: '10:00', endsOn: null })
    const occurrences = await occurrenceRows(existing.rule.id)
    expect(occurrences.at(-1).date < '2027-01-04').toBe(true)

    await expect(create({
      startTime: '09:30',
      endTime: '10:30',
      startsOn: '2027-01-04',
      endsOn: '2027-01-25',
    })).rejects.toMatchObject({ code: 'AVAILABILITY_OVERLAP' })
  })

  it('allows the same time on a different weekday', async () => {
    await create({ weekdays: [1] })
    const result = await create({ weekdays: [2] })
    expect(result.rule.weekdays).toEqual([2])
  })

  it('allows a touching non-overlapping time on the same weekday', async () => {
    await create({ startTime: '09:00', endTime: '10:00' })
    const result = await create({ startTime: '10:00', endTime: '11:00' })
    expect(result.rule.id).toBeGreaterThan(0)
  })

  it('allows the same weekday and time in a non-overlapping date range', async () => {
    await create({ endsOn: '2026-10-05' })
    const result = await create({ startsOn: '2026-10-12', endsOn: '2026-10-26' })
    expect(result.rule.startsOn).toBe('2026-10-12')
  })

  it('rolls back the rule, blocks, slots and cursor if slot generation fails', async () => {
    await query(`
      CREATE FUNCTION fail_recurring_slot_insert() RETURNS trigger AS $failure$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM availability_blocks
          WHERE id = NEW.availability_block_id
            AND recurring_rule_id IS NOT NULL
        ) THEN
          RAISE EXCEPTION 'simulated recurring slot failure';
        END IF;
        RETURN NEW;
      END
      $failure$ LANGUAGE plpgsql
    `)
    await query(`
      CREATE TRIGGER fail_recurring_slot_insert
      BEFORE INSERT ON slots
      FOR EACH ROW EXECUTE FUNCTION fail_recurring_slot_insert()
    `)

    try {
      await expect(create()).rejects.toThrow('simulated recurring slot failure')
      const counts = await query(
        `SELECT
           (SELECT COUNT(*)::int FROM recurring_availability_rules) AS rules,
           (SELECT COUNT(*)::int FROM availability_blocks) AS blocks,
           (SELECT COUNT(*)::int FROM slots) AS slots`,
      )
      expect(counts.rows[0]).toEqual({ rules: 0, blocks: 0, slots: 0 })
    } finally {
      await query('DROP TRIGGER fail_recurring_slot_insert ON slots')
      await query('DROP FUNCTION fail_recurring_slot_insert()')
    }
  })

  it('materializes idempotently without duplicating blocks or slots', async () => {
    const created = await create()
    const before = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM availability_blocks) AS blocks,
         (SELECT COUNT(*)::int FROM slots) AS slots`,
    )
    const repeated = await repository.materializeRecurring(
      { doctorId, ruleId: created.rule.id },
      now,
    )
    const after = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM availability_blocks) AS blocks,
         (SELECT COUNT(*)::int FROM slots) AS slots`,
    )

    expect(repeated.materialized).toEqual([])
    expect(after.rows[0]).toEqual(before.rows[0])
  })

  it('rolls back a later extension without advancing its existing cursor', async () => {
    const created = await create({ endsOn: null })
    const before = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM availability_blocks) AS blocks,
         (SELECT COUNT(*)::int FROM slots) AS slots,
         (SELECT materialized_through FROM recurring_availability_rules WHERE id = $1) AS cursor`,
      [created.rule.id],
    )
    await query(`
      CREATE FUNCTION fail_recurring_extension_slot() RETURNS trigger AS $failure$
      BEGIN
        RAISE EXCEPTION 'simulated recurring extension failure';
      END
      $failure$ LANGUAGE plpgsql
    `)
    await query(`
      CREATE TRIGGER fail_recurring_extension_slot
      BEFORE INSERT ON slots
      FOR EACH ROW EXECUTE FUNCTION fail_recurring_extension_slot()
    `)

    try {
      await expect(repository.materializeRecurring(
        { doctorId, ruleId: created.rule.id },
        new Date('2026-10-01T00:00:00.000Z'),
      )).rejects.toThrow('simulated recurring extension failure')
      const after = await query(
        `SELECT
           (SELECT COUNT(*)::int FROM availability_blocks) AS blocks,
           (SELECT COUNT(*)::int FROM slots) AS slots,
           (SELECT materialized_through FROM recurring_availability_rules WHERE id = $1) AS cursor`,
        [created.rule.id],
      )
      expect(after.rows[0]).toEqual(before.rows[0])
    } finally {
      await query('DROP TRIGGER fail_recurring_extension_slot ON slots')
      await query('DROP FUNCTION fail_recurring_extension_slot()')
    }
  })

  it('acquires the doctor advisory lock before overlap-sensitive work', async () => {
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

    await recordingRepository.createRecurring(input(), now)
    const advisoryLock = statements.findIndex(sql => sql.includes('pg_advisory_xact_lock'))
    const activeRuleOverlap = statements.findIndex(sql => sql.startsWith('WITH candidates AS'))
    const slotOverlap = statements.findIndex(sql => sql.startsWith('SELECT 1 FROM slots slot'))

    expect(advisoryLock).toBeGreaterThanOrEqual(0)
    expect(advisoryLock).toBeLessThan(activeRuleOverlap)
    expect(advisoryLock).toBeLessThan(slotOverlap)
  })

  it('locks before overlap-sensitive work when rematerializing an existing rule', async () => {
    const created = await create({ endsOn: null })
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

    await recordingRepository.materializeRecurring(
      { doctorId, ruleId: created.rule.id },
      new Date('2026-10-01T00:00:00.000Z'),
    )
    const advisoryLock = statements.findIndex(sql => sql.includes('pg_advisory_xact_lock'))
    const activeRuleOverlap = statements.findIndex(sql => sql.startsWith('WITH candidates AS'))
    const slotOverlap = statements.findIndex(sql => sql.startsWith('SELECT 1 FROM slots slot'))

    expect(advisoryLock).toBeGreaterThanOrEqual(0)
    expect(advisoryLock).toBeLessThan(activeRuleOverlap)
    expect(advisoryLock).toBeLessThan(slotOverlap)
  })

  it('uses independent advisory locks for different doctors', async () => {
    const results = await Promise.all([
      create({ doctorId, endsOn: '2026-09-21' }),
      create({ doctorId: otherDoctorId, endsOn: '2026-09-21' }),
    ])

    expect(results.map(result => result.rule.doctorId).sort((a, b) => a - b))
      .toEqual([doctorId, otherDoctorId].sort((a, b) => a - b))
  })

  it('prevents a later one-off block from conflicting with active rule intent', async () => {
    await create({ endTime: '10:00', endsOn: null })

    await expect(repository.create({
      doctorId,
      startAt: new Date('2027-01-04T04:00:00.000Z'),
      endAt: new Date('2027-01-04T05:00:00.000Z'),
      fee: null,
    })).rejects.toBeInstanceOf(AvailabilityDataError)
  })

  it.each(['cancelled', 'completed', 'no_show', 'rescheduled'])(
    'allows one-off creation over an inactive slot with %s history',
    async appointmentStatus => {
      await insertOverlappingSlot({ active: false, appointmentStatus })

      const result = await repository.create({
        doctorId,
        startAt: new Date('2026-09-21T03:30:00.000Z'),
        endAt: new Date('2026-09-21T04:30:00.000Z'),
        fee: null,
      })
      expect(result.block.id).toBeDefined()
    },
  )

  it('rejects one-off creation over an inactive slot with a booked appointment', async () => {
    await insertOverlappingSlot({ active: false, appointmentStatus: 'booked' })

    await expect(repository.create({
      doctorId,
      startAt: new Date('2026-09-21T03:30:00.000Z'),
      endAt: new Date('2026-09-21T04:30:00.000Z'),
      fee: null,
    })).rejects.toMatchObject({ code: 'AVAILABILITY_OVERLAP' })
  })
})
