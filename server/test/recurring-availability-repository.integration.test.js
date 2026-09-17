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
import { createAppointmentRepository } from '../src/data-access/appointment.repository.js'
import { createRecurringAvailabilityExtenderService } from '../src/services/recurring-availability-extender.service.js'

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
  let appointmentRepository
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

  function deferred() {
    let resolve
    const promise = new Promise(resolvePromise => {
      resolve = resolvePromise
    })
    return { promise, resolve }
  }

  function gatedProvider(matches) {
    const attempted = deferred()
    const acquired = deferred()
    const resume = deferred()
    let matched = false

    return {
      acquired: acquired.promise,
      attempted: attempted.promise,
      provider: () => ({
        async connect() {
          const client = await schemaClient()
          return {
            async query(sql, values) {
              const shouldGate = !matched && matches(normalizeSql(sql))
              if (shouldGate) {
                matched = true
                attempted.resolve()
              }
              const result = await client.query(sql, values)
              if (shouldGate) {
                acquired.resolve()
                await resume.promise
              }
              return result
            },
            release: () => client.release(),
          }
        },
      }),
      resume: resume.resolve,
    }
  }

  function exclusiveLockGate() {
    return gatedProvider(sql => sql.includes('pg_advisory_xact_lock('))
  }

  function sharedLockGate() {
    return gatedProvider(sql => sql.includes('pg_advisory_xact_lock_shared('))
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

  async function insertAppointment(slotId, status = 'booked') {
    const cancellationColumns = status === 'cancelled'
      ? ', cancelled_by_user_id, cancelled_at'
      : ''
    const cancellationValues = status === 'cancelled' ? ', $4, $5' : ''
    const values = status === 'cancelled'
      ? [patientId, slotId, status, patientId, now]
      : [patientId, slotId, status]
    const result = await query(
      `INSERT INTO appointments (
         patient_id, slot_id, status${cancellationColumns}
       ) VALUES ($1, $2, $3${cancellationValues})
       RETURNING id`,
      values,
    )
    return Number(result.rows[0].id)
  }

  async function generatedRows(ruleId) {
    const result = await query(
      `SELECT
         block.id AS block_id,
         block.start_at AS block_start_at,
         block.end_at AS block_end_at,
         slot.id AS slot_id,
         slot.start_at AS slot_start_at,
         slot.end_at AS slot_end_at,
         slot.is_active
       FROM availability_blocks block
       LEFT JOIN slots slot ON slot.availability_block_id = block.id
       WHERE block.recurring_rule_id = $1
       ORDER BY block.start_at, slot.start_at`,
      [ruleId],
    )
    return result.rows
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
    appointmentRepository = createAppointmentRepository(provider)
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

  it('lists only the Doctor own rules with active rules first and newest first within status', async () => {
    const stopped = await create({ endTime: '10:00', endsOn: '2026-09-21' })
    await query(
      `UPDATE recurring_availability_rules
       SET status = 'stopped', created_at = '2026-09-01T00:00:00Z'
       WHERE id = $1`,
      [stopped.rule.id],
    )
    const olderActive = await create({
      weekdays: [2],
      startTime: '13:00',
      endTime: '14:00',
      endsOn: '2026-09-22',
    })
    await query(
      `UPDATE recurring_availability_rules
       SET created_at = '2026-09-02T00:00:00Z'
       WHERE id = $1`,
      [olderActive.rule.id],
    )
    const newestActive = await create({
      weekdays: [3],
      startTime: '15:00',
      endTime: '16:00',
      endsOn: '2026-09-23',
    })
    await query(
      `UPDATE recurring_availability_rules
       SET created_at = '2026-09-03T00:00:00Z'
       WHERE id = $1`,
      [newestActive.rule.id],
    )
    await create({ doctorId: otherDoctorId, endsOn: '2026-09-21' })

    const rows = await repository.listRecurringForDoctor(doctorId)

    expect(rows.map(row => Number(row.rule_id))).toEqual([
      newestActive.rule.id,
      olderActive.rule.id,
      stopped.rule.id,
    ])
    expect(rows.map(row => row.status)).toEqual(['active', 'active', 'stopped'])
    expect(rows.map(row => row.materialized_occurrence_count)).toEqual([1, 1, 1])
  })

  it('returns an empty recurring-rule list and enforces current eligibility', async () => {
    await expect(repository.listRecurringForDoctor(doctorId)).resolves.toEqual([])
    await expect(repository.listRecurringForDoctor(disabledDoctorId)).rejects.toMatchObject({
      code: 'ACCOUNT_DISABLED',
    })
    await expect(repository.listRecurringForDoctor(pendingDoctorId)).rejects.toMatchObject({
      code: 'DOCTOR_NOT_APPROVED',
    })
  })

  it('extends an indefinite rule to the next rolling Asia/Kolkata horizon', async () => {
    const created = await create({
      weekdays: [4],
      startsOn: '2026-09-17',
      endsOn: null,
    })
    const before = await occurrenceRows(created.rule.id)
    const nextDay = new Date('2026-09-18T00:00:00.000Z')
    const extender = createRecurringAvailabilityExtenderService({ repository, clock: () => nextDay })

    await expect(extender.extend()).resolves.toEqual({ scanned: 1, extended: 1, skipped: 0, failed: 0 })

    const after = await occurrenceRows(created.rule.id)
    const rule = await query(
      `SELECT to_char(materialized_through, 'YYYY-MM-DD') AS cursor
       FROM recurring_availability_rules
       WHERE id = $1`,
      [created.rule.id],
    )
    expect(after).toHaveLength(before.length + 1)
    expect(after.at(-1).date).toBe('2026-12-17')
    expect(rule.rows[0].cursor).toBe('2026-12-17')
  })

  it('caps extension at ends_on and skips the fully evaluated rule afterward', async () => {
    const created = await create({
      weekdays: [4],
      startsOn: '2026-09-17',
      endsOn: '2026-12-17',
    })
    const firstClock = new Date('2026-09-18T00:00:00.000Z')
    const first = createRecurringAvailabilityExtenderService({ repository, clock: () => firstClock })

    await expect(first.extend()).resolves.toEqual({ scanned: 1, extended: 1, skipped: 0, failed: 0 })
    const second = createRecurringAvailabilityExtenderService({
      repository,
      clock: () => new Date('2026-09-19T00:00:00.000Z'),
    })
    await expect(second.extend()).resolves.toEqual({ scanned: 1, extended: 0, skipped: 1, failed: 0 })

    const occurrences = await occurrenceRows(created.rule.id)
    expect(occurrences.at(-1).date).toBe('2026-12-17')
    expect(occurrences.every(occurrence => occurrence.date <= '2026-12-17')).toBe(true)
  })

  it('skips an up-to-date rule without mutating it or duplicating rows', async () => {
    const created = await create({ endsOn: null })
    const before = await query(
      `SELECT
         rule.updated_at,
         rule.materialized_through,
         (SELECT COUNT(*)::int FROM availability_blocks WHERE recurring_rule_id = rule.id) AS blocks,
         (SELECT COUNT(*)::int FROM slots slot
          JOIN availability_blocks block ON block.id = slot.availability_block_id
          WHERE block.recurring_rule_id = rule.id) AS slots
       FROM recurring_availability_rules rule
       WHERE rule.id = $1`,
      [created.rule.id],
    )
    const extender = createRecurringAvailabilityExtenderService({ repository, clock: () => now })

    await expect(extender.extend()).resolves.toEqual({ scanned: 1, extended: 0, skipped: 1, failed: 0 })
    await expect(extender.extend()).resolves.toEqual({ scanned: 1, extended: 0, skipped: 1, failed: 0 })

    const after = await query(
      `SELECT
         rule.updated_at,
         rule.materialized_through,
         (SELECT COUNT(*)::int FROM availability_blocks WHERE recurring_rule_id = rule.id) AS blocks,
         (SELECT COUNT(*)::int FROM slots slot
          JOIN availability_blocks block ON block.id = slot.availability_block_id
          WHERE block.recurring_rule_id = rule.id) AS slots
       FROM recurring_availability_rules rule
       WHERE rule.id = $1`,
      [created.rule.id],
    )
    expect(after.rows[0]).toEqual(before.rows[0])
  })

  it('never scans or extends a stopped rule', async () => {
    const created = await create({ endsOn: null })
    await repository.stopRecurring({ doctorId, ruleId: created.rule.id, now })
    const extender = createRecurringAvailabilityExtenderService({
      repository,
      clock: () => new Date('2026-09-18T00:00:00.000Z'),
    })

    await expect(extender.extend()).resolves.toEqual({ scanned: 0, extended: 0, skipped: 0, failed: 0 })
    const rule = await query('SELECT status FROM recurring_availability_rules WHERE id = $1', [created.rule.id])
    expect(rule.rows[0].status).toBe('stopped')
  })

  it('allows concurrent extender instances without duplicate blocks or slots', async () => {
    const created = await create({
      weekdays: [4],
      startsOn: '2026-09-17',
      endsOn: null,
    })
    const nextDay = new Date('2026-09-18T00:00:00.000Z')
    const first = createRecurringAvailabilityExtenderService({ repository, clock: () => nextDay })
    const second = createRecurringAvailabilityExtenderService({ repository, clock: () => nextDay })

    const summaries = await Promise.all([first.extend(), second.extend()])

    expect(summaries.every(summary => summary.failed === 0)).toBe(true)
    const occurrences = await occurrenceRows(created.rule.id)
    const counts = await query(
      `SELECT
         to_char(rule.materialized_through, 'YYYY-MM-DD') AS cursor,
         COUNT(DISTINCT block.id)::int AS blocks,
         COUNT(slot.id)::int AS slots,
         COUNT(DISTINCT (block.recurring_rule_id, block.start_at))::int AS unique_occurrences,
         COUNT(DISTINCT (slot.availability_block_id, slot.start_at))::int AS unique_slots
       FROM recurring_availability_rules rule
       LEFT JOIN availability_blocks block ON block.recurring_rule_id = rule.id
       LEFT JOIN slots slot ON slot.availability_block_id = block.id
       WHERE rule.id = $1
       GROUP BY rule.id`,
      [created.rule.id],
    )
    expect(counts.rows[0]).toMatchObject({
      cursor: '2026-12-17',
      blocks: occurrences.length,
      unique_occurrences: occurrences.length,
      slots: occurrences.length * 6,
      unique_slots: occurrences.length * 6,
    })
  })

  it('keeps the Phase 4 stop invariant when an extender run is already materializing', async () => {
    const created = await create({ endsOn: null })
    const extensionGate = exclusiveLockGate()
    const stopGate = exclusiveLockGate()
    const controlledExtensionRepository = createAvailabilityRepository(extensionGate.provider)
    const controlledStopRepository = createAvailabilityRepository(stopGate.provider)
    const extensionTime = new Date('2026-10-01T00:00:00.000Z')
    const extender = createRecurringAvailabilityExtenderService({
      repository: controlledExtensionRepository,
      clock: () => extensionTime,
    })

    const extending = extender.extend()
    await extensionGate.acquired
    const stopping = controlledStopRepository.stopRecurring({
      doctorId,
      ruleId: created.rule.id,
      now: extensionTime,
    })
    await stopGate.attempted

    stopGate.resume()
    extensionGate.resume()
    await expect(extending).resolves.toMatchObject({ failed: 0 })
    await expect(stopping).resolves.toBeUndefined()

    const state = await query(
      `SELECT
         rule.status,
         COUNT(block.id) FILTER (WHERE block.start_at > $2)::int AS future_blocks,
         COUNT(block.id) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM slots slot
             WHERE slot.availability_block_id = block.id
               AND slot.is_active
               AND slot.start_at > $2
           )
         )::int AS bookable_blocks
       FROM recurring_availability_rules rule
       LEFT JOIN availability_blocks block ON block.recurring_rule_id = rule.id
       WHERE rule.id = $1
       GROUP BY rule.id`,
      [created.rule.id, extensionTime],
    )
    expect(state.rows[0]).toEqual({ status: 'stopped', future_blocks: 0, bookable_blocks: 0 })
  })

  it('stops a rule and deletes fully future occurrences with no appointment history', async () => {
    const created = await create({ endsOn: '2026-09-28' })
    const beforeRule = await query(
      'SELECT materialized_through FROM recurring_availability_rules WHERE id = $1',
      [created.rule.id],
    )

    await repository.stopRecurring({ doctorId, ruleId: created.rule.id, now })

    const rule = await query(
      'SELECT status, materialized_through FROM recurring_availability_rules WHERE id = $1',
      [created.rule.id],
    )
    expect(rule.rows[0]).toMatchObject({ status: 'stopped' })
    expect(rule.rows[0].materialized_through).toEqual(beforeRule.rows[0].materialized_through)
    await expect(generatedRows(created.rule.id)).resolves.toEqual([])
  })

  it('preserves a booked appointment and its rows while deactivating the stopped occurrence', async () => {
    const created = await create({ endsOn: '2026-09-21' })
    const before = await generatedRows(created.rule.id)
    const appointmentId = await insertAppointment(before[0].slot_id, 'booked')

    await repository.stopRecurring({ doctorId, ruleId: created.rule.id, now })

    const rows = await generatedRows(created.rule.id)
    const appointment = await query('SELECT slot_id, status FROM appointments WHERE id = $1', [appointmentId])
    expect(rows).toHaveLength(before.length)
    expect(rows.every(row => row.is_active === false)).toBe(true)
    expect(appointment.rows[0]).toMatchObject({ slot_id: before[0].slot_id, status: 'booked' })
  })

  it.each(['cancelled', 'completed', 'no_show', 'rescheduled'])(
    'preserves %s appointment history and deactivates every future slot',
    async status => {
      const created = await create({ endsOn: '2026-09-21' })
      const before = await generatedRows(created.rule.id)
      const appointmentId = await insertAppointment(before[0].slot_id, status)

      await repository.stopRecurring({ doctorId, ruleId: created.rule.id, now })

      const rows = await generatedRows(created.rule.id)
      const appointment = await query('SELECT status FROM appointments WHERE id = $1', [appointmentId])
      expect(rows).toHaveLength(before.length)
      expect(rows.every(row => row.is_active === false)).toBe(true)
      expect(appointment.rows[0].status).toBe(status)
    },
  )

  it('cleans a mixed rule by deleting unused occurrences and retaining the protected occurrence', async () => {
    const created = await create()
    const before = await generatedRows(created.rule.id)
    const blockIds = [...new Set(before.map(row => Number(row.block_id)))]
    const protectedBlockId = blockIds[1]
    const protectedSlot = before.find(row => Number(row.block_id) === protectedBlockId)
    await insertAppointment(protectedSlot.slot_id, 'cancelled')

    await repository.stopRecurring({ doctorId, ruleId: created.rule.id, now })

    const rows = await generatedRows(created.rule.id)
    expect(new Set(rows.map(row => Number(row.block_id)))).toEqual(new Set([protectedBlockId]))
    expect(rows.every(row => row.is_active === false)).toBe(true)
  })

  it('preserves a partially elapsed occurrence and deactivates its remaining slots', async () => {
    const created = await create({
      weekdays: [4],
      startTime: '05:00',
      endTime: '07:00',
      startsOn: '2026-09-17',
      endsOn: '2026-09-17',
    }, new Date('2026-09-16T00:00:00.000Z'))

    await repository.stopRecurring({ doctorId, ruleId: created.rule.id, now })

    const rows = await generatedRows(created.rule.id)
    expect(rows).toHaveLength(4)
    expect(rows.filter(row => new Date(row.slot_end_at) <= now).every(row => row.is_active)).toBe(true)
    expect(rows.filter(row => new Date(row.slot_end_at) > now).every(row => !row.is_active)).toBe(true)
  })

  it('leaves a fully past occurrence unchanged for history', async () => {
    const created = await create({
      weekdays: [2],
      startsOn: '2026-09-15',
      endsOn: '2026-09-15',
    }, new Date('2026-09-14T00:00:00.000Z'))
    const before = await generatedRows(created.rule.id)

    await repository.stopRecurring({ doctorId, ruleId: created.rule.id, now })

    const after = await generatedRows(created.rule.id)
    expect(after).toEqual(before)
  })

  it('keeps a stopped slot inactive when its booked appointment is later cancelled', async () => {
    const created = await create({ endsOn: '2026-09-21' })
    const [slot] = await generatedRows(created.rule.id)
    const appointmentId = await insertAppointment(slot.slot_id, 'booked')
    await repository.stopRecurring({ doctorId, ruleId: created.rule.id, now })

    await appointmentRepository.cancel({
      appointmentId,
      actorId: patientId,
      actorRole: 'patient',
      now,
    })

    const state = await query(
      `SELECT appointment.status, slot.is_active
       FROM appointments appointment
       JOIN slots slot ON slot.id = appointment.slot_id
       WHERE appointment.id = $1`,
      [appointmentId],
    )
    expect(state.rows[0]).toEqual({ status: 'cancelled', is_active: false })
  })

  it('allows replacement after stop unless a booked appointment still occupies the time', async () => {
    const unused = await create({ endsOn: '2026-09-21' })
    await repository.stopRecurring({ doctorId, ruleId: unused.rule.id, now })
    const replacement = await create({ endsOn: '2026-09-21' })
    expect(replacement.rule.id).toBeGreaterThan(0)

    const rows = await generatedRows(replacement.rule.id)
    await insertAppointment(rows[0].slot_id, 'booked')
    await repository.stopRecurring({ doctorId, ruleId: replacement.rule.id, now })
    await expect(create({ endsOn: '2026-09-21' }))
      .rejects.toMatchObject({ code: 'AVAILABILITY_OVERLAP' })
  })

  it('is idempotent and hides another Doctor rule behind safe not-found', async () => {
    const created = await create({ endsOn: '2026-09-21' })
    await repository.stopRecurring({ doctorId, ruleId: created.rule.id, now })
    await expect(repository.stopRecurring({ doctorId, ruleId: created.rule.id, now })).resolves.toBeUndefined()
    await expect(repository.materializeRecurring({ doctorId, ruleId: created.rule.id }, now))
      .rejects.toMatchObject({ code: 'RECURRING_AVAILABILITY_RULE_NOT_FOUND' })
    await expect(repository.stopRecurring({ doctorId: otherDoctorId, ruleId: created.rule.id, now }))
      .rejects.toMatchObject({ code: 'RECURRING_AVAILABILITY_RULE_NOT_FOUND' })
  })

  it.each([
    ['disabled', () => disabledDoctorId, 'ACCOUNT_DISABLED'],
    ['unapproved', () => pendingDoctorId, 'DOCTOR_NOT_APPROVED'],
  ])('rechecks %s Doctor eligibility before stopping', async (_label, resolveDoctorId, code) => {
    await expect(repository.stopRecurring({ doctorId: resolveDoctorId(), ruleId: 99999, now }))
      .rejects.toMatchObject({ code })
  })

  it('rolls back status and cleanup if retiring an unused occurrence fails', async () => {
    const created = await create({ endsOn: '2026-09-21' })
    const before = await generatedRows(created.rule.id)
    await query(`
      CREATE FUNCTION fail_recurring_stop_cleanup() RETURNS trigger AS $failure$
      BEGIN
        RAISE EXCEPTION 'simulated recurring stop failure';
      END
      $failure$ LANGUAGE plpgsql
    `)
    await query(`
      CREATE TRIGGER fail_recurring_stop_cleanup
      BEFORE DELETE ON slots
      FOR EACH ROW EXECUTE FUNCTION fail_recurring_stop_cleanup()
    `)

    try {
      await expect(repository.stopRecurring({ doctorId, ruleId: created.rule.id, now }))
        .rejects.toThrow('simulated recurring stop failure')
      const rule = await query('SELECT status FROM recurring_availability_rules WHERE id = $1', [created.rule.id])
      const after = await generatedRows(created.rule.id)
      expect(rule.rows[0].status).toBe('active')
      expect(after).toEqual(before)
    } finally {
      await query('DROP TRIGGER fail_recurring_stop_cleanup ON slots')
      await query('DROP FUNCTION fail_recurring_stop_cleanup()')
    }
  })

  it('takes the exclusive Doctor lock before rule and occurrence row locks', async () => {
    const created = await create({ endsOn: '2026-09-21' })
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

    await recordingRepository.stopRecurring({ doctorId, ruleId: created.rule.id, now })
    const advisoryLock = statements.findIndex(sql => sql.includes('pg_advisory_xact_lock('))
    const ruleLock = statements.findIndex(sql => sql.includes('FROM recurring_availability_rules') && sql.endsWith('FOR UPDATE'))
    const blockLock = statements.findIndex(sql => sql.includes('FROM availability_blocks block') && sql.endsWith('FOR UPDATE OF block'))

    expect(advisoryLock).toBeGreaterThanOrEqual(0)
    expect(advisoryLock).toBeLessThan(ruleLock)
    expect(advisoryLock).toBeLessThan(blockLock)
  })

  async function setupRescheduleRace() {
    const originalBlock = await query(
      `INSERT INTO availability_blocks (doctor_id, start_at, end_at)
       VALUES ($1, '2026-09-22T14:00:00+05:30', '2026-09-22T14:30:00+05:30')
       RETURNING id`,
      [doctorId],
    )
    const originalSlot = await query(
      `INSERT INTO slots (availability_block_id, start_at, end_at)
       VALUES ($1, '2026-09-22T14:00:00+05:30', '2026-09-22T14:30:00+05:30')
       RETURNING id`,
      [originalBlock.rows[0].id],
    )
    const original = await appointmentRepository.book({
      patientId,
      patientName: 'Recurring Patient',
      slotId: Number(originalSlot.rows[0].id),
    })
    const targetRule = await create({ endsOn: '2026-09-21' })
    const [targetSlot] = await generatedRows(targetRule.rule.id)

    return { original, originalSlot: originalSlot.rows[0], targetRule, targetSlot }
  }

  it('waits for a booking that already holds the shared Doctor lock, then preserves it', async () => {
    const created = await create({ endsOn: '2026-09-21' })
    const [slot] = await generatedRows(created.rule.id)
    const bookingGate = sharedLockGate()
    const stopGate = exclusiveLockGate()
    const controlledAppointments = createAppointmentRepository(bookingGate.provider)
    const controlledAvailability = createAvailabilityRepository(stopGate.provider)

    const booking = controlledAppointments.book({
      patientId,
      patientName: 'Recurring Patient',
      slotId: Number(slot.slot_id),
    })
    await bookingGate.acquired
    const stopping = controlledAvailability.stopRecurring({ doctorId, ruleId: created.rule.id, now })
    await stopGate.attempted

    stopGate.resume()
    bookingGate.resume()
    await expect(booking).resolves.toMatchObject({ status: 'booked' })
    await expect(stopping).resolves.toBeUndefined()

    const state = await query(
      `SELECT block.id AS block_id, slot.id AS slot_id, slot.is_active, appointment.status
       FROM availability_blocks block
       JOIN slots slot ON slot.availability_block_id = block.id
       JOIN appointments appointment ON appointment.slot_id = slot.id
       WHERE block.id = $1 AND slot.id = $2`,
      [slot.block_id, slot.slot_id],
    )
    expect(state.rows[0]).toEqual({
      block_id: slot.block_id,
      slot_id: slot.slot_id,
      is_active: false,
      status: 'booked',
    })
  })

  it('makes a booking wait behind stop, then fail without creating an appointment', async () => {
    const created = await create({ endsOn: '2026-09-21' })
    const [slot] = await generatedRows(created.rule.id)
    const stopGate = exclusiveLockGate()
    const bookingGate = sharedLockGate()
    const controlledAvailability = createAvailabilityRepository(stopGate.provider)
    const controlledAppointments = createAppointmentRepository(bookingGate.provider)

    const stopping = controlledAvailability.stopRecurring({ doctorId, ruleId: created.rule.id, now })
    await stopGate.acquired
    const booking = controlledAppointments.book({
      patientId,
      patientName: 'Recurring Patient',
      slotId: Number(slot.slot_id),
    })
    await bookingGate.attempted

    bookingGate.resume()
    stopGate.resume()
    await expect(stopping).resolves.toBeUndefined()
    await expect(booking).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' })

    const state = await query(
      `SELECT
         EXISTS (SELECT 1 FROM availability_blocks WHERE id = $1) AS block_exists,
         EXISTS (SELECT 1 FROM slots WHERE id = $2) AS slot_exists,
         EXISTS (SELECT 1 FROM appointments WHERE slot_id = $2) AS appointment_exists`,
      [slot.block_id, slot.slot_id],
    )
    expect(state.rows[0]).toEqual({ block_exists: false, slot_exists: false, appointment_exists: false })
  })

  it('waits for a reschedule that holds the shared Doctor lock, then preserves its replacement', async () => {
    const { original, originalSlot, targetRule, targetSlot } = await setupRescheduleRace()
    const rescheduleGate = sharedLockGate()
    const stopGate = exclusiveLockGate()
    const controlledAppointments = createAppointmentRepository(rescheduleGate.provider)
    const controlledAvailability = createAvailabilityRepository(stopGate.provider)

    const reschedule = controlledAppointments.reschedule({
      appointmentId: Number(original.id),
      patientId,
      slotId: Number(targetSlot.slot_id),
      now,
    })
    await rescheduleGate.acquired
    const stopping = controlledAvailability.stopRecurring({ doctorId, ruleId: targetRule.rule.id, now })
    await stopGate.attempted

    stopGate.resume()
    rescheduleGate.resume()
    await expect(reschedule).resolves.toMatchObject({ status: 'booked' })
    await expect(stopping).resolves.toBeUndefined()

    const appointments = await query(
      `SELECT slot_id, status, rescheduled_from_appointment_id
       FROM appointments
       WHERE id = $1 OR rescheduled_from_appointment_id = $1
       ORDER BY id`,
      [original.id],
    )
    expect(appointments.rows).toEqual([
      expect.objectContaining({ status: 'rescheduled', slot_id: originalSlot.id }),
      expect.objectContaining({
        status: 'booked',
        slot_id: targetSlot.slot_id,
        rescheduled_from_appointment_id: original.id,
      }),
    ])
    const targetState = await query('SELECT is_active FROM slots WHERE id = $1', [targetSlot.slot_id])
    expect(targetState.rows[0]).toEqual({ is_active: false })
  })

  it('makes rescheduling wait behind stop, then fail without changing the original appointment', async () => {
    const { original, originalSlot, targetRule, targetSlot } = await setupRescheduleRace()
    const stopGate = exclusiveLockGate()
    const rescheduleGate = sharedLockGate()
    const controlledAvailability = createAvailabilityRepository(stopGate.provider)
    const controlledAppointments = createAppointmentRepository(rescheduleGate.provider)

    const stopping = controlledAvailability.stopRecurring({ doctorId, ruleId: targetRule.rule.id, now })
    await stopGate.acquired
    const reschedule = controlledAppointments.reschedule({
      appointmentId: Number(original.id),
      patientId,
      slotId: Number(targetSlot.slot_id),
      now,
    })
    await rescheduleGate.attempted

    rescheduleGate.resume()
    stopGate.resume()
    await expect(stopping).resolves.toBeUndefined()
    await expect(reschedule).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' })

    const appointments = await query(
      `SELECT slot_id, status, rescheduled_from_appointment_id
       FROM appointments
       WHERE id = $1 OR rescheduled_from_appointment_id = $1
       ORDER BY id`,
      [original.id],
    )
    expect(appointments.rows).toEqual([
      expect.objectContaining({ status: 'booked', slot_id: originalSlot.id }),
    ])
    const targetState = await query('SELECT id FROM slots WHERE id = $1', [targetSlot.slot_id])
    expect(targetState.rows).toEqual([])
  })

  it('waits for materialization holding the exclusive lock, then removes its new occurrences', async () => {
    const created = await create({ endsOn: null })
    const originalCursor = created.rule.materializedThrough
    const materializeGate = exclusiveLockGate()
    const stopGate = exclusiveLockGate()
    const controlledMaterializer = createAvailabilityRepository(materializeGate.provider)
    const controlledStopper = createAvailabilityRepository(stopGate.provider)
    const extensionTime = new Date('2026-10-01T00:00:00.000Z')

    const materializing = controlledMaterializer.materializeRecurring(
      { doctorId, ruleId: created.rule.id },
      extensionTime,
    )
    await materializeGate.acquired
    const stopping = controlledStopper.stopRecurring({ doctorId, ruleId: created.rule.id, now: extensionTime })
    await stopGate.attempted

    stopGate.resume()
    materializeGate.resume()
    const materialized = await materializing
    await expect(stopping).resolves.toBeUndefined()
    expect(materialized.rule.materializedThrough > originalCursor).toBe(true)

    const state = await query(
      `SELECT
         rule.status,
         to_char(rule.materialized_through, 'YYYY-MM-DD') AS cursor,
         COUNT(block.id)::int AS blocks,
         COUNT(block.id) FILTER (WHERE block.start_at > $2)::int AS future_blocks,
         COUNT(block.id) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM slots slot
             WHERE slot.availability_block_id = block.id
               AND slot.is_active
               AND slot.start_at > $2
           )
         )::int AS bookable_blocks,
         (SELECT COUNT(*)::int FROM appointments) AS appointments
       FROM recurring_availability_rules rule
       LEFT JOIN availability_blocks block ON block.recurring_rule_id = rule.id
       WHERE rule.id = $1
       GROUP BY rule.id`,
      [created.rule.id, extensionTime],
    )
    expect(state.rows[0]).toMatchObject({
      status: 'stopped',
      cursor: materialized.rule.materializedThrough,
      blocks: 2,
      future_blocks: 0,
      bookable_blocks: 0,
      appointments: 0,
    })
  })

  it('makes materialization wait behind stop, then rejects it without advancing the cursor', async () => {
    const created = await create({ endsOn: null })
    const before = await query(
      `SELECT to_char(materialized_through, 'YYYY-MM-DD') AS cursor
       FROM recurring_availability_rules
       WHERE id = $1`,
      [created.rule.id],
    )
    const stopGate = exclusiveLockGate()
    const materializeGate = exclusiveLockGate()
    const controlledStopper = createAvailabilityRepository(stopGate.provider)
    const controlledMaterializer = createAvailabilityRepository(materializeGate.provider)
    const extensionTime = new Date('2026-10-01T00:00:00.000Z')

    const stopping = controlledStopper.stopRecurring({ doctorId, ruleId: created.rule.id, now: extensionTime })
    await stopGate.acquired
    const materializing = controlledMaterializer.materializeRecurring(
      { doctorId, ruleId: created.rule.id },
      extensionTime,
    )
    await materializeGate.attempted

    materializeGate.resume()
    stopGate.resume()
    await expect(stopping).resolves.toBeUndefined()
    await expect(materializing).rejects.toMatchObject({ code: 'RECURRING_AVAILABILITY_RULE_NOT_FOUND' })

    const state = await query(
      `SELECT
         rule.status,
         to_char(rule.materialized_through, 'YYYY-MM-DD') AS cursor,
         COUNT(block.id)::int AS blocks,
         COUNT(block.id) FILTER (WHERE block.start_at > $2)::int AS future_blocks,
         COUNT(block.id) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM slots slot
             WHERE slot.availability_block_id = block.id
               AND slot.is_active
               AND slot.start_at > $2
           )
         )::int AS bookable_blocks,
         (SELECT COUNT(*)::int FROM appointments) AS appointments
       FROM recurring_availability_rules rule
       LEFT JOIN availability_blocks block ON block.recurring_rule_id = rule.id
       WHERE rule.id = $1
       GROUP BY rule.id`,
      [created.rule.id, extensionTime],
    )
    expect(state.rows[0]).toMatchObject({
      status: 'stopped',
      cursor: before.rows[0].cursor,
      blocks: 2,
      future_blocks: 0,
      bookable_blocks: 0,
      appointments: 0,
    })
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
