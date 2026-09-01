import { MigrationBuilder } from 'node-pg-migrate'
import { describe, expect, it } from 'vitest'
import { down, up } from '../migrations/1788175200000_create-public-discovery-schema.js'

const tableNames = [
  'users',
  'doctor_profiles',
  'specializations',
  'doctor_specializations',
  'specialization_search_terms',
  'doctor_verifications',
  'availability_blocks',
  'slots',
]

function createMigrationBuilder() {
  const unusedDatabaseClient = {
    query: () => {
      throw new Error('Migration SQL generation must not query a database')
    },
    select: () => {
      throw new Error('Migration SQL generation must not query a database')
    },
  }

  return new MigrationBuilder(unusedDatabaseClient, undefined, false, console)
}

describe('public discovery migration', () => {
  it('generates all locked public-discovery tables and constraints', () => {
    const pgm = createMigrationBuilder()

    up(pgm)
    const sql = pgm.getSql()

    for (const tableName of tableNames) {
      expect(sql).toContain(`CREATE TABLE "${tableName}"`)
    }

    expect(sql).toContain('doctor_verifications_status_valid')
    expect(sql).toContain('availability_blocks_time_valid')
    expect(sql).toContain('slots_exactly_thirty_minutes')
  })

  it('drops the public-discovery tables in dependency-safe order', () => {
    const pgm = createMigrationBuilder()

    down(pgm)
    const sql = pgm.getSql()

    expect(sql.indexOf('DROP TABLE "slots"')).toBeLessThan(
      sql.indexOf('DROP TABLE "availability_blocks"'),
    )
    expect(sql.indexOf('DROP TABLE "doctor_profiles"')).toBeLessThan(
      sql.indexOf('DROP TABLE "users"'),
    )
  })
})
