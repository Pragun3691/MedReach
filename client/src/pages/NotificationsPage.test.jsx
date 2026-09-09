// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../context/LanguageProvider.jsx'
import { NotificationsPage } from './NotificationsPage.jsx'

const auth = vi.hoisted(() => ({ user: null }))
const api = vi.hoisted(() => ({ listNotifications: vi.fn(), markNotificationRead: vi.fn() }))
vi.mock('../hooks/useAuth.js', () => ({ useAuth: () => ({ currentUser: auth.user }) }))
vi.mock('../lib/api.js', () => api)
vi.mock('../components/PublicHeader.jsx', () => ({ PublicHeader: () => null }))
vi.mock('../components/PublicFooter.jsx', () => ({ PublicFooter: () => null }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const rawMessage = 'Dr. सीमा ने लिखा: Take ½ tablet after food.'

async function renderPage(role) {
  auth.user = { id: 1, fullName: role === 'patient' ? 'Asha Devi' : 'Dr. Rohan Mehta', role }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<LanguageProvider><MemoryRouter><NotificationsPage /></MemoryRouter></LanguageProvider>)
    await Promise.resolve()
    await Promise.resolve()
  })
  return { host, root }
}

beforeEach(() => {
  window.localStorage.clear()
  api.listNotifications.mockReset().mockResolvedValue({
    items: [{ id: 7, type: 'appointment_booked', message: rawMessage, actionPath: '/appointments/42', isRead: false, createdAt: '2030-01-01T08:00:00.000Z' }],
    total: 1,
    unreadCount: 1,
  })
})
afterEach(() => document.body.replaceChildren())

describe('NotificationsPage localization boundaries', () => {
  it('translates patient notification chrome but leaves the stored body byte-for-byte unchanged', async () => {
    window.localStorage.setItem('medreach.language', 'hi')
    const { host, root } = await renderPage('patient')
    expect(host.textContent).toContain('नोटिफिकेशन')
    expect(host.textContent).toContain('बुकिंग पक्की हुई')
    expect(host.querySelector('.notification-row__body > p').textContent).toBe(rawMessage)
    await act(async () => root.unmount())
  })

  it('keeps doctor notification chrome English when Hindi is saved', async () => {
    window.localStorage.setItem('medreach.language', 'hi')
    const { host, root } = await renderPage('doctor')
    expect(host.textContent).toContain('Notifications')
    expect(host.textContent).toContain('Appointment confirmed')
    expect(host.textContent).not.toContain('अपॉइंटमेंट कन्फर्म हुआ')
    await act(async () => root.unmount())
  })
})
