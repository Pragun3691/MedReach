import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { AppError } from '../src/errors/app-error.js'

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

describe('public doctor API', () => {
  it('validates and forwards doctor-search filters', async () => {
    const services = createServices()
    const app = createApp(services)

    const response = await request(app)
      .get('/api/doctors')
      .query({
        specialization: 'Dermatology',
        maxFee: '750',
        minExperience: '5',
        limit: '5',
        offset: '10',
      })

    expect(response.status).toBe(200)
    expect(services.doctors.search).toHaveBeenCalledWith({
      specialization: 'Dermatology',
      maxFee: 750,
      minExperience: 5,
      limit: 5,
      offset: 10,
    })
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
