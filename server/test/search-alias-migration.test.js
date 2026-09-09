import { MigrationBuilder } from 'node-pg-migrate'
import { describe, expect, it } from 'vitest'
import { down, up } from '../migrations/1790000000000_add_search_aliases.js'

function migrationSql(direction) {
  const client = { query: () => { throw new Error('SQL generation must not query a database') } }
  const pgm = new MigrationBuilder(client, undefined, false, console)
  direction(pgm)
  return pgm.getSql()
}

describe('search alias data migration', () => {
  it('only inserts controlled, conflict-safe search terms on up', () => {
    const sql = migrationSql(up)
    expect(sql).toContain('INSERT INTO specialization_search_terms')
    expect(sql).toContain('ON CONFLICT (specialization_id, term) DO NOTHING')
    expect(sql).toContain('LOCK TABLE specialization_search_terms IN SHARE ROW EXCLUSIVE MODE')
    expect(sql).toContain('Search alias migration found a pre-existing target term')
    expect(sql).toContain('$pga$dermatologist$pga$')
    expect(sql).toContain('$pga$खुजली$pga$')
    expect(sql).not.toMatch(/\bUPDATE\b/i)
    expect(sql).not.toMatch(/\bDELETE\b/i)
    expect(sql).not.toContain('$pga$rash$pga$')
  })

  it('removes only the exact specialization-term pairs owned by this migration on down', () => {
    const sql = migrationSql(down)
    expect(sql).toContain('DELETE FROM specialization_search_terms AS search_term')
    expect(sql).toContain('sp.name = alias.specialization_name')
    expect(sql).toContain('search_term.term = alias.term')
    expect(sql).toContain('$pga$dermatologist$pga$')
    expect(sql).not.toContain('$pga$rash$pga$')
    expect(sql).not.toContain('$pga$acne$pga$')
    expect(sql).not.toContain('$pga$itching$pga$')
    expect(sql).not.toMatch(/\bUPDATE\b/i)
  })
})
