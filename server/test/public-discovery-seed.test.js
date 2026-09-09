import { describe, expect, it } from 'vitest'
import {
  availabilityTemplates,
  doctorSeeds,
  specializationSeeds,
} from '../src/seed/public-discovery-data.js'

describe('public discovery seed fixtures', () => {
  it('contains varied public and non-public doctor states', () => {
    const publicDoctors = doctorSeeds.filter(
      doctor => doctor.isEnabled && doctor.verificationStatus === 'approved',
    )

    expect(publicDoctors).toHaveLength(6)
    expect(doctorSeeds.some(doctor => doctor.verificationStatus === 'pending')).toBe(true)
    expect(doctorSeeds.some(doctor => !doctor.isEnabled)).toBe(true)
  })

  it('uses unique fictional emails and valid specialization references', () => {
    const emails = doctorSeeds.map(doctor => doctor.email)
    const specializationNames = new Set(specializationSeeds.map(item => item.name))

    expect(new Set(emails).size).toBe(emails.length)
    expect(emails.every(email => email.endsWith('@example.test'))).toBe(true)

    for (const doctor of doctorSeeds) {
      for (const specialization of doctor.specializations) {
        expect(specializationNames.has(specialization)).toBe(true)
      }
    }
  })

  it('defines two-hour blocks that generate four 30-minute slots each', () => {
    for (const template of availabilityTemplates) {
      const [startHour] = template.start.split(':').map(Number)
      const [endHour] = template.end.split(':').map(Number)

      expect(endHour - startHour).toBe(2)
    }
  })

  it('keeps required multilingual aliases normalized without losing existing concerns', () => {
    const dermatology = specializationSeeds.find(item => item.name === 'Dermatology')
    expect(dermatology.terms).toEqual(expect.arrayContaining([
      'rash', 'acne', 'itching', 'dermatologist', 'skin doctor', 'skin specialist',
      'दाने', 'खुजली', 'त्वचा', 'daane', 'khujli', 'twacha',
    ]))

    for (const specialization of specializationSeeds) {
      expect(new Set(specialization.terms).size).toBe(specialization.terms.length)
      for (const term of specialization.terms) {
        expect(term).toBe(term.normalize('NFC').toLowerCase().trim().replace(/\s+/gu, ' '))
      }
    }
  })
})
