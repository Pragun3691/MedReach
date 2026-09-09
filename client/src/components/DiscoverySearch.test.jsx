// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LanguageProvider } from '../context/LanguageProvider.jsx'
import { DiscoverySearch } from './DiscoverySearch.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function LocationProbe() {
  const location = useLocation()
  return <output data-location={`${location.pathname}${location.search}`} />
}

async function renderSearch(initialEntry = '/') {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<LanguageProvider><MemoryRouter initialEntries={[initialEntry]}><DiscoverySearch /><LocationProbe /></MemoryRouter></LanguageProvider>)
  })
  return { host, root }
}

async function type(input, value) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => window.localStorage.clear())
afterEach(() => document.body.replaceChildren())

describe('DiscoverySearch unified query', () => {
  it('shows one unified input and no search-type selector', async () => {
    const { host, root } = await renderSearch()
    expect(host.querySelector('select')).toBeNull()
    expect(host.querySelector('input').placeholder).toBe('Search doctors, specializations, or health concerns')
    await act(async () => root.unmount())
  })

  it('does not navigate while typing and submits q from the Search button', async () => {
    const { host, root } = await renderSearch()
    await type(host.querySelector('input'), '  skin doctor  ')
    expect(host.querySelector('output').dataset.location).toBe('/')
    await act(async () => host.querySelector('button[type="submit"]').click())
    expect(host.querySelector('output').dataset.location).toBe('/doctors?q=skin+doctor')
    await act(async () => root.unmount())
  })

  it('uses the form submission path used by Enter', async () => {
    const { host, root } = await renderSearch()
    await type(host.querySelector('input'), 'Rohan')
    await act(async () => host.querySelector('form').requestSubmit())
    expect(host.querySelector('output').dataset.location).toBe('/doctors?q=Rohan')
    await act(async () => root.unmount())
  })

  it('does not generate q for trimmed-empty input', async () => {
    const { host, root } = await renderSearch()
    await type(host.querySelector('input'), '   ')
    await act(async () => host.querySelector('form').requestSubmit())
    expect(host.querySelector('output').dataset.location).toBe('/')
    await act(async () => root.unmount())
  })

  it('preserves lower filters, removes legacy primary text and offset, and replaces q', async () => {
    const { host, root } = await renderSearch('/doctors?problem=rash&specialization=Dermatology&date=2030-01-01&maxFee=700&minExperience=5&offset=10')
    await type(host.querySelector('input'), 'Dr. Rohan Mehta')
    await act(async () => host.querySelector('form').requestSubmit())
    const location = host.querySelector('output').dataset.location
    const params = new URLSearchParams(location.split('?')[1])
    expect(params.get('q')).toBe('Dr. Rohan Mehta')
    expect(params.get('problem')).toBeNull()
    expect(params.get('name')).toBeNull()
    expect(params.get('offset')).toBeNull()
    expect(Object.fromEntries(['specialization', 'date', 'maxFee', 'minExperience'].map(key => [key, params.get(key)]))).toEqual({
      specialization: 'Dermatology', date: '2030-01-01', maxFee: '700', minExperience: '5',
    })
    await act(async () => root.unmount())
  })

  it.each([
    ['en', 'खुजली', 'Find doctors'],
    ['hi', 'rash', 'डॉक्टर खोजें'],
    ['hi', 'khujli', 'डॉक्टर खोजें'],
  ])('keeps the raw %s-language search query independent from the UI language', async (language, query, buttonLabel) => {
    window.localStorage.setItem('medreach.language', language)
    const { host, root } = await renderSearch()
    await type(host.querySelector('input'), query)
    await act(async () => host.querySelector('form').requestSubmit())
    expect(new URLSearchParams(host.querySelector('output').dataset.location.split('?')[1]).get('q')).toBe(query)
    expect(host.querySelector('button[type="submit"]').textContent).toBe(buttonLabel)
    await act(async () => root.unmount())
  })
})
