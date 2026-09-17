import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { MigrationBuilder } from 'node-pg-migrate'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  down as downRecurringAvailability,
  up as upRecurringAvailability,
} from '../migrations/1790100000000_add-recurring-availability-rules.js'
import { up as upPublicDiscovery } from '../migrations/1788175200000_create-public-discovery-schema.js'
import { up as upAuthentication } from '../migrations/1788175300000_create-authentication-schema.js'
import { up as upAppointmentBooking } from '../migrations/1788175400000_create-appointment-booking-schema.js'
import { up as upConsultationLifecycle } from '../migrations/1788775500000_create-consultation-lifecycle.js'
import { up as upClinicalWorkspace } from '../migrations/1789375600000_add-consultation-clinical-workspace.js'
import { up as upSearchAliases } from '../migrations/1790000000000_add_search_aliases.js'

const { Pool } = pg

function builder() {
  return new MigrationBuilder({
    query: () => { throw new Error('Migration generation must not query the database') },
    select: () => { throw new Error('Migration generation must not query the database') },
  }, undefined, false, console)
}

function migrationSql(migration) {
  const pgm = builder()
  migration(pgm)
  return pgm.getSql()
}

describe('recurring availability migration SQL', () => {
  it('creates the additive rule schema, constraints, relationship and partial index', () => {
    const sql = migrationSql(upRecurringAvailability)

    expect(sql).toContain('CREATE TABLE "recurring_availability_rules"')
    expect(sql).toContain('REFERENCES doctor_profiles(user_id) ON DELETE RESTRICT')
    expect(sql).toContain('recurring_availability_rules_status_valid')
    expect(sql).toContain('recurring_availability_rules_time_valid')
    expect(sql).toContain('recurring_availability_rules_half_hour_aligned')
    expect(sql).toContain('recurring_availability_rules_fee_nonnegative')
    expect(sql).toContain('recurring_availability_rules_date_range_valid')
    expect(sql).toContain('recurring_availability_rules_weekdays_nonempty')
    expect(sql).toContain('recurring_availability_rules_weekdays_iso')
    expect(sql).toContain('ADD "recurring_rule_id" bigint')
    expect(sql).toContain('availability_blocks_recurring_rule_fk')
    expect(sql).toContain('CREATE UNIQUE INDEX "availability_blocks_recurring_rule_start_unique"')
    expect(sql).toContain('WHERE recurring_rule_id IS NOT NULL')
    expect(sql).not.toContain('UPDATE "availability_blocks"')
    expect(sql).not.toContain('DELETE FROM')
  })

  it('reverses dependencies in index, foreign key, column, table order', () => {
    const sql = migrationSql(downRecurringAvailability)
    const index = sql.indexOf('DROP INDEX "availability_blocks_recurring_rule_start_unique"')
    const foreignKey = sql.indexOf('DROP CONSTRAINT "availability_blocks_recurring_rule_fk"')
    const column = sql.indexOf('DROP "recurring_rule_id"')
    const table = sql.indexOf('DROP TABLE "recurring_availability_rules"')

    expect(index).toBeGreaterThanOrEqual(0)
    expect(index).toBeLessThan(foreignKey)
    expect(foreignKey).toBeLessThan(column)
    expect(column).toBeLessThan(table)
  })
})

const describeWithPostgres = process.env.DATABASE_URL ? describe : describe.skip

describeWithPostgres('recurring availability migration PostgreSQL constraints', () => {
  let pool
  let client
  let schema
  let doctorId
  let ruleId

  async function insertRule(overrides = {}) {
    const rule = {
      weekdays: [1, 3, 5],
      startTime: '09:00',
      endTime: '12:00',
      startsOn: '2026-09-21',
      endsOn: '2026-10-31',
      effectiveFee: 650,
      ...overrides,
    }
    return client.query(
      `INSERT INTO recurring_availability_rules (
         doctor_id, weekdays, start_time, end_time, starts_on, ends_on, effective_fee
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [doctorId, rule.weekdays, rule.startTime, rule.endTime, rule.startsOn, rule.endsOn, rule.effectiveFee],
    )
  }

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
      statement_timeout: 5000,
    })
    client = await pool.connect()
    schema = `recurring_availability_test_${randomUUID().replaceAll('-', '')}`
    await client.query(`CREATE SCHEMA "${schema}"`)
    await client.query(`SET search_path TO "${schema}"`)
    for (const migration of [
      upPublicDiscovery,
      upAuthentication,
      upAppointmentBooking,
      upConsultationLifecycle,
      upClinicalWorkspace,
      upSearchAliases,
    ]) {
      await client.query(migrationSql(migration))
    }

    const user = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ('Schema Doctor', 'schema-doctor@example.test', 'test-only', 'doctor')
       RETURNING id`,
    )
    doctorId = user.rows[0].id
    await client.query(
      `INSERT INTO doctor_profiles (user_id, qualification)
       VALUES ($1, 'MBBS')`,
      [doctorId],
    )
    await client.query(
      `INSERT INTO availability_blocks (doctor_id, start_at, end_at)
       VALUES
         ($1, '2026-09-20T09:00:00+05:30', '2026-09-20T10:00:00+05:30'),
         ($1, '2026-09-21T09:00:00+05:30', '2026-09-21T10:00:00+05:30')`,
      [doctorId],
    )
    await client.query(migrationSql(upRecurringAvailability))
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

  it('applies over existing schema and preserves multiple one-off blocks with null rule IDs', async () => {
    const result = await client.query(
      `SELECT recurring_rule_id
       FROM availability_blocks
       ORDER BY id`,
    )

    expect(result.rows).toHaveLength(2)
    expect(result.rows.every(row => row.recurring_rule_id === null)).toBe(true)
  })

  it('accepts a valid recurring rule with active as its default status', async () => {
    const result = await insertRule()
    ruleId = result.rows[0].id
    const stored = await client.query(
      'SELECT status, materialized_through FROM recurring_availability_rules WHERE id = $1',
      [ruleId],
    )

    expect(stored.rows[0]).toEqual({ status: 'active', materialized_through: null })
  })

  it.each([
    [[0, 1], 'out-of-range low'],
    [[1, 8], 'out-of-range high'],
    [[1, null], 'null member'],
  ])('rejects %s weekdays (%s)', async (weekdays) => {
    await expect(insertRule({ weekdays })).rejects.toMatchObject({ code: '23514' })
  })

  it('rejects empty weekdays', async () => {
    await expect(insertRule({ weekdays: [] })).rejects.toMatchObject({ code: '23514' })
  })

  it.each([
    [{ startTime: '12:00', endTime: '12:00' }, 'equal'],
    [{ startTime: '13:00', endTime: '12:00' }, 'overnight'],
  ])('rejects an invalid %s time range', async (overrides) => {
    await expect(insertRule(overrides)).rejects.toMatchObject({ code: '23514' })
  })

  it.each([
    [{ startTime: '09:15' }, 'start'],
    [{ endTime: '12:45' }, 'end'],
    [{ startTime: '09:00:00.500' }, 'fractional second'],
  ])('rejects a non-half-hour %s boundary', async (overrides) => {
    await expect(insertRule(overrides)).rejects.toMatchObject({ code: '23514' })
  })

  it('rejects a negative fee', async () => {
    await expect(insertRule({ effectiveFee: -0.01 })).rejects.toMatchObject({ code: '23514' })
  })

  it('rejects an end date before the start date', async () => {
    await expect(insertRule({ endsOn: '2026-09-20' })).rejects.toMatchObject({ code: '23514' })
  })

  it('enforces the recurring rule foreign key on availability blocks', async () => {
    await expect(client.query(
      `INSERT INTO availability_blocks (doctor_id, start_at, end_at, recurring_rule_id)
       VALUES ($1, '2026-09-28T09:00:00+05:30', '2026-09-28T10:00:00+05:30', 999999)`,
      [doctorId],
    )).rejects.toMatchObject({ code: '23503' })
  })

  it('rejects duplicate materialized occurrences for the same rule and start', async () => {
    await client.query(
      `INSERT INTO availability_blocks (doctor_id, start_at, end_at, recurring_rule_id)
       VALUES ($1, '2026-09-28T09:00:00+05:30', '2026-09-28T12:00:00+05:30', $2)`,
      [doctorId, ruleId],
    )
    await expect(client.query(
      `INSERT INTO availability_blocks (doctor_id, start_at, end_at, recurring_rule_id)
       VALUES ($1, '2026-09-28T09:00:00+05:30', '2026-09-28T12:00:00+05:30', $2)`,
      [doctorId, ruleId],
    )).rejects.toMatchObject({ code: '23505' })
  })

  it('reverses cleanly without changing existing availability data', async () => {
    await client.query('DELETE FROM availability_blocks WHERE recurring_rule_id IS NOT NULL')
    await client.query(migrationSql(downRecurringAvailability))
    const blocks = await client.query('SELECT id FROM availability_blocks ORDER BY id')
    const ruleTable = await client.query(
      `SELECT to_regclass($1) AS relation`,
      [`${schema}.recurring_availability_rules`],
    )

    expect(blocks.rows).toHaveLength(2)
    expect(ruleTable.rows[0].relation).toBeNull()
  })
})
