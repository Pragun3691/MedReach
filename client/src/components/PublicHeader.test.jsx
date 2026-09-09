// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicHeader } from './PublicHeader.jsx'
import { LanguageProvider } from '../context/LanguageProvider.jsx'

const auth = vi.hoisted(() => ({ value: null }))
const api = vi.hoisted(() => ({ listNotifications: vi.fn() }))
vi.mock('../hooks/useAuth.js', () => ({ useAuth: () => auth.value }))
vi.mock('../lib/api.js', () => api)

globalThis.IS_REACT_ACT_ENVIRONMENT = true

async function renderHeader(user) {
  auth.value = { status: user ? 'authenticated' : 'anonymous', currentUser: user, logout: vi.fn() }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<LanguageProvider><MemoryRouter><PublicHeader editorial /></MemoryRouter></LanguageProvider>)
    await Promise.resolve()
  })
  return { host, root }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  api.listNotifications.mockResolvedValue({ unreadCount: 0 })
})
afterEach(() => document.body.replaceChildren())

describe('PublicHeader role-aware navigation', () => {
  it('keeps doctor navigation focused on appointments, notifications, identity, and logout', async () => {
    const { host, root } = await renderHeader({ id: 3, fullName: 'Dr. Rohan Mehta', role: 'doctor' })
    expect(host.querySelectorAll('a[href="/doctors"]')).toHaveLength(0)
    expect(host.querySelectorAll('a[href="/doctor/appointments"]')).toHaveLength(2)
    expect(host.querySelector('a[href="/notifications"]')).not.toBeNull()
    expect(host.textContent).toContain('Rohan')
    expect([...host.querySelectorAll('button')].some(button => button.textContent === 'Logout')).toBe(true)
    await act(async () => root.unmount())
  })

  it('preserves Find Doctors navigation for a patient', async () => {
    const { host, root } = await renderHeader({ id: 1, fullName: 'Ananya Rao', role: 'patient' })
    expect(host.querySelectorAll('a[href="/doctors"]')).toHaveLength(2)
    expect(host.querySelectorAll('a[href="/appointments"]')).toHaveLength(2)
    await act(async () => root.unmount())
  })
})
