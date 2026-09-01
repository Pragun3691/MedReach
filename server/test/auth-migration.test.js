import { MigrationBuilder } from 'node-pg-migrate'
import { describe, expect, it } from 'vitest'
import { down, up } from '../migrations/1788175300000_create-authentication-schema.js'

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

describe('authentication migration', () => {
  it('creates patient profiles, PostgreSQL sessions, indexes and constraints', () => {
    const pgm = createMigrationBuilder()

    up(pgm)
    const sql = pgm.getSql()

    expect(sql).toContain('CREATE TABLE "patient_profiles"')
    expect(sql).toContain('REFERENCES "users" ON DELETE CASCADE')
    expect(sql).toContain('patient_profiles_date_of_birth_valid')
    expect(sql).toContain('patient_profiles_blood_group_valid')
    expect(sql).toContain('CREATE TABLE "user_sessions"')
    expect(sql).toContain('"sess" json NOT NULL')
    expect(sql).toContain('"expire" timestamptz NOT NULL')
    expect(sql).toContain('user_sessions_expire_idx')
    expect(sql).toContain('users_email_normalized')
  })

  it('removes the authentication schema in dependency-safe order', () => {
    const pgm = createMigrationBuilder()

    down(pgm)
    const sql = pgm.getSql()

    expect(sql).toContain('DROP CONSTRAINT "users_email_normalized"')
    expect(sql.indexOf('DROP TABLE "user_sessions"')).toBeLessThan(
      sql.indexOf('DROP TABLE "patient_profiles"'),
    )
  })
})
