import { MigrationBuilder } from 'node-pg-migrate'
import { describe, expect, it } from 'vitest'
import { down, up } from '../migrations/1788175400000_create-appointment-booking-schema.js'

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

describe('appointment booking migration', () => {
  it('creates appointment and notification tables with restricted relationships', () => {
    const pgm = createMigrationBuilder()
    up(pgm)
    const sql = pgm.getSql()

    expect(sql).toContain('CREATE TABLE "appointments"')
    expect(sql).toContain('CREATE TABLE "notifications"')
    expect(sql).toContain('REFERENCES patient_profiles(user_id) ON DELETE RESTRICT')
    expect(sql).toContain('REFERENCES "slots" ON DELETE RESTRICT')
    expect(sql).toContain('appointments_status_valid')
    expect(sql).toContain('appointments_cancellation_metadata_valid')
    expect(sql).toContain('appointments_not_self_rescheduled')
    expect(sql).toContain('notifications_action_path_internal')
  })

  it('creates both partial unique indexes and lookup indexes', () => {
    const pgm = createMigrationBuilder()
    up(pgm)
    const sql = pgm.getSql()

    expect(sql).toContain('CREATE UNIQUE INDEX "appointments_booked_slot_unique"')
    expect(sql).toContain('WHERE status = \'booked\'')
    expect(sql).toContain('CREATE UNIQUE INDEX "appointments_reschedule_replacement_unique"')
    expect(sql).toContain('WHERE rescheduled_from_appointment_id IS NOT NULL')
    expect(sql).toContain('appointments_patient_status_idx')
    expect(sql).toContain('appointments_slot_status_idx')
    expect(sql).toContain('notifications_recipient_read_created_idx')
  })

  it('drops notifications before appointments', () => {
    const pgm = createMigrationBuilder()
    down(pgm)
    const sql = pgm.getSql()

    expect(sql.indexOf('DROP TABLE "notifications"')).toBeLessThan(
      sql.indexOf('DROP TABLE "appointments"'),
    )
  })
})
