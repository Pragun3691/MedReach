// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DoctorResultsPage } from './DoctorResultsPage.jsx'
import { LanguageProvider } from '../context/LanguageProvider.jsx'

const api = vi.hoisted(() => ({ listSpecializations: vi.fn(), searchDoctors: vi.fn() }))
vi.mock('../lib/api.js', () => api)
vi.mock('../components/PublicHeader.jsx', () => ({ PublicHeader: () => null }))
vi.mock('../components/PublicFooter.jsx', () => ({ PublicFooter: () => null }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

async function renderPage(entry) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<LanguageProvider><MemoryRouter initialEntries={[entry]}><DoctorResultsPage /></MemoryRouter></LanguageProvider>)
    await Promise.resolve()
    await Promise.resolve()
  })
  return { host, root }
}

beforeEach(() => {
  window.localStorage.clear()
  api.searchDoctors.mockReset().mockResolvedValue({ items: [], total: 0, limit: 10, offset: 0 })
  api.listSpecializations.mockReset().mockResolvedValue({ items: [] })
})
afterEach(() => document.body.replaceChildren())

describe('DoctorResultsPage search compatibility', () => {
  it('forwards q with lower filters and displays the unified query', async () => {
    const { host, root } = await renderPage('/doctors?q=skin+doctor&specialization=Dermatology&maxFee=700')
    const params = api.searchDoctors.mock.calls[0][0]
    expect(params.get('q')).toBe('skin doctor')
    expect(params.get('specialization')).toBe('Dermatology')
    expect(params.get('maxFee')).toBe('700')
    expect(host.textContent).toContain('skin doctor')
    expect(host.querySelector('input').value).toBe('skin doctor')
    expect(host.querySelector('[aria-label="Specialization filter"]')).not.toBeNull()
    expect(host.querySelector('[aria-label^="Availability filter:"]')).not.toBeNull()
    expect(host.querySelector('[aria-label="Fee filter"]')).not.toBeNull()
    expect(host.querySelector('[aria-label="Experience filter"]')).not.toBeNull()
    expect(host.querySelector('[aria-label="All filters"]')).not.toBeNull()
    await act(async () => root.unmount())
  })

  it.each([
    ['/doctors?problem=rash', 'problem', 'rash'],
    ['/doctors?specialization=Dermatology', 'specialization', 'Dermatology'],
    ['/doctors?name=Rohan', 'name', 'Rohan'],
  ])('keeps legacy result URLs working for %s', async (entry, key, value) => {
    const { host, root } = await renderPage(entry)
    const params = api.searchDoctors.mock.calls[0][0]
    expect(params.get(key)).toBe(value)
    expect(host.textContent).toContain(value)
    expect(host.querySelector('input').value).toBe(value)
    await act(async () => root.unmount())
  })

  it('shows a Hindi specialization label while keeping the canonical API filter value', async () => {
    window.localStorage.setItem('medreach.language', 'hi')
    api.listSpecializations.mockResolvedValue({ items: [{ id: 2, name: 'Dermatology' }] })
    const { host, root } = await renderPage('/doctors?specialization=Dermatology')
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const params = api.searchDoctors.mock.calls[0][0]
    expect(params.get('specialization')).toBe('Dermatology')
    expect(host.querySelector('[aria-label="स्पेशलिटी फ़िल्टर"]').textContent).toContain('त्वचा रोग')
    expect(host.textContent).toContain('त्वचा रोग')
    await act(async () => root.unmount())
  })
})
