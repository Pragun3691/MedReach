import { MigrationBuilder } from 'node-pg-migrate'
import { describe, expect, it } from 'vitest'
import { down, up } from '../migrations/1788775500000_create-consultation-lifecycle.js'

function builder() {
  return new MigrationBuilder({
    query: () => { throw new Error('Migration generation must not query the database') },
    select: () => { throw new Error('Migration generation must not query the database') },
  }, undefined, false, console)
}

describe('consultation lifecycle migration', () => {
  it('adds room opening and exactly one consultation per appointment', () => {
    const pgm = builder()
    up(pgm)
    const sql = pgm.getSql()

    expect(sql).toContain('ADD "room_opened_at" timestamptz')
    expect(sql).toContain('CREATE TABLE "consultations"')
    expect(sql).toContain('REFERENCES "appointments" ON DELETE RESTRICT')
    expect(sql).toContain('consultations_one_per_appointment')
    expect(sql).toContain('UNIQUE ("appointment_id")')
    expect(sql).toContain('consultations_finish_after_start')
  })

  it('is reversible without touching appointment outcomes', () => {
    const pgm = builder()
    down(pgm)
    const sql = pgm.getSql()

    expect(sql.indexOf('DROP TABLE "consultations"')).toBeLessThan(sql.indexOf('DROP "room_opened_at"'))
    expect(sql).not.toContain('UPDATE "appointments"')
  })
})
