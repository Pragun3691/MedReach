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
  listDoctorRecurringAvailability: vi.fn(), createDoctorRecurringAvailability: vi.fn(),
  stopDoctorRecurringAvailability: vi.fn(),
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
    recurringRuleId: null,
    isProtected: false,
    canDelete: true,
    slots: [
      { id: 81, startAt: '2030-09-21T03:30:00.000Z', endAt: '2030-09-21T04:00:00.000Z', isActive: true, isBooked: false, hasAppointmentHistory: false },
      { id: 82, startAt: '2030-09-21T04:00:00.000Z', endAt: '2030-09-21T04:30:00.000Z', isActive: false, isBooked: true, hasAppointmentHistory: true },
    ],
    ...overrides,
  }
}

function datedBlock(date, overrides = {}) {
  const id = overrides.id ?? Number(date.replaceAll('-', ''))
  const startTime = overrides.startTime ?? '09:00'
  const endTime = overrides.endTime ?? '10:00'
  const startAt = new Date(`${date}T${startTime}:00+05:30`)
  const endAt = new Date(`${date}T${endTime}:00+05:30`)
  const booked = overrides.booked ?? false
  return block({
    id,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    recurringRuleId: overrides.recurringRuleId ?? null,
    slots: [0, 1].map(index => ({
      id: id * 10 + index,
      startAt: new Date(startAt.getTime() + index * 30 * 60 * 1000).toISOString(),
      endAt: new Date(startAt.getTime() + (index + 1) * 30 * 60 * 1000).toISOString(),
      isActive: !(booked && index === 1),
      isBooked: booked && index === 1,
      hasAppointmentHistory: booked && index === 1,
    })),
    ...overrides,
  })
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

function recurringRule(overrides = {}) {
  return {
    id: 41,
    weekdays: [1, 3, 5],
    startTime: '09:00',
    endTime: '12:00',
    startsOn: '2026-09-21',
    endsOn: '2026-10-31',
    effectiveFee: 650,
    status: 'active',
    materializedThrough: '2026-10-31',
    materializedOccurrenceCount: 18,
    ...overrides,
  }
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
  await click(button(host, '+ Add one-off time'))
  return host.querySelector('[role="dialog"]')
}

async function openWeeklyDialog(host) {
  await click(button(host, '+ Add weekly schedule'))
  return host.querySelector('[role="dialog"]')
}

async function chooseDate(dialog, triggerLabel, dateLabel) {
  await click(dialog.querySelector(`button[aria-label^="${triggerLabel},"]`))
  await click(dialog.querySelector(`button[aria-label="Choose ${dateLabel}"]`))
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
  api.listDoctorRecurringAvailability.mockResolvedValue({ items: [] })
  api.createDoctorRecurringAvailability.mockResolvedValue({ rule: {} })
  api.stopDoctorRecurringAvailability.mockResolvedValue(null)
})

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('Doctor availability', () => {
  it('summarises availability and keeps slot details collapsed until requested', async () => {
    api.listDoctorAvailability.mockResolvedValue({ items: [block()] })
    const { host, root } = await renderPage()
    expect(api.listDoctorAvailability).toHaveBeenCalledWith(expect.any(AbortSignal))
    expect(host.textContent).toContain('Saturday, 21 September')
    expect(host.textContent).toContain('2 slots · 1 available · 1 booked')
    expect(host.textContent).toContain('9:00 AM – 10:00 AM')
    expect(host.textContent).toContain('₹600 per consultation')
    expect(host.textContent).toContain('One-off')
    expect(host.querySelector('.availability-slots')).toBeNull()
    expect(host.querySelector('.availability-block__disclosure').getAttribute('aria-expanded')).toBe('false')
    expect(host.querySelector('a[href="/doctor/appointments"]')).toBeTruthy()
    await click(host.querySelector('.availability-block__disclosure'))
    expect(host.querySelector('.availability-slots').textContent).toContain('Available')
    expect(host.querySelector('.availability-slots').textContent).toContain('Booked')
    expect(host.querySelector('.availability-slots').textContent).toContain('9:30 AM')
    expect(host.textContent).not.toMatch(/\b(?:am|pm)\b/)
    expect(host.querySelector('.availability-block__disclosure').getAttribute('aria-expanded')).toBe('true')
    await act(async () => root.unmount())
  })

  it('renders the permanent calendar workspace and the single schedule settings panel', async () => {
    const { host, root } = await renderPage()
    const regular = host.querySelector('#regular-schedule-heading').closest('section')
    const calendar = host.querySelector('#availability-calendar-heading').closest('section')
    expect(regular.classList.contains('availability-section--regular')).toBe(true)
    expect(calendar.classList.contains('availability-section--upcoming')).toBe(true)
    expect(calendar.querySelector('.availability-browser')).toBeTruthy()
    expect(host.textContent).toContain('Manage when patients can book consultations.')
    expect(host.textContent).not.toContain('Upcoming schedule')
    expect(host.textContent).not.toContain('Browse schedule')
    expect(host.textContent).not.toContain('Close schedule browser')
    expect(regular.querySelector('.availability-management-actions')).toBeTruthy()
    expect([...host.querySelectorAll('button')].filter(item => item.textContent.trim() === '+ Add weekly schedule')).toHaveLength(1)
    expect([...host.querySelectorAll('button')].filter(item => item.textContent.trim() === '+ Add one-off time')).toHaveLength(1)
    expect(host.querySelectorAll('.availability-section')).toHaveLength(2)
    expect(host.textContent).toContain('No bookable availability yet.')
    expect(host.textContent).toContain('Set a regular schedule or add one-off time to start accepting bookings.')
    await act(async () => root.unmount())
  })

  it('defaults to the earliest future availability without rendering a duplicate date feed', async () => {
    api.listDoctorAvailability.mockResolvedValue({ items: [
      datedBlock('2026-09-18', { id: 18 }),
      datedBlock('2026-09-19', { id: 19, recurringRuleId: 41 }),
      datedBlock('2026-12-03', { id: 1203, recurringRuleId: 41 }),
    ] })
    const { host, root } = await renderPage()

    const selected = host.querySelector('button[aria-label^="View Friday, 18 September 2026"]')
    expect(selected.getAttribute('aria-selected')).toBe('true')
    expect(host.querySelector('#availability-browse-date-2026-09-18')).toBeTruthy()
    expect(host.querySelector('#availability-browse-date-2026-09-19')).toBeNull()
    expect(host.textContent).not.toContain('Thursday, 3 December')
    expect(host.querySelector('.availability-browser')).toBeTruthy()
    expect(host.querySelectorAll('.availability-date--selected')).toHaveLength(1)
    await act(async () => root.unmount())
  })

  it('navigates useful months, selects unavailable dates, and resets focused slot details', async () => {
    api.listDoctorAvailability.mockResolvedValue({ items: [
      datedBlock('2026-09-18', { id: 18 }),
      datedBlock('2026-09-19', { id: 19, recurringRuleId: 41 }),
      datedBlock('2026-10-03', { id: 1003, recurringRuleId: 41, booked: true }),
      datedBlock('2026-10-03', { id: 1004, startTime: '11:00', endTime: '12:00' }),
      datedBlock('2026-12-03', { id: 1203, recurringRuleId: 41 }),
    ] })
    const { host, root } = await renderPage()

    const browser = host.querySelector('.availability-browser')
    expect(browser.querySelector('.availability-browser__month-header h2').textContent).toBe('September 2026')
    const availableDate = browser.querySelector('button[aria-label^="View Friday, 18 September 2026"]')
    const unavailableDate = browser.querySelector('button[aria-label^="Select Sunday, 20 September 2026"]')
    expect(availableDate.dataset.available).toBe('true')
    expect(availableDate.querySelector('.availability-browser__date-number').textContent).toBe('18')
    expect(availableDate.querySelector('i')).toBeTruthy()
    expect(unavailableDate.dataset.available).toBeUndefined()
    expect(unavailableDate.disabled).toBe(false)

    await click(browser.querySelector('.availability-block__disclosure'))
    expect(browser.querySelector('.availability-slots')).toBeTruthy()
    await click(browser.querySelector('button[aria-label^="View Saturday, 19 September 2026"]'))
    expect(browser.querySelector('.availability-slots')).toBeNull()
    await click(unavailableDate)
    expect(browser.textContent).toContain('No bookable time on this date.')
    expect(unavailableDate.getAttribute('aria-selected')).toBe('true')

    await click(button(browser, 'Today'))
    expect(browser.querySelector('button[aria-current="date"]').getAttribute('aria-selected')).toBe('true')
    expect(browser.textContent).toContain('No bookable time on this date.')

    await click(browser.querySelector('button[aria-label="Next month"]'))
    expect(browser.querySelector('.availability-browser__month-header h2').textContent).toBe('October 2026')
    expect(browser.querySelector('button[aria-label="Previous month"]').classList.contains('availability-browser__month-nav')).toBe(true)
    const selectedDate = browser.querySelector('button[aria-label^="View Saturday, 3 October 2026"]')
    const detail = browser.querySelector('.availability-date--selected')
    expect(selectedDate.getAttribute('aria-selected')).toBe('true')
    expect(detail.querySelectorAll('.availability-block')).toHaveLength(2)
    expect(detail.textContent).toContain('2 slots · 1 available · 1 booked')
    expect(detail.textContent).toContain('From regular schedule')
    expect(detail.textContent).toContain('One-off')
    expect(detail.querySelectorAll('.availability-block__remove')).toHaveLength(1)
    expect(detail.querySelector('.availability-slots')).toBeNull()
    await click(detail.querySelector('.availability-block__disclosure'))
    expect(detail.querySelector('.availability-slots').textContent).toContain('Booked')

    await click(browser.querySelector('button[aria-label="Next month"]'))
    expect(browser.querySelector('.availability-browser__month-header h2').textContent).toBe('November 2026')
    expect(browser.textContent).toContain('No bookable time this month.')
    expect(browser.querySelector('.availability-date--selected')).toBeNull()
    expect(browser.textContent).toContain('Select a future date to see availability.')
    await click(browser.querySelector('button[aria-label="Next month"]'))
    expect(browser.querySelector('.availability-browser__month-header h2').textContent).toBe('December 2026')
    expect(browser.querySelector('button[aria-label="Next month"]').disabled).toBe(true)
    expect(browser.querySelector('button[aria-label^="View Thursday, 3 December 2026"]').getAttribute('aria-selected')).toBe('true')
    expect(browser.querySelector('.availability-date--selected').textContent).toContain('From regular schedule')
    await act(async () => root.unmount())
  })

  it('keeps an empty calendar on the current month with useful navigation bounds', async () => {
    const { host, root } = await renderPage()
    const browser = host.querySelector('.availability-browser')
    expect(browser.querySelector('.availability-browser__month-header h2').textContent).toBe('September 2026')
    expect(browser.querySelector('button[aria-label="Previous month"]').disabled).toBe(true)
    expect(browser.querySelector('button[aria-label="Next month"]').disabled).toBe(true)
    expect(browser.querySelector('button[aria-selected="true"]')).toBeNull()
    expect(browser.textContent).toContain('No bookable time this month.')
    expect(browser.textContent).toContain('No bookable availability yet.')
    expect(browser.textContent).toContain('Set a regular schedule or add one-off time to start accepting bookings.')
    await act(async () => root.unmount())
  })

  it('uses recurringRuleId as the sole source signal and only lets removable one-off blocks be deleted', async () => {
    api.listDoctorAvailability.mockResolvedValue({ items: [
      block(),
      block({
        id: 9,
        recurringRuleId: 41,
        startAt: '2030-09-21T05:30:00.000Z',
        endAt: '2030-09-21T06:30:00.000Z',
        canDelete: true,
      }),
    ] })
    const { host, root } = await renderPage()
    const blocks = host.querySelectorAll('.availability-block')

    expect(blocks[0].textContent).toContain('One-off')
    expect(button(blocks[0], 'Remove block')).toBeTruthy()
    expect(blocks[1].textContent).toContain('From regular schedule')
    expect(button(blocks[1], 'Remove block')).toBeUndefined()
    expect(host.querySelectorAll('.availability-block__remove')).toHaveLength(1)
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
    expect(dialog.textContent).toContain('One-off availability')
    expect(dialog.textContent).not.toContain('New one-off time')
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
    expect(host.textContent).toContain('One-off availability added.')
    expect(host.textContent).toContain('4 slots · 4 available · 0 booked')
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

  it('loads recurring rules and renders active and stopped schedule details safely', async () => {
    api.listDoctorRecurringAvailability.mockResolvedValue({ items: [
      recurringRule(),
      recurringRule({ id: 42, weekdays: [2, 4], startsOn: '2026-09-26', endsOn: null, effectiveFee: null }),
      recurringRule({ id: 43, weekdays: [6], status: 'stopped', materializedOccurrenceCount: 0 }),
    ] })
    const { host, root } = await renderPage()

    expect(api.listDoctorRecurringAvailability).toHaveBeenCalledWith(expect.any(AbortSignal))
    expect(host.textContent).toContain('Mon · Wed · Fri')
    expect(host.textContent).toContain('9:00 AM – 12:00 PM')
    expect(host.textContent).toContain('21 Sep 2026 – 31 Oct 2026')
    expect(host.textContent).toContain('₹650 per consultation')
    const previous = host.querySelector('.availability-previous')
    const previousToggle = previous.querySelector('button[aria-expanded]')
    expect(previousToggle.getAttribute('aria-expanded')).toBe('false')
    expect(previousToggle.textContent).toContain('Previous schedules (1)')
    expect(host.textContent).toContain('Tue · Thu')
    expect(host.textContent).toContain('Starting 26 Sep 2026 · No end date')
    expect(host.textContent).toContain('Fee not specified')
    expect(host.textContent).not.toContain('Stopped')
    await click(previousToggle)
    expect(host.textContent).toContain('Stopped')
    expect(button(previous, 'Stop schedule')).toBeUndefined()
    expect(previousToggle.getAttribute('aria-expanded')).toBe('true')
    expect(host.textContent).not.toContain('Date unavailable')
    expect(host.textContent).not.toContain('undefined')
    expect(host.textContent).not.toContain('NaN')
    await act(async () => root.unmount())
  })

  it('creates a no-end weekly schedule with ISO weekdays, half-hour values and a live preview', async () => {
    api.listDoctorRecurringAvailability
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [recurringRule({ endsOn: null, effectiveFee: null })] })
    const { host, root } = await renderPage()
    const dialog = await openWeeklyDialog(host)
    expect(dialog.textContent).toContain('Regular schedule')
    expect(dialog.textContent).not.toContain('New regular schedule')

    await click(button(dialog, 'Add weekly schedule'))
    expect(dialog.textContent).toContain('Choose at least one day of the week.')
    await click(dialog.querySelector('button[aria-label="Monday"]'))
    await click(dialog.querySelector('button[aria-label="Wednesday"]'))
    await click(dialog.querySelector('button[aria-label="Friday"]'))

    await click(dialog.querySelector('button[aria-label^="Start time,"]'))
    const startValues = [...dialog.querySelectorAll('[aria-label="Start time options"] [role="option"]')].map(option => option.value)
    expect(startValues.every(value => value.endsWith(':00') || value.endsWith(':30'))).toBe(true)
    await click(dialog.querySelector('[aria-label="Start time options"] [value="09:00"]'))
    await chooseTime(dialog, 'End time', '12:00')
    await chooseDate(dialog, 'Starts on', 'Monday, 21 September 2026')

    const preview = dialog.querySelector('.availability-dialog__preview--weekly')
    expect(preview.textContent).toContain('Every Monday, Wednesday and Friday')
    expect(preview.textContent).toContain('9:00 AM – 12:00 PM')
    expect(preview.textContent).toContain('Starting 21 Sep 2026')
    expect(preview.textContent).toContain('Continues weekly')
    expect(preview.textContent).toContain('6 × 30-minute slots each day')

    await click(button(dialog, 'Add weekly schedule'))
    expect(api.createDoctorRecurringAvailability).toHaveBeenCalledWith({
      weekdays: [1, 3, 5], startTime: '09:00', endTime: '12:00', startsOn: '2026-09-21',
    })
    expect(api.listDoctorRecurringAvailability).toHaveBeenCalledTimes(2)
    expect(api.listDoctorAvailability).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('Weekly schedule added.')
    await act(async () => root.unmount())
  })

  it('creates a bounded weekly schedule and prevents an end date before its start', async () => {
    const { host, root } = await renderPage()
    const dialog = await openWeeklyDialog(host)
    await click(dialog.querySelector('button[aria-label="Thursday"]'))
    await chooseTime(dialog, 'Start time', '16:00')
    await chooseTime(dialog, 'End time', '19:00')
    await chooseDate(dialog, 'Starts on', 'Monday, 21 September 2026')
    await click([...dialog.querySelectorAll('.availability-end-choice label')].find(label => label.textContent.includes('End on date')))
    await click(dialog.querySelector('button[aria-label^="Ends on,"]'))
    expect(dialog.querySelector('button[aria-label="Choose Sunday, 20 September 2026"]').disabled).toBe(true)
    await click(dialog.querySelector('button[aria-label="Next month"]'))
    await click(dialog.querySelector('button[aria-label="Choose Saturday, 31 October 2026"]'))
    await input(dialog.querySelector('input[name="weeklyFee"]'), '700')

    const preview = dialog.querySelector('.availability-dialog__preview--weekly')
    expect(preview.textContent).toContain('Every Thursday')
    expect(preview.textContent).toContain('Until 31 Oct 2026')
    expect(preview.textContent).toContain('6 × 30-minute slots each day')
    await click(button(dialog, 'Add weekly schedule'))
    expect(api.createDoctorRecurringAvailability).toHaveBeenCalledWith({
      weekdays: [4], startTime: '16:00', endTime: '19:00', startsOn: '2026-09-21', endsOn: '2026-10-31', fee: 700,
    })
    await act(async () => root.unmount())
  })

  it('shows the recurring overlap message without leaking the backend error', async () => {
    api.createDoctorRecurringAvailability.mockRejectedValue(Object.assign(new Error('database detail'), { code: 'AVAILABILITY_OVERLAP' }))
    const { host, root } = await renderPage()
    const dialog = await openWeeklyDialog(host)
    await click(dialog.querySelector('button[aria-label="Monday"]'))
    await chooseTime(dialog, 'Start time', '09:00')
    await chooseTime(dialog, 'End time', '10:00')
    await chooseDate(dialog, 'Starts on', 'Monday, 21 September 2026')
    await click(button(dialog, 'Add weekly schedule'))

    expect(dialog.textContent).toContain('This schedule overlaps availability you already have.')
    expect(dialog.textContent).not.toContain('database detail')
    await act(async () => root.unmount())
  })

  it('confirms and stops a weekly schedule while preserving appointment expectations', async () => {
    api.listDoctorRecurringAvailability
      .mockResolvedValueOnce({ items: [recurringRule()] })
      .mockResolvedValueOnce({ items: [recurringRule({ status: 'stopped' })] })
    const { host, root } = await renderPage()
    await click(button(host, 'Stop schedule'))
    const dialog = host.querySelector('[role="dialog"]')
    expect(dialog.textContent).toContain('Stop this weekly schedule?')
    expect(dialog.textContent).toContain('Existing patient appointments will not be cancelled.')
    await click(button(dialog, 'Stop schedule'))

    expect(api.stopDoctorRecurringAvailability).toHaveBeenCalledWith(41)
    expect(api.listDoctorRecurringAvailability).toHaveBeenCalledTimes(2)
    expect(api.listDoctorAvailability).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('Weekly schedule stopped.')
    await click(host.querySelector('.availability-previous > button'))
    expect(host.textContent).toContain('Stopped')
    await act(async () => root.unmount())
  })

  it('confirms and deletes an allowed block, then refreshes', async () => {
    api.listDoctorAvailability.mockResolvedValueOnce({ items: [block()] }).mockResolvedValueOnce({ items: [] })
    const { host, root } = await renderPage()
    await click(button(host, 'Remove block'))
    const dialog = host.querySelector('[role="dialog"]')
    expect(dialog.textContent).toContain('Remove this availability?')
    expect(dialog.textContent).toContain('Patients will no longer be able to book these open times.')
    await click(button(dialog, 'Remove availability'))
    expect(api.deleteDoctorAvailability).toHaveBeenCalledWith(8)
    expect(api.listDoctorAvailability).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('Availability removed.')
    await act(async () => root.unmount())
  })

  it('does not offer deletion for a protected block', async () => {
    api.listDoctorAvailability.mockResolvedValue({ items: [block({ isProtected: true, canDelete: false })] })
    const { host, root } = await renderPage()
    expect(host.textContent).toContain('This one-off time has appointment history and can’t be removed.')
    expect(button(host, 'Remove block')).toBeUndefined()
    await act(async () => root.unmount())
  })

  it('keeps the block and explains a protected delete response', async () => {
    api.listDoctorAvailability.mockResolvedValueOnce({ items: [block()] }).mockResolvedValueOnce({ items: [block({ isProtected: true, canDelete: false })] })
    api.deleteDoctorAvailability.mockRejectedValue(Object.assign(new Error('technical'), { code: 'AVAILABILITY_BLOCK_PROTECTED' }))
    const { host, root } = await renderPage()
    await click(button(host, 'Remove block'))
    await click(button(host.querySelector('[role="dialog"]'), 'Remove availability'))
    expect(host.textContent).toContain('This one-off time has appointment history and can’t be removed.')
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
