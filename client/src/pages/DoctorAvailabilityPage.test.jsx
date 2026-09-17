// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProtectedRoute } from '../components/ProtectedRoute.jsx'
import { AuthContext } from '../context/auth-context.js'
import { LanguageProvider } from '../context/LanguageProvider.jsx'
import { DoctorAvailabilityPage } from './DoctorAvailabilityPage.jsx'

const api = vi.hoisted(() => ({
  listDoctorAvailability: vi.fn(), createDoctorAvailability: vi.fn(), deleteDoctorAvailability: vi.fn(),
}))
vi.mock('../lib/api.js', () => api)
vi.mock('../components/PublicHeader.jsx', () => ({ PublicHeader: () => null }))
vi.mock('../components/PublicFooter.jsx', () => ({ PublicFooter: () => null }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function block(overrides = {}) {
  return {
    id: 8,
    startAt: '2030-09-21T03:30:00.000Z',
    endAt: '2030-09-21T04:30:00.000Z',
    effectiveFee: 600,
    isProtected: false,
    canDelete: true,
    slots: [
      { id: 81, startAt: '2030-09-21T03:30:00.000Z', endAt: '2030-09-21T04:00:00.000Z', isActive: true, isBooked: false, hasAppointmentHistory: false },
      { id: 82, startAt: '2030-09-21T04:00:00.000Z', endAt: '2030-09-21T04:30:00.000Z', isActive: false, isBooked: true, hasAppointmentHistory: true },
    ],
    ...overrides,
  }
}

function createdBlock(fee = null) {
  return block({
    id: 24,
    startAt: '2026-09-24T05:00:00.000Z',
    endAt: '2026-09-24T07:00:00.000Z',
    effectiveFee: fee,
    slots: [0, 1, 2, 3].map(index => ({
      id: 240 + index,
      startAt: new Date(Date.parse('2026-09-24T05:00:00.000Z') + index * 30 * 60 * 1000).toISOString(),
      endAt: new Date(Date.parse('2026-09-24T05:30:00.000Z') + index * 30 * 60 * 1000).toISOString(),
      isActive: true,
      isBooked: false,
      hasAppointmentHistory: false,
    })),
  })
}

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

async function renderPage(element = <DoctorAvailabilityPage />) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<LanguageProvider><MemoryRouter>{element}</MemoryRouter></LanguageProvider>)
    await settle()
  })
  return { host, root }
}

function button(host, label) {
  return [...host.querySelectorAll('button')].find(item => item.textContent.trim() === label)
}

async function click(target) {
  await act(async () => {
    target.click()
    await settle()
  })
}

async function input(target, value) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(target.constructor.prototype, 'value').set
    setter.call(target, value)
    target.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

async function openAddDialog(host) {
  await click(button(host, '+ Add availability') ?? button(host, 'Add availability'))
  return host.querySelector('[role="dialog"]')
}

async function chooseSeptember24(dialog) {
  await click(button(dialog, 'Choose a date'))
  await click(dialog.querySelector('button[aria-label="Choose Thursday, 24 September 2026"]'))
}

async function chooseTime(dialog, label, value) {
  await click(dialog.querySelector(`button[aria-label^="${label},"]`))
  let option = dialog.querySelector(`[role="option"][value="${value}"]`)
  if (!option) {
    const hour = Number(value.slice(0, 2))
    const period = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'
    await click(button(dialog.querySelector('.availability-time-popover'), period))
    option = dialog.querySelector(`[role="option"][value="${value}"]`)
  }
  await click(option)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-16T04:30:00.000Z'))
  vi.clearAllMocks()
  api.listDoctorAvailability.mockResolvedValue({ items: [] })
  api.createDoctorAvailability.mockResolvedValue({ availability: {} })
  api.deleteDoctorAvailability.mockResolvedValue(null)
})

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('Doctor availability', () => {
  it('loads availability and renders slots and effective fee', async () => {
    api.listDoctorAvailability.mockResolvedValue({ items: [block()] })
    const { host, root } = await renderPage()
    expect(api.listDoctorAvailability).toHaveBeenCalledWith(expect.any(AbortSignal))
    expect(host.textContent).toContain('Saturday, 21 September')
    expect(host.textContent).toContain('2 × 30-minute slots')
    expect(host.textContent).toContain('₹600')
    expect(host.textContent).toContain('Available')
    expect(host.textContent).toContain('Booked')
    await act(async () => root.unmount())
  })

  it('renders a spacious empty schedule with a secondary add action', async () => {
    const { host, root } = await renderPage()
    expect(host.textContent).toContain('No upcoming availability')
    expect(host.textContent).toContain('Add time so patients can book a consultation.')
    expect(button(host, 'Add availability')).toBeTruthy()
    await act(async () => root.unmount())
  })

  it('uses explicit wording when no effective fee is available', async () => {
    api.listDoctorAvailability.mockResolvedValue({ items: [block({ effectiveFee: null })] })
    const { host, root } = await renderPage()
    expect(host.textContent).toContain('Fee not specified')
    expect(host.textContent).not.toContain('₹0')
    expect(host.textContent).not.toContain('Free')
    await act(async () => root.unmount())
  })

  it('selects a date from the custom calendar and closes the popover', async () => {
    const { host, root } = await renderPage()
    const dialog = await openAddDialog(host)
    expect(dialog.querySelector('input[type="date"]')).toBeNull()
    await click(button(dialog, 'Choose a date'))
    expect(dialog.textContent).toContain('September 2026')
    const pastDate = dialog.querySelector('button[aria-label="Choose Tuesday, 15 September 2026"]')
    expect(pastDate.disabled).toBe(true)
    await click(dialog.querySelector('button[aria-label="Choose Thursday, 24 September 2026"]'))
    expect(dialog.textContent).toContain('Thu, 24 Sep 2026')
    expect(dialog.querySelector('[aria-label="Choose availability date"]')).toBeNull()
    await act(async () => root.unmount())
  })

  it('uses correct period tabs and exposes 11:00 PM in the compact Evening grid', async () => {
    const { host, root } = await renderPage()
    const dialog = await openAddDialog(host)
    expect(dialog.querySelector('input[type="time"]')).toBeNull()
    expect(dialog.querySelectorAll('select')).toHaveLength(0)
    await click(dialog.querySelector('button[aria-label^="Start time,"]'))
    const popover = dialog.querySelector('.availability-time-popover')
    expect([...popover.querySelectorAll('[role="tab"]')].map(tab => tab.textContent)).toEqual(['Morning', 'Afternoon', 'Evening'])
    const visibleValues = () => [...popover.querySelectorAll('[aria-label="Start time options"] [role="option"]')].map(option => option.value)
    expect(visibleValues()).toEqual(Array.from({ length: 24 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`))
    await click(button(popover, 'Afternoon'))
    expect(visibleValues()[0]).toBe('12:00')
    expect(visibleValues().at(-1)).toBe('16:30')
    await click(button(popover, 'Evening'))
    expect(visibleValues()[0]).toBe('17:00')
    expect(visibleValues()).toContain('23:00')
    expect(visibleValues()).not.toContain('23:30')
    expect(button(popover, '11:00 PM')).toBeTruthy()
    await act(async () => root.unmount())
  })

  it('reopens on the period containing the selected value', async () => {
    const { host, root } = await renderPage()
    const dialog = await openAddDialog(host)
    await chooseTime(dialog, 'Start time', '17:30')
    await click(dialog.querySelector('button[aria-label="Start time, 5:30 PM"]'))
    const selectedTab = dialog.querySelector('[aria-label="Start time periods"] [role="tab"][aria-selected="true"]')
    expect(selectedTab.textContent).toBe('Evening')
    expect(dialog.querySelector('[aria-label="Start time options"] [value="17:30"]')).toBeTruthy()
    await act(async () => root.unmount())
  })

  it('filters End so 8:30 PM starts at 9:00 PM and exposes only the valid Evening period', async () => {
    const { host, root } = await renderPage()
    const dialog = await openAddDialog(host)
    await chooseTime(dialog, 'Start time', '20:30')
    await click(dialog.querySelector('button[aria-label^="End time,"]'))
    expect([...dialog.querySelectorAll('[aria-label="End time periods"] [role="tab"]')].map(tab => tab.textContent)).toEqual(['Evening'])
    const values = [...dialog.querySelectorAll('[aria-label="End time options"] [role="option"]')].map(option => option.value)
    expect(values[0]).toBe('21:00')
    expect(values.at(-1)).toBe('23:30')
    expect(values.every(value => value > '20:30')).toBe(true)
    expect(values).not.toContain('20:30')
    await act(async () => root.unmount())
  })

  it('clears End automatically when Start changes past the selected End', async () => {
    const { host, root } = await renderPage()
    const dialog = await openAddDialog(host)
    await chooseTime(dialog, 'Start time', '17:30')
    await chooseTime(dialog, 'End time', '18:00')
    await chooseTime(dialog, 'Start time', '18:30')
    expect(dialog.querySelector('button[aria-label="End time, choose a time"]')).toBeTruthy()
    expect(dialog.querySelector('.availability-dialog__preview')).toBeNull()
    await act(async () => root.unmount())
  })

  it('preserves the four-slot preview for 5:30 PM to 7:30 PM', async () => {
    const { host, root } = await renderPage()
    const dialog = await openAddDialog(host)
    await chooseSeptember24(dialog)
    expect(dialog.querySelector('.availability-dialog__preview')).toBeNull()
    await chooseTime(dialog, 'Start time', '17:30')
    await chooseTime(dialog, 'End time', '19:30')
    const preview = dialog.querySelector('.availability-dialog__preview')
    expect(preview.textContent).toContain('5:30 PM – 7:30 PM')
    expect(preview.textContent).toContain('4 × 30-minute slots')
    await act(async () => root.unmount())
  })

  it('submits HH:mm values, creates four slots and refreshes the page immediately', async () => {
    api.listDoctorAvailability
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [createdBlock(725)] })
    const { host, root } = await renderPage()
    const dialog = await openAddDialog(host)
    await chooseSeptember24(dialog)
    await chooseTime(dialog, 'Start time', '10:30')
    await chooseTime(dialog, 'End time', '12:30')
    await input(dialog.querySelector('input[name="fee"]'), '725')
    await click(button(dialog, 'Add availability'))
    expect(api.createDoctorAvailability).toHaveBeenCalledWith({ date: '2026-09-24', startTime: '10:30', endTime: '12:30', fee: 725 })
    expect(api.listDoctorAvailability).toHaveBeenCalledTimes(2)
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    expect(host.textContent).toContain('Availability added.')
    expect(host.textContent).toContain('4 × 30-minute slots')
    expect(host.textContent).toContain('₹725')
    await act(async () => root.unmount())
  })

  it('keeps the fee optional and omits it from the create payload when blank', async () => {
    api.listDoctorAvailability.mockResolvedValueOnce({ items: [] }).mockResolvedValueOnce({ items: [createdBlock()] })
    const { host, root } = await renderPage()
    const dialog = await openAddDialog(host)
    await chooseSeptember24(dialog)
    await chooseTime(dialog, 'Start time', '10:30')
    await chooseTime(dialog, 'End time', '12:30')
    await click(button(dialog, 'Add availability'))
    expect(api.createDoctorAvailability).toHaveBeenCalledWith({ date: '2026-09-24', startTime: '10:30', endTime: '12:30' })
    expect(host.textContent).toContain('Fee not specified')
    await act(async () => root.unmount())
  })

  it('shows the specific backend overlap message', async () => {
    api.createDoctorAvailability.mockRejectedValue(Object.assign(new Error('technical'), { code: 'AVAILABILITY_OVERLAP' }))
    const { host, root } = await renderPage()
    const dialog = await openAddDialog(host)
    await chooseSeptember24(dialog)
    await chooseTime(dialog, 'Start time', '10:30')
    await chooseTime(dialog, 'End time', '12:30')
    await click(button(dialog, 'Add availability'))
    expect(dialog.textContent).toContain('This time overlaps with availability you already added.')
    expect(dialog.textContent).not.toContain('technical')
    await act(async () => root.unmount())
  })

  it('keeps 12 AM and 12 PM conversion correct in submitted backend values', async () => {
    api.listDoctorAvailability.mockResolvedValueOnce({ items: [] }).mockResolvedValueOnce({ items: [createdBlock()] })
    const { host, root } = await renderPage()
    const dialog = await openAddDialog(host)
    await chooseSeptember24(dialog)
    await chooseTime(dialog, 'Start time', '00:00')
    await chooseTime(dialog, 'End time', '12:00')
    await click(button(dialog, 'Add availability'))
    expect(api.createDoctorAvailability).toHaveBeenCalledWith({ date: '2026-09-24', startTime: '00:00', endTime: '12:00' })
    await act(async () => root.unmount())
  })

  it('keeps the compact time popover contained within its field for narrow layouts', async () => {
    const { host, root } = await renderPage()
    const dialog = await openAddDialog(host)
    const fields = dialog.querySelectorAll('.availability-time-field')
    expect(fields).toHaveLength(2)
    await click(dialog.querySelector('button[aria-label^="Start time,"]'))
    const popover = dialog.querySelector('.availability-time-popover')
    expect(popover).toBeTruthy()
    expect(popover.parentElement).toBe(fields[0])
    await act(async () => root.unmount())
  })

  it('confirms and deletes an allowed block, then refreshes', async () => {
    api.listDoctorAvailability.mockResolvedValueOnce({ items: [block()] }).mockResolvedValueOnce({ items: [] })
    const { host, root } = await renderPage()
    await click(button(host, 'Remove availability'))
    await click(button(host.querySelector('[role="dialog"]'), 'Remove availability'))
    expect(api.deleteDoctorAvailability).toHaveBeenCalledWith(8)
    expect(api.listDoctorAvailability).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('Availability removed.')
    await act(async () => root.unmount())
  })

  it('does not offer deletion for a protected block', async () => {
    api.listDoctorAvailability.mockResolvedValue({ items: [block({ isProtected: true, canDelete: false })] })
    const { host, root } = await renderPage()
    expect(host.textContent).toContain('This availability has appointment history and can’t be removed.')
    expect(button(host, 'Remove availability')).toBeUndefined()
    await act(async () => root.unmount())
  })

  it('keeps the block and explains a protected delete response', async () => {
    api.listDoctorAvailability.mockResolvedValueOnce({ items: [block()] }).mockResolvedValueOnce({ items: [block({ isProtected: true, canDelete: false })] })
    api.deleteDoctorAvailability.mockRejectedValue(Object.assign(new Error('technical'), { code: 'AVAILABILITY_BLOCK_PROTECTED' }))
    const { host, root } = await renderPage()
    await click(button(host, 'Remove availability'))
    await click(button(host.querySelector('[role="dialog"]'), 'Remove availability'))
    expect(host.textContent).toContain('This availability has appointment history and can’t be removed.')
    expect(host.textContent).not.toContain('technical')
    expect(api.listDoctorAvailability).toHaveBeenCalledTimes(2)
    await act(async () => root.unmount())
  })

  it('protects the route from non-doctors using the existing role boundary', async () => {
    const auth = { status: 'authenticated', currentUser: { id: 1, fullName: 'Ananya Rao', role: 'patient' }, sessionError: null, refresh: vi.fn() }
    const route = <AuthContext.Provider value={auth}><Routes><Route path="/doctor/availability" element={<ProtectedRoute allowedRoles={['doctor']}><DoctorAvailabilityPage /></ProtectedRoute>} /></Routes></AuthContext.Provider>
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => { root.render(<LanguageProvider><MemoryRouter initialEntries={['/doctor/availability']}>{route}</MemoryRouter></LanguageProvider>); await settle() })
    expect(api.listDoctorAvailability).not.toHaveBeenCalled()
    expect(host.textContent).toContain('This page isn’t available for your account')
    await act(async () => root.unmount())
  })
})
