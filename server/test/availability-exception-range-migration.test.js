import { MigrationBuilder } from 'node-pg-migrate'
import { describe, expect, it } from 'vitest'
import {
  down as downAvailabilityExceptionGroups,
  up as upAvailabilityExceptionGroups,
} from '../migrations/1790300000000_add-availability-exception-groups.js'

function migrationSql(migration) {
  const pgm = new MigrationBuilder({
    query: () => { throw new Error('Migration generation must not query the database') },
    select: () => { throw new Error('Migration generation must not query the database') },
  }, undefined, false, console)
  migration(pgm)
  return pgm.getSql()
}

describe('availability exception range migration SQL', () => {
  it('adds only the nullable UUID group, all-day constraint and partial lookup index', () => {
    const sql = migrationSql(upAvailabilityExceptionGroups)

    expect(sql).toContain('ADD "exception_group_id" uuid')
    expect(sql).toContain('availability_exceptions_group_all_day')
    expect(sql).toContain('exception_group_id IS NULL OR all_day = TRUE')
    expect(sql).toContain('availability_exceptions_doctor_group_idx')
    expect(sql).toContain('WHERE exception_group_id IS NOT NULL')
    expect(sql).not.toContain('UPDATE')
    expect(sql).not.toContain('appointments')
    expect(sql).not.toContain('slots')
    expect(sql).not.toContain('availability_blocks')
    expect(sql).not.toContain('recurring_availability_rules')
  })

  it('removes only the new index, constraint and column on reversal', () => {
    const sql = migrationSql(downAvailabilityExceptionGroups)

    expect(sql).toContain('DROP INDEX "availability_exceptions_doctor_group_idx"')
    expect(sql).toContain('DROP CONSTRAINT "availability_exceptions_group_all_day"')
    expect(sql).toContain('DROP "exception_group_id"')
    expect(sql).not.toContain('DROP TABLE')
  })
})
