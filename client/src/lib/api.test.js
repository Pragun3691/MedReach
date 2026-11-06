import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createAvailabilityException,
  deleteAvailabilityException,
  deleteAvailabilityExceptionRange,
  getAvailabilityExceptions,
  submitMyVerification,
  reviewDoctorVerification,
} from './api.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('verification CSRF API helpers', () => {
  it.each(['doctor', 'admin'])('gets the current session token before a %s mutation', async role => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'session-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ verification: {} }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const body = role === 'doctor' ? { registrationNumber: 'REG', issuingAuthority: 'Council', version: 1 } : { version: 1, reason: 'Correction needed' }
    await (role === 'doctor' ? submitMyVerification(body) : reviewDoctorVerification(7, 'reject', body))
    expect(fetch.mock.calls[0][0]).toBe('/api/auth/csrf')
    expect(fetch.mock.calls[1]).toEqual([
      role === 'doctor' ? '/api/doctors/me/verification' : '/api/admin/doctor-verifications/7/reject',
      expect.objectContaining({ method: 'POST', credentials: 'include', body: JSON.stringify(body), headers: expect.objectContaining({ 'X-CSRF-Token': 'session-token' }) }),
    ])
  })
  it('does not mutate when token acquisition fails', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'AUTHENTICATION_REQUIRED' } }), { status: 401 }))
    vi.stubGlobal('fetch', fetch)
    await expect(reviewDoctorVerification(7, 'approve', { version: 1 })).rejects.toMatchObject({ status: 401 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('availability exception API helpers', () => {
  it('gets the current doctor exceptions with the provided abort signal', async () => {
    const signal = new AbortController().signal
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ exceptions: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetch)

    await expect(getAvailabilityExceptions(signal)).resolves.toEqual({ exceptions: [] })
    expect(fetch).toHaveBeenCalledWith('/api/doctors/me/availability/exceptions', expect.objectContaining({
      credentials: 'include', signal,
    }))
  })

  it('posts the partial exception JSON payload', async () => {
    const exception = { date: '2026-09-24', allDay: false, startTime: '13:00', endTime: '15:00' }
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 7, ...exception }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetch)

    await createAvailabilityException(exception)
    expect(fetch).toHaveBeenCalledWith('/api/doctors/me/availability/exceptions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(exception),
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }))
  })

  it('posts the all-day exception JSON payload without time fields', async () => {
    const exception = { date: '2026-10-03', allDay: true }
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 8, ...exception }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetch)

    await createAvailabilityException(exception)
    expect(fetch).toHaveBeenCalledWith('/api/doctors/me/availability/exceptions', expect.objectContaining({
      method: 'POST', body: JSON.stringify(exception),
    }))
  })

  it('posts the all-day range payload without single-day or time fields', async () => {
    const range = { startDate: '2026-10-12', endDate: '2026-10-16', allDay: true }
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ range: { rangeId: 'range-id', ...range } }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetch)

    await createAvailabilityException(range)
    expect(fetch).toHaveBeenCalledWith('/api/doctors/me/availability/exceptions', expect.objectContaining({
      method: 'POST', body: JSON.stringify(range),
    }))
  })

  it('deletes the owned exception by id', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)

    await expect(deleteAvailabilityException(17)).resolves.toBeNull()
    expect(fetch).toHaveBeenCalledWith('/api/doctors/me/availability/exceptions/17', expect.objectContaining({ method: 'DELETE' }))
  })

  it('deletes an owned exception range by range id', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)

    await expect(deleteAvailabilityExceptionRange('f5476d25-45d7-4f21-93bb-5cbad11f634f')).resolves.toBeNull()
    expect(fetch).toHaveBeenCalledWith(
      '/api/doctors/me/availability/exceptions/ranges/f5476d25-45d7-4f21-93bb-5cbad11f634f',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('preserves range-delete API errors', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'AVAILABILITY_EXCEPTION_NOT_FOUND', message: 'Not found' },
    }), { status: 404, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)

    await expect(deleteAvailabilityExceptionRange('f5476d25-45d7-4f21-93bb-5cbad11f634f')).rejects.toMatchObject({
      code: 'AVAILABILITY_EXCEPTION_NOT_FOUND', status: 404,
    })
  })

  it('preserves API error code and safe details for the UI', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'AVAILABILITY_EXCEPTION_BOOKED_CONFLICT', message: 'Conflict', details: { conflictCount: 2 } },
    }), { status: 409, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)

    await expect(createAvailabilityException({ date: '2026-09-24', allDay: true })).rejects.toMatchObject({
      code: 'AVAILABILITY_EXCEPTION_BOOKED_CONFLICT',
      status: 409,
      details: { conflictCount: 2 },
    })
  })
})
