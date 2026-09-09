// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DoctorAppointmentsPage } from './DoctorAppointmentsPage.jsx'

const api = vi.hoisted(() => ({ listDoctorAppointments: vi.fn() }))
vi.mock('../lib/api.js', () => api)
vi.mock('../components/PublicHeader.jsx', () => ({ PublicHeader: () => null }))
vi.mock('../components/PublicFooter.jsx', () => ({ PublicFooter: () => null }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function appointment(id, status, { readyAt = null } = {}) {
  return {
    id,
    status,
    patient: { id: id + 100, fullName: id === 42 ? 'Ananya Rao' : 'Vikram Shah' },
    doctor: { id: 3, fullName: 'Dr. Rohan Mehta', specializations: [] },
    slot: { id: id + 200, startAt: '2030-09-08T05:30:00.000Z', endAt: '2030-09-08T06:00:00.000Z' },
    feeSnapshot: 650,
    consultationFlow: { readyAt },
  }
}

async function renderPage() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<MemoryRouter><DoctorAppointmentsPage /></MemoryRouter>)
    await Promise.resolve()
    await Promise.resolve()
  })
  return { host, root }
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => document.body.replaceChildren())

describe('Doctor appointments schedule', () => {
  it('preserves upcoming/history data while rendering the doctor card hierarchy and waiting state', async () => {
    api.listDoctorAppointments.mockResolvedValue({
      upcoming: [appointment(42, 'booked', { readyAt: '2030-09-08T05:20:00.000Z' })],
      history: [appointment(43, 'completed')],
    })
    const { host, root } = await renderPage()

    expect(api.listDoctorAppointments).toHaveBeenCalledWith(expect.any(AbortSignal))
    expect(host.textContent).toContain('Consultation schedule')
    expect(host.textContent).toContain('Manage your scheduled patient consultations and consultation status.')
    expect(host.textContent).toContain('Upcoming')
    expect(host.textContent).toContain('History')
    expect(host.textContent).toContain('Ananya Rao')
    expect(host.textContent).toContain('Patient Waiting')
    expect(host.textContent).toContain('Booked')
    expect(host.textContent).toContain('Vikram Shah')
    expect(host.textContent).toContain('Completed')
    expect(host.textContent).toContain('30 minutes')
    expect(host.querySelector('a[href="/appointments/42"]').textContent).toContain('View appointment')
    expect(host.querySelectorAll('.doctor-appointment-card')).toHaveLength(2)
    await act(async () => root.unmount())
  })

  it('keeps the existing retry flow', async () => {
    api.listDoctorAppointments
      .mockRejectedValueOnce(new Error('Temporary schedule error'))
      .mockResolvedValueOnce({ upcoming: [], history: [] })
    const { host, root } = await renderPage()
    expect(host.textContent).toContain('We couldn’t load your appointments')

    await act(async () => {
      [...host.querySelectorAll('button')].find(button => button.textContent === 'Try again').click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(api.listDoctorAppointments).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('No upcoming consultations')
    expect(host.textContent).toContain('No appointment history yet.')
    await act(async () => root.unmount())
  })
})
