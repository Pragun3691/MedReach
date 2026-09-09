import { beforeEach, describe, expect, it, vi } from 'vitest'

const database = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('../src/db/pool.js', () => ({ getPool: () => database }))

import { publicDoctorRepository } from '../src/data-access/public-doctor.repository.js'

beforeEach(() => database.query.mockReset())

describe('public doctor search repository', () => {
  it('loads only canonical specializations and their controlled terms as search vocabulary', async () => {
    database.query.mockResolvedValue({ rows: [{ specialization_id: '2', name: 'Dermatology', terms: ['rash'] }] })
    await expect(publicDoctorRepository.findSearchVocabulary()).resolves.toEqual([
      { specialization_id: '2', name: 'Dermatology', terms: ['rash'] },
    ])
    expect(database.query.mock.calls[0][0]).toContain('FROM specializations sp')
    expect(database.query.mock.calls[0][0]).toContain('LEFT JOIN specialization_search_terms')
  })

  it('treats percent, underscore, and backslash in Doctor names as literal substrings', async () => {
    database.query.mockResolvedValueOnce({ rows: [{ total: '0' }] }).mockResolvedValueOnce({ rows: [] })
    await publicDoctorRepository.search({ name: '%_\\', limit: 10, offset: 0 })

    const [countSql, countValues] = database.query.mock.calls[0]
    expect(countSql).toContain('strpos(')
    expect(countSql).not.toContain('ILIKE')
    expect(countValues).toEqual(['%_\\'])
  })

  it('unifies literal Doctor-name and controlled-specialization matches without duplicate-producing joins', async () => {
    database.query.mockResolvedValueOnce({ rows: [{ total: '1' }] }).mockResolvedValueOnce({ rows: [{ id: '20' }] })
    await publicDoctorRepository.search({
      qName: 'dermatology',
      qSpecializationIds: [2],
      qSpecializationKind: 'canonical-exact',
      limit: 10,
      offset: 0,
    })

    const [countSql, countValues] = database.query.mock.calls[0]
    const [resultSql, resultValues] = database.query.mock.calls[1]
    expect(countSql).toContain('strpos(')
    expect(countSql).toContain(' OR EXISTS (')
    expect(countSql).toContain('ds_q.specialization_id = ANY')
    expect(countSql).not.toContain('JOIN doctor_specializations ds_q')
    expect(countValues).toEqual(['dermatology', [2]])
    expect(resultSql).toContain('ORDER BY CASE')
    expect(resultSql).toContain('THEN 0')
    expect(resultSql).toContain('THEN 1')
    expect(resultSql).toContain('THEN 2')
    expect(resultSql).toContain('next_available_at ASC NULLS LAST, u.full_name ASC, u.id ASC')
    expect(resultValues).toEqual(['dermatology', [2], 10, 0])
  })

  it('falls back to literal Doctor-name matching when q has no controlled vocabulary match', async () => {
    database.query.mockResolvedValueOnce({ rows: [{ total: '0' }] }).mockResolvedValueOnce({ rows: [] })
    await publicDoctorRepository.search({
      qName: 'unrelated',
      qSpecializationIds: [],
      qSpecializationKind: 'none',
      limit: 10,
      offset: 0,
    })

    const [countSql, values] = database.query.mock.calls[0]
    expect(countSql).toContain('strpos(')
    expect(countSql).not.toContain('ds_q')
    expect(countSql).not.toContain('(FALSE)')
    expect(values).toEqual(['unrelated'])
  })

  it('filters resolved specializations while preserving public, date, fee, experience, and pagination rules', async () => {
    database.query.mockResolvedValueOnce({ rows: [{ total: '1' }] }).mockResolvedValueOnce({ rows: [{ id: '10' }] })
    const result = await publicDoctorRepository.search({
      specialization: 'Dermatology',
      specializationIds: [2],
      problem: 'rash',
      problemSpecializationIds: [2],
      date: '2030-01-01',
      maxFee: 700,
      minExperience: 5,
      limit: 5,
      offset: 10,
    })

    const countSql = database.query.mock.calls[0][0]
    const [resultSql, resultValues] = database.query.mock.calls[1]
    expect(countSql).toContain("u.role = 'doctor'")
    expect(countSql).toContain('u.is_enabled = TRUE')
    expect(countSql).toContain("dv.status = 'approved'")
    expect(countSql.match(/specialization_id = ANY/g)).toHaveLength(2)
    expect(countSql).toContain('s_date.start_at')
    expect(countSql).toContain('dp.default_fee <=')
    expect(countSql).toContain('dp.experience_years >=')
    expect(resultSql).toContain('ORDER BY next_available_at ASC NULLS LAST, u.full_name ASC, u.id ASC')
    expect(resultValues.slice(-2)).toEqual([5, 10])
    expect(result).toEqual({ rows: [{ id: '10' }], total: 1 })
  })

  it('uses an always-false condition when controlled resolution has no safe match', async () => {
    database.query.mockResolvedValueOnce({ rows: [{ total: '0' }] }).mockResolvedValueOnce({ rows: [] })
    await publicDoctorRepository.search({ problem: 'unrelated', problemSpecializationIds: [], limit: 10, offset: 0 })
    expect(database.query.mock.calls[0][0]).toContain('(FALSE)')
  })
})
