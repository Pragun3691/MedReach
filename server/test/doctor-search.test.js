import { describe, expect, it } from 'vitest'
import {
  editDistance,
  normalizeDoctorName,
  normalizeSearchTerm,
  resolveSpecializationQuery,
} from '../src/services/doctor-search.js'

const vocabulary = [
  {
    specializationId: 1,
    name: 'Dermatology',
    terms: ['rash', 'dermatologist', 'skin doctor', 'skin specialist', 'दाने', 'खुजली', 'त्वचा', 'daane', 'khujli', 'twacha'],
  },
  {
    specializationId: 2,
    name: 'Cardiology',
    terms: ['cardiologist', 'heart doctor', 'chest pain'],
  },
]

describe('doctor search normalization', () => {
  it('normalizes controlled terms with NFC, lowercase, trimming, and collapsed whitespace', () => {
    expect(normalizeSearchTerm('  DeRMaToLoGiSt  ')).toBe('dermatologist')
    expect(normalizeSearchTerm('skin\t\n doctor')).toBe('skin doctor')
    expect(normalizeSearchTerm('Cafe\u0301')).toBe('café')
    expect(normalizeSearchTerm('  त्वचा   विशेषज्ञ  ')).toBe('त्वचा विशेषज्ञ')
  })

  it('normalizes only the harmless leading Doctor-title punctuation difference', () => {
    expect(normalizeDoctorName(' Dr.   Rohan Mehta ')).toBe('dr rohan mehta')
    expect(normalizeDoctorName('Dr Rohan Mehta')).toBe('dr rohan mehta')
    expect(normalizeDoctorName("D'Costa")).toBe("d'costa")
  })
})

describe('controlled specialization matching', () => {
  it('calculates deterministic Unicode-aware edit distance', () => {
    expect(editDistance('dermatologist', 'dermotologist')).toBe(1)
    expect(editDistance('dermatologist', 'dermatlogist')).toBe(1)
    expect(editDistance('खुजली', 'खुजली')).toBe(0)
  })

  it.each([
    ['Dermatology', 'canonical-exact'],
    ['DERMATOLOGIST', 'term-exact'],
    ['skin doc', 'prefix'],
    ['dermotologist', 'fuzzy'],
    ['dermatlogist', 'fuzzy'],
    ['दाने', 'term-exact'],
    ['खुजली', 'term-exact'],
    ['khujli', 'term-exact'],
  ])('resolves %s as a controlled Dermatology %s match', (query, kind) => {
    expect(resolveSpecializationQuery(query, vocabulary)).toEqual({
      kind,
      specializationIds: [1],
    })
  })

  it.each(['nonsense', 'zzzzz', 'qwerty', 'abc', 'खुजलीी'])('does not expand unsafe input %s', query => {
    expect(resolveSpecializationQuery(query, vocabulary)).toEqual({
      kind: 'none',
      specializationIds: [],
    })
  })

  it('refuses an equally plausible fuzzy match across specializations', () => {
    const ambiguous = [
      { specializationId: 1, name: 'Alpha', terms: ['aaaaa'] },
      { specializationId: 2, name: 'Beta', terms: ['aaaab'] },
    ]
    expect(resolveSpecializationQuery('aaaac', ambiguous)).toEqual({
      kind: 'none',
      specializationIds: [],
    })
  })

  it('does not fall through to fuzzy matching after an ambiguous prefix', () => {
    const ambiguous = [
      { specializationId: 1, name: 'Alpha', terms: ['shared doctor'] },
      { specializationId: 2, name: 'Beta', terms: ['shared specialist'] },
    ]
    expect(resolveSpecializationQuery('shared', ambiguous)).toEqual({
      kind: 'none',
      specializationIds: [],
    })
  })

  it('does not let a lower-priority alias override an exact canonical match', () => {
    const conflicting = [
      { specializationId: 1, name: 'Dermatology', terms: [] },
      { specializationId: 2, name: 'Cardiology', terms: ['dermatology'] },
    ]
    expect(resolveSpecializationQuery('dermatology', conflicting)).toEqual({
      kind: 'canonical-exact',
      specializationIds: [1],
    })
  })
})
