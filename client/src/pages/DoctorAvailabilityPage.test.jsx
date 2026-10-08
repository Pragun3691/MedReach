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
  getAvailabilityExceptions: vi.fn(), createAvailabilityException: vi.fn(), deleteAvailabilityException: vi.fn(),
  deleteAvailabilityExceptionRange: vi.fn(),
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
      { id: 81, startAt: '2030-09-21T03:30:00.000Z', endAt: '2030-09-21T04:00:00.000Z', isActive: true, isBooked: false, hasAppointmentHistory: false, isExceptionBlocked: false, isBookable: true },
      { id: 82, startAt: '2030-09-21T04:00:00.000Z', endAt: '2030-09-21T04:30:00.000Z', isActive: false, isBooked: true, hasAppointmentHistory: true, isExceptionBlocked: false, isBookable: false },
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
      isExceptionBlocked: false,
      isBookable: !(booked && index === 1),
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
      isExceptionBlocked: false,
      isBookable: true,
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

function timeOff(overrides = {}) {
  return {
    id: 71,
    date: '2026-09-24',
    allDay: false,
    startTime: '13:00',
    endTime: '15:00',
    createdAt: '2026-09-16T05:00:00.000Z',
    ...overrides,
  }
}

function timeOffRange({
  rangeId = 'f5476d25-45d7-4f21-93bb-5cbad11f634f',
  startDate = '2026-09-24',
  endDate = '2026-09-28',
  returnedDates = ['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28'],
} = {}) {
  return returnedDates.map((date, index) => timeOff({
    id: 100 + index,
    date,
    allDay: true,
    startTime: null,
    endTime: null,
    rangeId,
    rangeStartDate: startDate,
    rangeEndDate: endDate,
  }))
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

async function openTimeOffDialog(host) {
  await click(button(host, '+ Add time off'))
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
  api.getAvailabilityExceptions.mockResolvedValue({ exceptions: [] })
  api.createAvailabilityException.mockResolvedValue({ id: 71 })
  api.deleteAvailabilityException.mockResolvedValue(null)
  api.deleteAvailabilityExceptionRange.mockResolvedValue(null)
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
    expect(host.textContent).toContain('No time off scheduled.')
    expect(host.textContent).not.toContain('Time off couldn’t be loaded.')
    expect(host.textContent).toContain('No bookable availability yet.')
    expect(host.textContent).toContain('Set a regular schedule, add one-off time, or block time off as needed.')
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
    expect(browser.textContent).toContain('No bookable availability on this date.')
    expect(unavailableDate.getAttribute('aria-selected')).toBe('true')

    await click(button(browser, 'Today'))
    expect(browser.querySelector('button[aria-current="date"]').getAttribute('aria-selected')).toBe('true')
    expect(browser.textContent).toContain('No bookable availability on this date.')

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
    expect(browser.textContent).toContain('No availability or time off this month.')
    expect(browser.querySelector('.availability-date--selected')).toBeNull()
    expect(browser.textContent).toContain('Select a future date to see availability and time off.')
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
    expect(browser.textContent).toContain('No availability or time off this month.')
    expect(browser.textContent).toContain('No bookable availability yet.')
    expect(browser.textContent).toContain('Set a regular schedule, add one-off time, or block time off as needed.')
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
    expect(host.textContent).toContain('4 slots · 4 available')
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

  it('classifies recurring schedules by their effective Asia/Kolkata end date without changing stopped history', async () => {
    vi.setSystemTime(new Date('2026-09-30T18:30:00.000Z'))
    api.listDoctorRecurringAvailability.mockResolvedValue({ items: [
      recurringRule({ id: 41, weekdays: [1], endsOn: null }),
      recurringRule({ id: 42, weekdays: [2], endsOn: '2026-10-01' }),
      recurringRule({ id: 43, weekdays: [3], endsOn: '2026-09-30' }),
      recurringRule({ id: 44, weekdays: [4], endsOn: null, status: 'stopped' }),
      recurringRule({ id: 45, weekdays: [5], endsOn: '2026-10-31' }),
    ] })
    const { host, root } = await renderPage()

    const activeRules = [...host.querySelectorAll('.availability-section--regular > .availability-rules .availability-rule')]
    expect(activeRules).toHaveLength(3)
    expect(activeRules.every(rule => rule.dataset.status === 'active')).toBe(true)
    expect(activeRules.map(rule => rule.querySelector('strong').textContent)).toEqual(['Mon', 'Tue', 'Fri'])
    expect(activeRules.map(rule => rule.querySelector('.availability-rule__status').textContent)).toEqual(['Active', 'Active', 'Active'])
    expect(activeRules.flatMap(rule => [...rule.querySelectorAll('.availability-rule__stop')])).toHaveLength(3)

    const previous = host.querySelector('.availability-previous')
    const previousToggle = previous.querySelector('button[aria-expanded]')
    expect(previousToggle.textContent).toContain('Previous schedules (2)')
    await click(previousToggle)

    const previousRules = [...previous.querySelectorAll('.availability-rule')]
    expect(previousRules.map(rule => rule.dataset.status)).toEqual(['ended', 'stopped'])
    expect(previousRules.map(rule => rule.querySelector('strong').textContent)).toEqual(['Wed', 'Thu'])
    expect(previousRules.map(rule => rule.querySelector('.availability-rule__status').textContent)).toEqual(['Ended', 'Stopped'])
    expect(button(previous, 'Stop schedule')).toBeUndefined()
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

  it('loads upcoming time off, limits the sidebar summary, and can show every entry', async () => {
    api.getAvailabilityExceptions.mockResolvedValue({ exceptions: [
      timeOff(),
      timeOff({ id: 72, date: '2026-09-25', allDay: true, startTime: null, endTime: null }),
      timeOff({ id: 73, date: '2026-09-26', startTime: '09:00', endTime: '10:00' }),
      timeOff({ id: 74, date: '2026-09-27', startTime: '16:00', endTime: '17:30' }),
    ] })
    const { host, root } = await renderPage()

    expect(api.getAvailabilityExceptions).toHaveBeenCalledWith(expect.any(AbortSignal))
    const list = host.querySelector('.availability-time-off-list')
    expect(list.querySelectorAll('.availability-time-off-summary')).toHaveLength(3)
    expect(list.textContent).toContain('All day')
    await click(button(list, 'Show all time off (4)'))
    expect(list.querySelectorAll('.availability-time-off-summary')).toHaveLength(4)
    expect(button(list, 'Show less')).toBeTruthy()
    await act(async () => root.unmount())
  })

  it('keeps exception load failures distinct while preserving the availability workspace', async () => {
    api.getAvailabilityExceptions.mockRejectedValue(new Error('offline'))
    api.listDoctorAvailability.mockResolvedValue({ items: [datedBlock('2026-09-24')] })
    const { host, root } = await renderPage()

    expect(host.textContent).toContain('Time off couldn’t be loaded.')
    expect(host.textContent).toContain('Time off markers could not be loaded.')
    expect(host.querySelector('.availability-browser')).toBeTruthy()
    expect(host.textContent).toContain('9:00 AM – 10:00 AM')
    expect(host.querySelector('.doctor-availability__error')).toBeNull()
    expect(button(host, '+ Add time off').disabled).toBe(true)
    expect(button(host, 'Mark unavailable')).toBeUndefined()
    await act(async () => root.unmount())
  })

  it('shows distinct calendar markers for availability, time off, and both together', async () => {
    api.listDoctorAvailability.mockResolvedValue({ items: [
      datedBlock('2026-09-24', { id: 24 }),
      datedBlock('2026-09-26', { id: 26 }),
    ] })
    api.getAvailabilityExceptions.mockResolvedValue({ exceptions: [
      timeOff(),
      timeOff({ id: 72, date: '2026-09-25', allDay: true, startTime: null, endTime: null }),
    ] })
    const { host, root } = await renderPage()
    const browser = host.querySelector('.availability-browser')
    const both = browser.querySelector('button[aria-label*="Thursday, 24 September 2026"]')
    const timeOffOnly = browser.querySelector('button[aria-label*="Friday, 25 September 2026"]')
    const availabilityOnly = browser.querySelector('button[aria-label*="Saturday, 26 September 2026"]')

    expect(both.querySelector('.availability-browser__availability-marker')).toBeTruthy()
    expect(both.querySelector('.availability-browser__time-off-marker')).toBeTruthy()
    expect(both.getAttribute('aria-label')).toContain('bookable availability and time off')
    expect(timeOffOnly.querySelector('.availability-browser__availability-marker')).toBeNull()
    expect(timeOffOnly.querySelector('.availability-browser__time-off-marker')).toBeTruthy()
    expect(availabilityOnly.querySelector('.availability-browser__availability-marker')).toBeTruthy()
    expect(availabilityOnly.querySelector('.availability-browser__time-off-marker')).toBeNull()
    await act(async () => root.unmount())
  })

  it('extends calendar navigation to a farther-future time-off-only date while retaining the current month bound', async () => {
    api.getAvailabilityExceptions.mockResolvedValue({ exceptions: [timeOff({
      date: '2027-02-14', allDay: true, startTime: null, endTime: null,
    })] })
    const { host, root } = await renderPage()
    const browser = host.querySelector('.availability-browser')
    expect(browser.querySelector('.availability-browser__month-header h2').textContent).toBe('February 2027')
    expect(browser.querySelector('button[aria-label*="Sunday, 14 February 2027"]').getAttribute('aria-selected')).toBe('true')
    expect(browser.textContent).toContain('No bookable availability on this date.')
    expect(browser.querySelector('button[aria-label="Next month"]').disabled).toBe(true)
    for (let index = 0; index < 5; index += 1) await click(browser.querySelector('button[aria-label="Previous month"]'))
    expect(browser.querySelector('.availability-browser__month-header h2').textContent).toBe('September 2026')
    expect(browser.querySelector('button[aria-label="Previous month"]').disabled).toBe(true)
    await act(async () => root.unmount())
  })

  it('shows only a time-off marker when an all-day entry leaves no bookable slot', async () => {
    api.listDoctorAvailability.mockResolvedValue({ items: [datedBlock('2026-09-24', {
      slots: [0, 1].map(index => ({
        id: 240 + index,
        startAt: new Date(Date.parse('2026-09-24T03:30:00.000Z') + index * 30 * 60 * 1000).toISOString(),
        isActive: true, isBooked: false, isExceptionBlocked: true, isBookable: false,
      })),
    })] })
    api.getAvailabilityExceptions.mockResolvedValue({ exceptions: [timeOff({ allDay: true, startTime: null, endTime: null })] })
    const { host, root } = await renderPage()
    const date = host.querySelector('button[aria-label*="Thursday, 24 September 2026"]')
    expect(date.querySelector('.availability-browser__availability-marker')).toBeNull()
    expect(date.querySelector('.availability-browser__time-off-marker')).toBeTruthy()
    expect(date.getAttribute('aria-label')).toContain('time off')
    expect(host.querySelector('.availability-block').textContent).toContain('2 slots · 2 blocked')
    await act(async () => root.unmount())
  })

  it('renders multiple selected-date exceptions above availability', async () => {
    api.listDoctorAvailability.mockResolvedValue({ items: [datedBlock('2026-09-24')] })
    api.getAvailabilityExceptions.mockResolvedValue({ exceptions: [
      timeOff(),
      timeOff({ id: 72, startTime: '16:00', endTime: '17:00' }),
    ] })
    const { host, root } = await renderPage()
    const detail = host.querySelector('.availability-date--selected')

    expect(detail.querySelectorAll('.availability-time-off-detail')).toHaveLength(2)
    expect(detail.textContent).toContain('1:00 PM – 3:00 PM')
    expect(detail.textContent).toContain('4:00 PM – 5:00 PM')
    expect(detail.textContent).toContain('Unavailable')
    expect(detail.querySelector('.availability-date__time-off h4')).toBeNull()
    expect(detail.querySelector('.availability-date__time-off').compareDocumentPosition(detail.querySelector('.availability-block')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(button(detail, 'Mark unavailable')).toBeTruthy()
    await act(async () => root.unmount())
  })

  it('uses the exact booked, blocked, available, and unavailable slot precedence and counts', async () => {
    api.listDoctorAvailability.mockResolvedValue({ items: [datedBlock('2026-09-24', {
      slots: [
        { id: 1, startAt: '2026-09-24T03:30:00.000Z', isActive: true, isBooked: true, isExceptionBlocked: true, isBookable: false },
        { id: 2, startAt: '2026-09-24T04:00:00.000Z', isActive: true, isBooked: false, isExceptionBlocked: true, isBookable: false },
        { id: 3, startAt: '2026-09-24T04:30:00.000Z', isActive: true, isBooked: false, isExceptionBlocked: false, isBookable: true },
        { id: 4, startAt: '2026-09-24T05:00:00.000Z', isActive: false, isBooked: false, isExceptionBlocked: true, isBookable: false },
      ],
    })] })
    const { host, root } = await renderPage()
    const blockElement = host.querySelector('.availability-block')
    expect(blockElement.textContent).toContain('4 slots · 1 available · 1 booked · 1 blocked')
    await click(blockElement.querySelector('.availability-block__disclosure'))
    expect([...blockElement.querySelectorAll('.availability-slots [data-state]')].map(item => item.textContent)).toEqual(['Booked', 'Blocked', 'Available', 'Unavailable'])
    await act(async () => root.unmount())
  })

  it('creates all-day time off from the sidebar and navigates to the new date after refetch', async () => {
    const available = datedBlock('2026-09-24')
    const blocked = datedBlock('2026-09-24', {
      slots: available.slots.map(slot => ({
        ...slot,
        isExceptionBlocked: true,
        isBookable: false,
      })),
    })
    api.listDoctorAvailability
      .mockResolvedValueOnce({ items: [available] })
      .mockResolvedValueOnce({ items: [blocked] })
    api.getAvailabilityExceptions
      .mockResolvedValueOnce({ exceptions: [] })
      .mockResolvedValueOnce({ exceptions: [timeOff({ allDay: true, startTime: null, endTime: null })] })
    const { host, root } = await renderPage()
    const dialog = await openTimeOffDialog(host)
    await click(dialog.querySelector('button[aria-label^="Time off date,"]'))
    await click(dialog.querySelector('button[aria-label="Choose Thursday, 24 September 2026"]'))
    await click([...dialog.querySelectorAll('.availability-time-off-choice label')].find(label => label.textContent.includes('All day')))
    expect(dialog.textContent).toContain('Unavailable all day')
    await click(button(dialog, 'Add time off'))

    expect(api.createAvailabilityException).toHaveBeenCalledWith({ date: '2026-09-24', allDay: true })
    expect(api.getAvailabilityExceptions).toHaveBeenCalledTimes(2)
    expect(api.listDoctorAvailability).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('Time off added.')
    expect(host.querySelector('button[aria-label*="Thursday, 24 September 2026"]').getAttribute('aria-selected')).toBe('true')
    expect(host.querySelector('.availability-block').textContent).toContain('2 slots · 2 blocked')
    expect(host.querySelector('.doctor-availability__error')).toBeNull()
    expect(button(host.querySelector('.availability-date--selected'), 'Mark unavailable')).toBeUndefined()
    await act(async () => root.unmount())
  })

  it('retains the last loaded Availability when its post-create refetch fails', async () => {
    api.listDoctorAvailability
      .mockResolvedValueOnce({ items: [datedBlock('2026-09-24')] })
      .mockRejectedValueOnce(new Error('temporary network failure'))
    api.getAvailabilityExceptions
      .mockResolvedValueOnce({ exceptions: [] })
      .mockResolvedValueOnce({ exceptions: [timeOff({ allDay: true, startTime: null, endTime: null })] })
    const { host, root } = await renderPage()
    const dialog = await openTimeOffDialog(host)
    await click(dialog.querySelector('button[aria-label^="Time off date,"]'))
    await click(dialog.querySelector('button[aria-label="Choose Thursday, 24 September 2026"]'))
    await click([...dialog.querySelectorAll('.availability-time-off-choice label')].find(label => label.textContent.includes('All day')))
    await click(button(dialog, 'Add time off'))

    expect(api.createAvailabilityException).toHaveBeenCalledWith({ date: '2026-09-24', allDay: true })
    expect(api.getAvailabilityExceptions).toHaveBeenCalledTimes(2)
    expect(api.listDoctorAvailability).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('Time off added.')
    expect(host.textContent).toContain('Availability couldn’t be refreshed. Showing your last loaded schedule.')
    expect(host.querySelector('.availability-browser')).toBeTruthy()
    expect(host.querySelector('.availability-block').textContent).toContain('2 slots · 2 available')
    expect(host.querySelector('.availability-time-off-detail')).toBeTruthy()
    expect(host.querySelector('.doctor-availability__error')).toBeNull()
    await act(async () => root.unmount())
  })

  it('opens one concise dialog from the selected date with the earliest bookable slot and a 30-minute end', async () => {
    api.listDoctorAvailability.mockResolvedValue({ items: [datedBlock('2026-09-24', {
      slots: [
        { id: 1, startAt: '2026-09-24T03:00:00.000Z', endAt: '2026-09-24T03:30:00.000Z', isActive: false, isBooked: true, isExceptionBlocked: false, isBookable: false },
        { id: 2, startAt: '2026-09-24T03:30:00.000Z', endAt: '2026-09-24T04:00:00.000Z', isActive: true, isBooked: false, isExceptionBlocked: true, isBookable: false },
        { id: 3, startAt: '2026-09-24T04:00:00.000Z', endAt: '2026-09-24T04:30:00.000Z', isActive: false, isBooked: false, isExceptionBlocked: false, isBookable: false },
        { id: 4, startAt: '2026-09-24T04:30:00.000Z', endAt: '2026-09-24T05:00:00.000Z', isActive: true, isBooked: false, isExceptionBlocked: false, isBookable: true },
        { id: 5, startAt: '2026-09-24T05:00:00.000Z', endAt: '2026-09-24T05:30:00.000Z', isActive: true, isBooked: false, isExceptionBlocked: false, isBookable: true },
      ],
    })] })
    const { host, root } = await renderPage()
    const sidebar = host.querySelector('.availability-time-off-settings')
    expect(sidebar.querySelector('h3').textContent).toBe('Time off')
    expect(sidebar.textContent).toContain('Block a date or part of a day without changing your regular schedule.')
    await click(button(host.querySelector('.availability-date--selected'), 'Mark unavailable'))
    const dialog = host.querySelector('[role="dialog"]')
    expect([...dialog.querySelectorAll('h2')].map(heading => heading.textContent)).toEqual(['Add time off'])
    expect(dialog.querySelector('.availability-dialog__heading p')).toBeNull()
    expect(dialog.textContent).toContain('Block booking for a date or part of a day. Your regular schedule stays unchanged.')
    expect(dialog.querySelector('button[aria-label="Time off date, Thu, 24 Sep 2026"]')).toBeTruthy()
    expect(dialog.querySelector('button[aria-label="Start time, 10:00 AM"]')).toBeTruthy()
    expect(dialog.querySelector('button[aria-label="End time, 10:30 AM"]')).toBeTruthy()
    await act(async () => root.unmount())
  })

  it('uses the currently selected calendar date and its earliest bookable slot from the sidebar', async () => {
    api.listDoctorAvailability.mockResolvedValue({ items: [
      datedBlock('2026-09-24'),
      datedBlock('2026-09-25', { startTime: '14:00', endTime: '15:00' }),
    ] })
    const { host, root } = await renderPage()
    await click(host.querySelector('button[aria-label*="Friday, 25 September 2026"]'))
    await click(button(host.querySelector('.availability-time-off-settings'), '+ Add time off'))
    const dialog = host.querySelector('[role="dialog"]')

    expect(dialog.querySelector('button[aria-label="Time off date, Fri, 25 Sep 2026"]')).toBeTruthy()
    expect(dialog.querySelector('button[aria-label="Start time, 2:00 PM"]')).toBeTruthy()
    expect(dialog.querySelector('button[aria-label="End time, 2:30 PM"]')).toBeTruthy()
    await act(async () => root.unmount())
  })

  it('keeps a selected future date but leaves times unchosen when no slot is bookable', async () => {
    api.listDoctorAvailability.mockResolvedValue({ items: [datedBlock('2026-09-24', {
      slots: [
        { id: 1, startAt: '2026-09-24T03:30:00.000Z', endAt: '2026-09-24T04:00:00.000Z', isActive: false, isBooked: true, isExceptionBlocked: false, isBookable: false },
        { id: 2, startAt: '2026-09-24T04:00:00.000Z', endAt: '2026-09-24T04:30:00.000Z', isActive: true, isBooked: false, isExceptionBlocked: true, isBookable: false },
      ],
    })] })
    api.getAvailabilityExceptions.mockResolvedValue({ exceptions: [timeOff()] })
    const { host, root } = await renderPage()
    await click(button(host.querySelector('.availability-date--selected'), 'Mark unavailable'))
    const dialog = host.querySelector('[role="dialog"]')

    expect(dialog.querySelector('button[aria-label="Time off date, Thu, 24 Sep 2026"]')).toBeTruthy()
    expect(dialog.querySelector('button[aria-label="Start time, choose a time"]')).toBeTruthy()
    expect(dialog.querySelector('button[aria-label="End time, choose a time"]').disabled).toBe(true)
    expect([...dialog.querySelectorAll('.availability-time-off-choice label')].some(label => label.textContent.includes('All day'))).toBe(true)
    await act(async () => root.unmount())
  })

  it('allows a partially elapsed interval today only when its end remains in the future', async () => {
    const { host, root } = await renderPage()
    const dialog = await openTimeOffDialog(host)
    await click(dialog.querySelector('button[aria-label^="Time off date,"]'))
    await click(dialog.querySelector('button[aria-label="Choose Wednesday, 16 September 2026"]'))
    await chooseTime(dialog, 'Start time', '09:00')
    await chooseTime(dialog, 'End time', '10:00')
    await click(button(dialog, 'Add time off'))
    expect(dialog.textContent).toContain('has not fully elapsed')
    expect(api.createAvailabilityException).not.toHaveBeenCalled()
    await chooseTime(dialog, 'End time', '10:30')
    await click(button(dialog, 'Add time off'))
    expect(api.createAvailabilityException).toHaveBeenCalledWith({ date: '2026-09-16', allDay: false, startTime: '09:00', endTime: '10:30' })
    await act(async () => root.unmount())
  })

  it('explains booked appointment conflicts without exposing backend details', async () => {
    api.createAvailabilityException.mockRejectedValue(Object.assign(new Error('patient 9 diagnosis'), {
      code: 'AVAILABILITY_EXCEPTION_BOOKED_CONFLICT', details: { conflictCount: 2 },
    }))
    const { host, root } = await renderPage()
    const dialog = await openTimeOffDialog(host)
    await click(dialog.querySelector('button[aria-label^="Time off date,"]'))
    await click(dialog.querySelector('button[aria-label="Choose Thursday, 24 September 2026"]'))
    await chooseTime(dialog, 'Start time', '13:00')
    await chooseTime(dialog, 'End time', '15:00')
    await click(button(dialog, 'Add time off'))

    expect(dialog.textContent).toContain('Time off can’t be added because 2 booked appointments overlap this period.')
    expect(dialog.textContent).not.toContain('diagnosis')
    expect(dialog.querySelector('a[href="/doctor/appointments"]')).toBeTruthy()
    await act(async () => root.unmount())
  })

  it.each([
    ['AVAILABILITY_EXCEPTION_OVERLAP', 'This period overlaps time off you already added.'],
    ['AVAILABILITY_EXCEPTION_IN_PAST', 'This time has already passed.'],
  ])('maps %s to a safe time-off message', async (code, expectedMessage) => {
    api.createAvailabilityException.mockRejectedValue(Object.assign(new Error('database detail'), { code }))
    const { host, root } = await renderPage()
    const dialog = await openTimeOffDialog(host)
    await click(dialog.querySelector('button[aria-label^="Time off date,"]'))
    await click(dialog.querySelector('button[aria-label="Choose Thursday, 24 September 2026"]'))
    await chooseTime(dialog, 'Start time', '13:00')
    await chooseTime(dialog, 'End time', '15:00')
    await click(button(dialog, 'Add time off'))
    expect(dialog.textContent).toContain(expectedMessage)
    expect(dialog.textContent).not.toContain('database detail')
    await act(async () => root.unmount())
  })

  it('confirms time-off removal, explains slot behavior, and refreshes both resources', async () => {
    api.getAvailabilityExceptions.mockResolvedValueOnce({ exceptions: [timeOff()] }).mockResolvedValueOnce({ exceptions: [] })
    const { host, root } = await renderPage()
    await click(button(host.querySelector('.availability-time-off-detail'), 'Remove time off'))
    const dialog = host.querySelector('[role="dialog"]')
    expect(dialog.textContent).toContain('Any underlying active availability for this period may become bookable again.')
    expect(dialog.textContent).toContain('Existing appointments will not be changed.')
    await click(button(dialog, 'Remove time off'))

    expect(api.deleteAvailabilityException).toHaveBeenCalledWith(71)
    expect(api.getAvailabilityExceptions).toHaveBeenCalledTimes(2)
    expect(api.listDoctorAvailability).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('Time off removed.')
    expect(host.querySelector('button[aria-label*="Thursday, 24 September 2026"]').getAttribute('aria-selected')).toBe('true')
    expect(host.querySelector('#availability-browse-date-2026-09-24')).toBeTruthy()
    await act(async () => root.unmount())
  })

  it('defaults to One day and switches to an all-day date range without losing smart single-day defaults', async () => {
    api.listDoctorAvailability.mockResolvedValue({ items: [datedBlock('2026-09-24', { startTime: '14:00', endTime: '15:00' })] })
    const { host, root } = await renderPage()
    const dialog = await openTimeOffDialog(host)

    expect(dialog.querySelector('input[name="time-off-mode"]:checked').nextElementSibling.textContent).toBe('One day')
    expect(dialog.querySelector('button[aria-label="Time off date, Thu, 24 Sep 2026"]')).toBeTruthy()
    expect(dialog.querySelector('button[aria-label="Start time, 2:00 PM"]')).toBeTruthy()
    await click([...dialog.querySelectorAll('.availability-time-off-mode label')].find(label => label.textContent.includes('Date range')))
    expect(dialog.querySelector('button[aria-label="Start date, Thu, 24 Sep 2026"]')).toBeTruthy()
    expect(dialog.textContent).not.toContain('Time off type')
    expect(dialog.querySelector('button[aria-label^="Start time,"]')).toBeNull()
    expect(dialog.textContent).toContain('All selected days will be unavailable.')

    await click([...dialog.querySelectorAll('.availability-time-off-mode label')].find(label => label.textContent.includes('One day')))
    expect(dialog.querySelector('button[aria-label="Start time, 2:00 PM"]')).toBeTruthy()
    expect(dialog.querySelector('button[aria-label="End time, 2:30 PM"]')).toBeTruthy()
    await act(async () => root.unmount())
  })

  it('validates range dates and submits exactly one all-day range payload', async () => {
    const { host, root } = await renderPage()
    const dialog = await openTimeOffDialog(host)
    await click([...dialog.querySelectorAll('.availability-time-off-mode label')].find(label => label.textContent.includes('Date range')))
    await click(button(dialog, 'Add time off'))
    expect(dialog.textContent).toContain('Choose a start date.')

    await chooseDate(dialog, 'Start date', 'Thursday, 24 September 2026')
    await click(button(dialog, 'Add time off'))
    expect(dialog.textContent).toContain('Choose an end date.')
    await click(dialog.querySelector('button[aria-label^="End date,"]'))
    expect(dialog.querySelector('button[aria-label="Choose Thursday, 24 September 2026"]').disabled).toBe(true)
    await click(dialog.querySelector('button[aria-label="Choose Monday, 28 September 2026"]'))

    expect(dialog.textContent).toContain('24–28 September 2026')
    expect(dialog.textContent).toContain('Unavailable all day')
    expect(dialog.textContent).not.toContain('Start time')
    await click(button(dialog, 'Add time off'))
    expect(api.createAvailabilityException).toHaveBeenCalledWith({
      startDate: '2026-09-24', endDate: '2026-09-28', allDay: true,
    })
    expect(host.textContent).toContain('Time off added for 24–28 Sep.')
    await act(async () => root.unmount())
  })

  it('accepts 31 inclusive days and rejects 32 with a friendly message', async () => {
    const { host, root } = await renderPage()
    const dialog = await openTimeOffDialog(host)
    await click([...dialog.querySelectorAll('.availability-time-off-mode label')].find(label => label.textContent.includes('Date range')))
    await chooseDate(dialog, 'Start date', 'Thursday, 24 September 2026')
    await click(dialog.querySelector('button[aria-label^="End date,"]'))
    await click(dialog.querySelector('button[aria-label="Next month"]'))
    await click(dialog.querySelector('button[aria-label="Choose Sunday, 25 October 2026"]'))
    await click(button(dialog, 'Add time off'))
    expect(dialog.textContent).toContain('Time off can cover up to 31 days at a time.')
    expect(api.createAvailabilityException).not.toHaveBeenCalled()

    await click(dialog.querySelector('button[aria-label^="End date,"]'))
    await click(dialog.querySelector('button[aria-label="Choose Saturday, 24 October 2026"]'))
    await click(button(dialog, 'Add time off'))
    expect(api.createAvailabilityException).toHaveBeenCalledWith({
      startDate: '2026-09-24', endDate: '2026-10-24', allDay: true,
    })
    await act(async () => root.unmount())
  })

  it('clears an end date that becomes invalid when the range start changes', async () => {
    const { host, root } = await renderPage()
    const dialog = await openTimeOffDialog(host)
    await click([...dialog.querySelectorAll('.availability-time-off-mode label')].find(label => label.textContent.includes('Date range')))
    await chooseDate(dialog, 'Start date', 'Thursday, 24 September 2026')
    await chooseDate(dialog, 'End date', 'Monday, 28 September 2026')
    await chooseDate(dialog, 'Start date', 'Tuesday, 29 September 2026')
    expect(dialog.querySelector('button[aria-label="End date, choose a date"]')).toBeTruthy()
    await click(button(dialog, 'Add time off'))
    expect(dialog.textContent).toContain('Choose an end date.')
    await act(async () => root.unmount())
  })

  it('groups daily range rows into logical sidebar entries using authoritative bounds', async () => {
    api.getAvailabilityExceptions.mockResolvedValue({ exceptions: [
      ...timeOffRange({ returnedDates: ['2026-09-26', '2026-09-27', '2026-09-28'] }),
      timeOff({ id: 201, date: '2026-09-29' }),
      timeOff({ id: 202, date: '2026-09-30', allDay: true, startTime: null, endTime: null }),
      ...timeOffRange({
        rangeId: '78409f95-84aa-42ea-a0e1-72caba949678',
        startDate: '2026-10-01', endDate: '2026-10-02', returnedDates: ['2026-10-01', '2026-10-02'],
      }),
    ] })
    const { host, root } = await renderPage()
    const list = host.querySelector('.availability-time-off-list')

    expect(list.querySelectorAll('.availability-time-off-summary')).toHaveLength(3)
    expect([...list.querySelectorAll('.availability-time-off-summary strong')].filter(item => item.textContent === '24–28 Sep')).toHaveLength(1)
    expect(list.textContent).toContain('Show all time off (4)')
    await click(button(list, 'Show all time off (4)'))
    expect(list.querySelectorAll('.availability-time-off-summary')).toHaveLength(4)
    expect(list.textContent).toContain('1–2 Oct')
    expect(list.textContent).toContain('29 Sep 2026')
    expect(list.textContent).toContain('30 Sep 2026')
    await act(async () => root.unmount())
  })

  it('shows one logical range on a selected child date and removes it through the range endpoint', async () => {
    const rows = timeOffRange()
    api.getAvailabilityExceptions.mockResolvedValueOnce({ exceptions: rows }).mockResolvedValueOnce({ exceptions: [] })
    const { host, root } = await renderPage()
    await click(host.querySelector('button[aria-label*="Saturday, 26 September 2026"]'))
    const detail = host.querySelector('.availability-date--selected')
    expect(detail.querySelectorAll('.availability-time-off-detail')).toHaveLength(1)
    expect(detail.textContent).toContain('Unavailable')
    expect(detail.textContent).toContain('All day')
    expect(detail.textContent).toContain('24–28 Sep')

    await click(button(detail, 'Remove time off'))
    const dialog = host.querySelector('[role="dialog"]')
    expect(dialog.textContent).toContain('Remove 24–28 Sep time off?')
    expect(dialog.textContent).toContain('across these dates may become bookable again')
    await click(button(dialog, 'Remove time off'))
    expect(api.deleteAvailabilityExceptionRange).toHaveBeenCalledWith('f5476d25-45d7-4f21-93bb-5cbad11f634f')
    expect(api.deleteAvailabilityException).not.toHaveBeenCalled()
    expect(api.getAvailabilityExceptions).toHaveBeenCalledTimes(2)
    expect(api.listDoctorAvailability).toHaveBeenCalledTimes(2)
    expect(host.querySelector('#availability-browse-date-2026-09-26')).toBeTruthy()
    await act(async () => root.unmount())
  })

  it.each([
    [1, 'Time off can’t be added because 1 booked appointment falls within this period.'],
    [2, 'Time off can’t be added because 2 booked appointments fall within this period.'],
  ])('shows safe range conflict copy for %i booked appointment(s)', async (conflictCount, expected) => {
    api.createAvailabilityException.mockRejectedValue(Object.assign(new Error('patient private data'), {
      code: 'AVAILABILITY_EXCEPTION_BOOKED_CONFLICT', details: { conflictCount },
    }))
    const { host, root } = await renderPage()
    const dialog = await openTimeOffDialog(host)
    await click([...dialog.querySelectorAll('.availability-time-off-mode label')].find(label => label.textContent.includes('Date range')))
    await chooseDate(dialog, 'Start date', 'Thursday, 24 September 2026')
    await chooseDate(dialog, 'End date', 'Monday, 28 September 2026')
    await click(button(dialog, 'Add time off'))
    expect(dialog.textContent).toContain(expected)
    expect(dialog.textContent).not.toContain('private data')
    expect(dialog.querySelector('a[href="/doctor/appointments"]')).toBeTruthy()
    await act(async () => root.unmount())
  })

  it('uses range-specific overlap copy without merging entries', async () => {
    api.createAvailabilityException.mockRejectedValue(Object.assign(new Error('database detail'), {
      code: 'AVAILABILITY_EXCEPTION_OVERLAP',
    }))
    const { host, root } = await renderPage()
    const dialog = await openTimeOffDialog(host)
    await click([...dialog.querySelectorAll('.availability-time-off-mode label')].find(label => label.textContent.includes('Date range')))
    await chooseDate(dialog, 'Start date', 'Thursday, 24 September 2026')
    await chooseDate(dialog, 'End date', 'Monday, 28 September 2026')
    await click(button(dialog, 'Add time off'))
    expect(dialog.textContent).toContain('This date range overlaps time off you already added.')
    expect(dialog.textContent).not.toContain('database detail')
    await act(async () => root.unmount())
  })

  it('maps backend range validation to safe date guidance', async () => {
    api.createAvailabilityException.mockRejectedValue(Object.assign(new Error('internal detail'), {
      code: 'VALIDATION_ERROR', details: [{ field: 'endDate', message: 'Time off range cannot exceed 31 calendar days' }],
    }))
    const { host, root } = await renderPage()
    const dialog = await openTimeOffDialog(host)
    await click([...dialog.querySelectorAll('.availability-time-off-mode label')].find(label => label.textContent.includes('Date range')))
    await chooseDate(dialog, 'Start date', 'Thursday, 24 September 2026')
    await chooseDate(dialog, 'End date', 'Monday, 28 September 2026')
    await click(button(dialog, 'Add time off'))
    expect(dialog.textContent).toContain('Time off can cover up to 31 days at a time.')
    expect(dialog.textContent).not.toContain('internal detail')
    await act(async () => root.unmount())
  })

  it('maps exception conflicts in the existing one-off availability dialog', async () => {
    api.createDoctorAvailability.mockRejectedValue(Object.assign(new Error('technical'), { code: 'AVAILABILITY_EXCEPTION_CONFLICT' }))
    const { host, root } = await renderPage()
    const dialog = await openAddDialog(host)
    await chooseSeptember24(dialog)
    await chooseTime(dialog, 'Start time', '10:30')
    await chooseTime(dialog, 'End time', '12:30')
    await click(button(dialog, 'Add availability'))
    expect(dialog.textContent).toContain('This time overlaps time off you added. Remove the time off or choose another time.')
    expect(dialog.textContent).not.toContain('technical')
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
