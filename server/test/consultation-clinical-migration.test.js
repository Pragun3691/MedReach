import { MigrationBuilder } from 'node-pg-migrate'
import { describe, expect, it } from 'vitest'
import { down, up } from '../migrations/1789375600000_add-consultation-clinical-workspace.js'

function builder() {
  return new MigrationBuilder({
    query: () => { throw new Error('Migration generation must not query the database') },
    select: () => { throw new Error('Migration generation must not query the database') },
  }, undefined, false, console)
}

describe('consultation clinical workspace migration', () => {
  it('adds bounded notes, one optional follow-up, and ordered structured medicines', () => {
    const pgm = builder()
    up(pgm)
    const sql = pgm.getSql()
    expect(sql).toContain('ADD "notes" text DEFAULT $pga$$pga$ NOT NULL')
    expect(sql).toContain('consultations_notes_length')
    expect(sql).toContain('consultations_follow_up_complete')
    expect(sql).toContain('CREATE TABLE "consultation_prescription_items"')
    expect(sql).toContain('REFERENCES "consultations" ON DELETE CASCADE')
    expect(sql).toContain('consultation_prescription_position_unique')
  })

  it('is reversible and never updates appointments or creates clinical records', () => {
    const pgm = builder()
    down(pgm)
    const sql = pgm.getSql()
    expect(sql).toContain('DROP TABLE "consultation_prescription_items"')
    expect(sql).toContain('DROP "notes"')
    expect(sql).not.toContain('UPDATE "appointments"')
    expect(sql).not.toContain('INSERT INTO')
  })
})
