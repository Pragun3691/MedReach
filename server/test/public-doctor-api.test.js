import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { AppError } from '../src/errors/app-error.js'
import { createPublicDoctorService } from '../src/services/public-doctor.service.js'

function createServices() {
  return {
    doctors: {
      search: vi.fn().mockResolvedValue({ items: [], limit: 10, offset: 0, total: 0 }),
      getById: vi.fn().mockResolvedValue({ id: 1, fullName: 'Dr. Aditi Sharma' }),
      getSlots: vi.fn().mockResolvedValue({ doctorId: 1, date: '2026-09-01', items: [] }),
    },
    specializations: {
      list: vi.fn().mockResolvedValue({
        items: [{ id: 1, name: 'General Medicine' }],
      }),
    },
  }
}

const rohanRow = {
  id: '20',
  full_name: 'Dr. Rohan Mehta',
  qualification: 'MBBS, MD (Dermatology)',
  experience_years: 9,
  bio: 'Dermatologist.',
  clinic_name: 'SkinWell Clinic',
  clinic_city: 'Indore',
  clinic_district: 'Indore',
  default_fee: '650',
  specializations: [{ id: 2, name: 'Dermatology' }],
  next_available_at: null,
}

function createSearchBackedServices() {
  const repository = {
    findSearchVocabulary: vi.fn().mockResolvedValue([
      {
        specialization_id: '1',
        name: 'General Medicine',
        terms: ['fever', 'general physician'],
      },
      {
        specialization_id: '2',
        name: 'Dermatology',
        terms: ['rash', 'dermatologist', 'skin doctor', 'दाने', 'खुजली', 'daane', 'khujli'],
      },
    ]),
    search: vi.fn().mockImplementation(async filters => {
      const normalizedStoredName = 'dr rohan mehta'
      const nameMatch = filters.name && normalizedStoredName.includes(filters.name)
      const specializationMatch = filters.specializationIds?.includes(2)
        || filters.problemSpecializationIds?.includes(2)
      const unifiedMatch = (filters.qName && normalizedStoredName.includes(filters.qName))
        || filters.qSpecializationIds?.includes(2)
      const rows = nameMatch || specializationMatch || unifiedMatch ? [rohanRow] : []
      return { rows, total: rows.length }
    }),
  }
  const services = createServices()
  services.doctors = createPublicDoctorService(repository)
  return { services, repository }
}

describe('public doctor API', () => {
  it('validates and forwards doctor-search filters', async () => {
    const services = createServices()
    const app = createApp(services)

    const response = await request(app)
      .get('/api/doctors')
      .query({
        q: 'skin doctor',
        specialization: 'Dermatology',
        maxFee: '750',
        minExperience: '5',
        limit: '5',
        offset: '10',
      })

    expect(response.status).toBe(200)
    expect(services.doctors.search).toHaveBeenCalledWith({
      q: 'skin doctor',
      specialization: 'Dermatology',
      maxFee: 750,
      minExperience: 5,
      limit: 5,
      offset: 10,
    })
  })

  it.each([
    'Rohan',
    'Dr Rohan Mehta',
    'Dr. Rohan Mehta',
    'Dermatology',
    'dermatologist',
    'dermotologist',
    'skin doctor',
    'rash',
    'दाने',
    'खुजली',
    'khujli',
  ])('returns the Dermatology doctor for unified query %s', async q => {
    const { services } = createSearchBackedServices()
    const response = await request(createApp(services)).get('/api/doctors').query({ q })
    expect(response.status).toBe(200)
    expect(response.body.items.map(item => item.fullName)).toEqual(['Dr. Rohan Mehta'])
  })

  it('combines unified search with legacy lower filters using AND-ready repository fields', async () => {
    const { services, repository } = createSearchBackedServices()
    const response = await request(createApp(services)).get('/api/doctors').query({
      q: 'skin doctor',
      specialization: 'Dermatology',
      date: '2030-01-01',
      maxFee: 700,
      minExperience: 5,
      limit: 5,
      offset: 10,
    })

    expect(response.status).toBe(200)
    expect(repository.search).toHaveBeenCalledWith(expect.objectContaining({
      q: 'skin doctor',
      qName: 'skin doctor',
      qSpecializationIds: [2],
      qSpecializationKind: 'term-exact',
      specializationIds: [2],
      date: '2030-01-01',
      maxFee: 700,
      minExperience: 5,
      limit: 5,
      offset: 10,
    }))
  })

  it('returns no unified-search results for unrelated text', async () => {
    const { services } = createSearchBackedServices()
    const response = await request(createApp(services)).get('/api/doctors').query({ q: 'meaningless' })
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ items: [], total: 0 })
  })

  it.each([
    ['problem=rash'],
    ['specialization=Dermatology'],
    ['problem=dermatologist'],
    ['specialization=dermatologist'],
    ['problem=skin%20doctor'],
    ['problem=dermotologist'],
    ['problem=dermatlogist'],
    ['problem=%E0%A4%A6%E0%A4%BE%E0%A4%A8%E0%A5%87'],
    ['problem=%E0%A4%96%E0%A5%81%E0%A4%9C%E0%A4%B2%E0%A5%80'],
    ['problem=daane'],
    ['problem=khujli'],
    ['name=Rohan'],
    ['name=Dr%20Rohan%20Mehta'],
    ['name=Dr.%20Rohan%20Mehta'],
  ])('returns the Dermatology doctor for controlled search %s', async query => {
    const { services } = createSearchBackedServices()
    const response = await request(createApp(services)).get(`/api/doctors?${query}`)
    expect(response.status).toBe(200)
    expect(response.body.items.map(item => item.fullName)).toEqual(['Dr. Rohan Mehta'])
  })

  it.each([
    ['problem=meaningless'],
    ['problem=zzzzz'],
    ['problem=abc'],
    ['name=%25'],
    ['name=_'],
    ['name=%5C'],
  ])('does not produce an unsafe search match for %s', async query => {
    const { services } = createSearchBackedServices()
    const response = await request(createApp(services)).get(`/api/doctors?${query}`)
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ items: [], total: 0 })
  })

  it('rejects invalid pagination before database access', async () => {
    const services = createServices()
    const app = createApp(services)

    const response = await request(app).get('/api/doctors?limit=200')

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(services.doctors.search).not.toHaveBeenCalled()
  })

  it('rejects invalid fee and experience filters before database access', async () => {
    const services = createServices()
    const app = createApp(services)

    const invalidFee = await request(app).get('/api/doctors?maxFee=-1')
    const invalidExperience = await request(app).get('/api/doctors?minExperience=100')

    expect(invalidFee.status).toBe(400)
    expect(invalidExperience.status).toBe(400)
    expect(services.doctors.search).not.toHaveBeenCalled()
  })

  it('returns a public doctor profile', async () => {
    const services = createServices()
    const app = createApp(services)

    const response = await request(app).get('/api/doctors/1')

    expect(response.status).toBe(200)
    expect(response.body.fullName).toBe('Dr. Aditi Sharma')
    expect(services.doctors.getById).toHaveBeenCalledWith(1)
  })

  it('uses the consistent not-found error contract', async () => {
    const services = createServices()
    services.doctors.getById.mockRejectedValue(
      new AppError(404, 'DOCTOR_NOT_FOUND', 'Doctor not found'),
    )
    const app = createApp(services)

    const response = await request(app).get('/api/doctors/999')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({
      error: {
        code: 'DOCTOR_NOT_FOUND',
        message: 'Doctor not found',
      },
    })
  })

  it('requires a valid date when requesting slots', async () => {
    const services = createServices()
    const app = createApp(services)

    const missingDate = await request(app).get('/api/doctors/1/slots')
    const invalidDate = await request(app).get('/api/doctors/1/slots?date=2026-02-30')

    expect(missingDate.status).toBe(400)
    expect(invalidDate.status).toBe(400)
    expect(services.doctors.getSlots).not.toHaveBeenCalled()
  })

  it('returns slots for a specific date', async () => {
    const services = createServices()
    const app = createApp(services)

    const response = await request(app).get('/api/doctors/1/slots?date=2026-09-01')

    expect(response.status).toBe(200)
    expect(services.doctors.getSlots).toHaveBeenCalledWith(1, '2026-09-01')
  })

  it('returns the controlled specialization list', async () => {
    const services = createServices()
    const app = createApp(services)

    const response = await request(app).get('/api/specializations')

    expect(response.status).toBe(200)
    expect(response.body.items).toEqual([{ id: 1, name: 'General Medicine' }])
  })
})
