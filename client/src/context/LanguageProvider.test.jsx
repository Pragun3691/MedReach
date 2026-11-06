// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLanguage } from '../hooks/useLanguage.js'
import { translateMessage } from '../i18n/messages.js'
import { LanguageProvider } from './LanguageProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function Probe() {
  const { language, locale, setLanguage } = useLanguage()
  return <><output>{language}:{locale}</output><button onClick={() => setLanguage('hi')} type="button">Hindi</button><Link to="/next">Next</Link></>
}

async function renderProvider() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(<LanguageProvider><MemoryRouter><Routes><Route element={<Probe />} path="*" /></Routes></MemoryRouter></LanguageProvider>))
  return { host, root }
}

beforeEach(() => window.localStorage.clear())
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks() })

describe('LanguageProvider', () => {
  it('ships the patient-friendly Hindi hero and booking wording', () => {
    expect(translateMessage('hi', 'home.heroTitle')).toBe('जहाँ भी हों, डॉक्टर से जुड़े रहें।')
    expect(translateMessage('hi', 'appointments.title')).toBe('मेरी बुकिंग्स')
    expect(translateMessage('hi', 'appointments.manage')).toBe('बुकिंग बदलें या कैंसल करें')
    expect(translateMessage('hi', 'consultation.checkInAt', { time: '10:45 am' })).toBe('10:45 am से आप ‘मैं तैयार हूँ’ दबा सकते हैं।')
  })

  it('defaults invalid or missing storage to English', async () => {
    window.localStorage.setItem('medreach.language', 'fr')
    const { host, root } = await renderProvider()
    expect(host.querySelector('output').textContent).toBe('en:en-IN')
    expect(document.documentElement.lang).toBe('en-IN')
    await act(async () => root.unmount())
  })

  it('falls back safely when storage cannot be read', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const { host, root } = await renderProvider()
    expect(host.querySelector('output').textContent).toBe('en:en-IN')
    await act(async () => root.unmount())
  })

  it('switches immediately, persists, updates html lang, and survives navigation and remount', async () => {
    let rendered = await renderProvider()
    await act(async () => rendered.host.querySelector('button').click())
    expect(rendered.host.querySelector('output').textContent).toBe('hi:hi-IN')
    expect(window.localStorage.getItem('medreach.language')).toBe('hi')
    expect(document.documentElement.lang).toBe('hi-IN')
    await act(async () => rendered.host.querySelector('a').click())
    expect(rendered.host.querySelector('output').textContent).toBe('hi:hi-IN')
    await act(async () => rendered.root.unmount())
    document.body.replaceChildren()
    rendered = await renderProvider()
    expect(rendered.host.querySelector('output').textContent).toBe('hi:hi-IN')
    await act(async () => rendered.root.unmount())
  })
})
