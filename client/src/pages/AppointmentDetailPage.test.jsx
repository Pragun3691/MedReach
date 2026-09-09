// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../context/auth-context.js'
import { LanguageProvider } from '../context/LanguageProvider.jsx'
import { AppointmentDetailPage } from './AppointmentDetailPage.jsx'

const api = vi.hoisted(() => ({
  beginAppointmentConsultation: vi.fn(), cancelAppointment: vi.fn(), getAppointment: vi.fn(),
  finishAppointmentConsultation: vi.fn(), getAppointmentConsultation: vi.fn(), getAppointmentVideoSession: vi.fn(), markAppointmentNoShow: vi.fn(), markAppointmentReady: vi.fn(), openAppointmentRoom: vi.fn(), saveAppointmentConsultation: vi.fn(),
}))
vi.mock('../lib/api.js', () => api)
vi.mock('../components/PublicHeader.jsx', () => ({ PublicHeader: () => null }))
vi.mock('../components/PublicFooter.jsx', () => ({ PublicFooter: () => null }))
vi.mock('../components/DeviceCheck.jsx', () => ({ DeviceCheck: () => <div>Device check ready</div> }))
vi.mock('../components/DeviceCheckDialog.jsx', () => ({ DeviceCheckDialog: ({ onClose }) => <button onClick={onClose}>Close device check</button> }))
vi.mock('../components/JaasMeeting.jsx', () => ({
  JaasMeeting: props => <div data-testid="jaas-meeting"><button onClick={() => props.onLocalJoined?.({ id: 'local' })}>Simulate local join</button><button onClick={() => props.onParticipantJoined?.({ id: 'remote', userContext: { id: '1' } })}>Simulate patient join</button><button onClick={() => props.onConferenceLeft?.()}>Simulate conference leave</button></div>,
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const patient = { id: 1, fullName: 'Ananya Rao', role: 'patient' }
const doctor = { id: 10, fullName: 'Dr. Aditi Sharma', role: 'doctor' }

function appointment(flow = {}, status = 'booked') {
  return {
    id: 42, status, patient: { id: 1, fullName: 'Ananya Rao' }, doctor: { id: 10, fullName: 'Dr. Aditi Sharma', specializations: [{ id: 1, name: 'General Medicine' }] },
    slot: { id: 101, startAt: '2030-01-01T10:00:00.000Z', endAt: '2030-01-01T10:30:00.000Z' }, feeSnapshot: 700,
    cancellation: null, rescheduledFromAppointmentId: null, replacementAppointmentId: null,
    consultationFlow: {
      readyAt: null, roomOpenedAt: null, consultationId: null, consultationStartedAt: null, consultationFinishedAt: null,
      checkInOpensAt: '2030-01-01T09:45:00.000Z', doctorRoomOpensAt: '2030-01-01T09:55:00.000Z', noShowAvailableAt: '2030-01-01T10:15:00.000Z', startCutoffAt: '2030-01-01T10:30:00.000Z',
      canMarkReady: false, canOpenRoom: false, canBeginConsultation: false, canMarkNoShow: false, canCancel: true, canReschedule: true, ...flow,
    },
  }
}

async function renderPage(user, responses) {
  api.getAppointment.mockReset()
  for (const response of responses) api.getAppointment.mockResolvedValueOnce({ appointment: response })
  api.getAppointment.mockResolvedValue({ appointment: responses.at(-1) })
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  await act(async () => { root.render(<LanguageProvider><AuthContext.Provider value={{ currentUser: user }}><MemoryRouter initialEntries={['/appointments/42']}><Routes><Route element={<AppointmentDetailPage />} path="/appointments/:appointmentId" /></Routes></MemoryRouter></AuthContext.Provider></LanguageProvider>); await Promise.resolve(); await Promise.resolve() })
  return { host, root }
}

function button(host, text) { return [...host.querySelectorAll('button')].find(item => item.textContent.includes(text)) }
async function click(element) { await act(async () => { element.click(); await Promise.resolve(); await Promise.resolve() }) }

beforeEach(() => {
  window.localStorage.clear()
  vi.useFakeTimers(); vi.setSystemTime('2030-01-01T09:56:00.000Z')
  Object.values(api).forEach(mock => mock.mockReset())
  api.markAppointmentReady.mockResolvedValue({}); api.openAppointmentRoom.mockResolvedValue({}); api.beginAppointmentConsultation.mockResolvedValue({}); api.markAppointmentNoShow.mockResolvedValue({})
  api.finishAppointmentConsultation.mockResolvedValue({}); api.saveAppointmentConsultation.mockResolvedValue({})
  api.getAppointmentVideoSession.mockResolvedValue({ domain: '8x8.vc', roomName: 'test-app/medreach-appointment-42', jwt: 'memory-only-token', role: 'doctor' })
})
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren() })

describe('Appointment pre-consultation experience', () => {
  it('uses server capability for Ready, calls the API, refetches, and renders checked-in waiting state', async () => {
    const ready = appointment({ canMarkReady: true })
    const checkedIn = appointment({ readyAt: '2030-01-01T09:56:00.000Z', canMarkReady: true })
    const { host, root } = await renderPage(patient, [ready, checkedIn])
    await click(button(host, 'I’m Ready'))
    expect(api.markAppointmentReady).toHaveBeenCalledWith(42)
    expect(api.getAppointment).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('You’re checked in')
    expect(host.textContent).toContain('Waiting for your doctor')
    await act(async () => root.unmount())
  })

  it('shows Join when the room is open without requiring Ready and requests a token only after pre-call confirmation', async () => {
    const open = appointment({ roomOpenedAt: '2030-01-01T09:55:00.000Z', canMarkReady: true })
    const { host, root } = await renderPage(patient, [open])
    await click(button(host, 'Join consultation'))
    expect(api.getAppointmentVideoSession).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Device check ready')
    await click([...host.querySelectorAll('button')].filter(item => item.textContent.includes('Join consultation')).at(-1))
    expect(api.getAppointmentVideoSession).toHaveBeenCalledWith(42)
    expect(host.querySelector('[data-testid="jaas-meeting"]')).not.toBeNull()
    await act(async () => root.unmount())
  })

  it('shows a safe environment message when video authorization is not configured', async () => {
    const error = Object.assign(new Error('internal configuration detail'), { code: 'VIDEO_CONFIGURATION_UNAVAILABLE', status: 503 })
    api.getAppointmentVideoSession.mockRejectedValue(error)
    const open = appointment({ roomOpenedAt: '2030-01-01T09:55:00.000Z' })
    const { host, root } = await renderPage(patient, [open])
    await click(button(host, 'Join consultation'))
    await click([...host.querySelectorAll('button')].filter(item => item.textContent.includes('Join consultation')).at(-1))
    expect(host.textContent).toContain('Video consultation is not configured on this environment.')
    expect(host.textContent).not.toContain('internal configuration detail')
    await act(async () => root.unmount())
  })

  it('hides consultation actions for resolved appointments', async () => {
    const { host, root } = await renderPage(patient, [appointment({ canMarkReady: true, roomOpenedAt: '2030-01-01T09:55:00.000Z' }, 'cancelled')])
    expect(button(host, 'I’m Ready')).toBeUndefined(); expect(button(host, 'Join consultation')).toBeUndefined()
    await act(async () => root.unmount())
  })

  it('polls only while a checked-in Patient waits and cleans up on unmount', async () => {
    const waiting = appointment({ readyAt: '2030-01-01T09:56:00.000Z' })
    const { root } = await renderPage(patient, [waiting])
    await act(async () => { vi.advanceTimersByTime(10_000); await Promise.resolve(); await Promise.resolve() })
    expect(api.getAppointment).toHaveBeenCalledTimes(2)
    await act(async () => root.unmount())
    vi.advanceTimersByTime(20_000)
    expect(api.getAppointment).toHaveBeenCalledTimes(2)
  })

  it('opens the room and shows Patient Waiting', async () => {
    const initial = appointment({ readyAt: '2030-01-01T09:50:00.000Z', canOpenRoom: true, canReschedule: false })
    const opened = appointment({ readyAt: initial.consultationFlow.readyAt, roomOpenedAt: '2030-01-01T09:56:00.000Z', canBeginConsultation: true, canReschedule: false })
    const { host, root } = await renderPage(doctor, [initial, opened])
    expect(host.textContent).toContain('Patient Waiting')
    await click(button(host, 'Open consultation room'))
    expect(api.openAppointmentRoom).toHaveBeenCalledWith(42); expect(host.textContent).toContain('Room opened')
    await act(async () => root.unmount())
  })

  it('keeps assigned-Doctor cancellation visible after slot end when the server permits it', async () => {
    vi.setSystemTime('2030-01-01T11:00:00.000Z')
    const unresolved = appointment({ canCancel: true, canReschedule: false })
    const { host, root } = await renderPage(doctor, [unresolved])
    expect(button(host, 'Cancel appointment')).not.toBeUndefined()
    await act(async () => root.unmount())
  })

  it('uses authenticated participant identity and requires an explicit confirmed Begin action', async () => {
    const opened = appointment({ roomOpenedAt: '2030-01-01T09:55:00.000Z', canBeginConsultation: true, canReschedule: false })
    const { host, root } = await renderPage(doctor, [opened])
    await click(button(host, 'Enter consultation room')); await click([...host.querySelectorAll('button')].filter(item => item.textContent.includes('Join consultation')).at(-1))
    await click(button(host, 'Simulate patient join')); expect(host.textContent).toContain('Patient connected')
    await click(button(host, 'Begin consultation')); expect(api.beginAppointmentConsultation).not.toHaveBeenCalled()
    expect(host.textContent).toContain('This starts the MedReach consultation record')
    await click([...host.querySelectorAll('button')].filter(item => item.textContent.includes('Begin consultation')).at(-1))
    expect(api.beginAppointmentConsultation).toHaveBeenCalledWith(42)
    await act(async () => root.unmount())
  })

  it('warns about Ready before no-show and leaving JaaS does not begin or finish clinical state', async () => {
    const noShow = appointment({ readyAt: '2030-01-01T09:50:00.000Z', roomOpenedAt: '2030-01-01T09:55:00.000Z', canBeginConsultation: true, canMarkNoShow: true, canReschedule: false })
    const { host, root } = await renderPage(doctor, [noShow])
    await click(button(host, 'Mark patient as no-show'))
    expect(host.textContent).toContain('This patient marked themselves ready at')
    await click(button(host, 'Cancel'))
    await click(button(host, 'Enter consultation room')); await click([...host.querySelectorAll('button')].filter(item => item.textContent.includes('Join consultation')).at(-1)); await click(button(host, 'Simulate conference leave'))
    expect(api.beginAppointmentConsultation).not.toHaveBeenCalled(); expect(api.finishAppointmentConsultation).not.toHaveBeenCalled(); expect(api.markAppointmentNoShow).not.toHaveBeenCalled(); expect(host.querySelector('[data-testid="jaas-meeting"]')).toBeNull()
    await act(async () => root.unmount())
  })

  it('never requests or renders the Doctor clinical workspace for a Patient in an active consultation', async () => {
    const active = appointment({ roomOpenedAt: '2030-01-01T09:55:00.000Z', consultationId: 9000, consultationStartedAt: '2030-01-01T09:56:00.000Z', canCancel: false, canReschedule: false })
    const { host, root } = await renderPage(patient, [active])
    expect(api.getAppointmentConsultation).not.toHaveBeenCalled()
    expect(host.textContent).not.toContain('Clinical workspace')
    expect(host.querySelector('#consultation-notes')).toBeNull()
    await act(async () => root.unmount())
  })

  it('fetches and renders a finished consultation record for the owning Patient', async () => {
    const completed = appointment({ consultationId: 9000, consultationStartedAt: '2030-01-01T09:56:00.000Z', consultationFinishedAt: '2030-01-01T10:30:00.000Z', canCancel: false, canReschedule: false }, 'completed')
    api.getAppointmentConsultation.mockResolvedValue({ consultation: { consultationId: 9000, startedAt: '2030-01-01T09:56:00.000Z', finishedAt: '2030-01-01T10:30:00.000Z', notes: 'Completed guidance', prescriptionItems: [], followUp: null, editable: false } })
    const { host, root } = await renderPage(patient, [completed])
    expect(api.getAppointmentConsultation).toHaveBeenCalledWith(42, expect.any(AbortSignal))
    expect(host.textContent).toContain('Consultation record')
    expect(host.textContent).toContain('Completed guidance')
    expect(button(host, 'Join consultation')).toBeUndefined()
    expect(button(host, 'Save changes')).toBeUndefined()
    await act(async () => root.unmount())
  })

  it('handles an unavailable completed record calmly', async () => {
    const completed = appointment({ consultationId: 9000, consultationStartedAt: '2030-01-01T09:56:00.000Z', consultationFinishedAt: '2030-01-01T10:30:00.000Z' }, 'completed')
    api.getAppointmentConsultation.mockRejectedValue(new Error('database detail'))
    const { host, root } = await renderPage(patient, [completed])
    expect(host.textContent).toContain('We couldn’t load this consultation record. Please try again later.')
    expect(host.textContent).not.toContain('database detail')
    await act(async () => root.unmount())
  })

  it('does not fabricate a record for a historical appointment without a Consultation', async () => {
    const { host, root } = await renderPage(patient, [appointment({}, 'completed')])
    expect(api.getAppointmentConsultation).not.toHaveBeenCalled()
    expect(host.textContent).not.toContain('Consultation record')
    expect(host.textContent).not.toContain('No medicines were prescribed')
    await act(async () => root.unmount())
  })
})
