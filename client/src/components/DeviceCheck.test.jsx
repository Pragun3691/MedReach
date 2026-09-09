// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../context/LanguageProvider.jsx'
import { DeviceCheck } from './DeviceCheck.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => window.localStorage.clear())
afterEach(() => document.body.replaceChildren())

async function renderCheck(mediaDevices, props = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<LanguageProvider><DeviceCheck mediaDevices={mediaDevices} {...props} /></LanguageProvider>)
    await Promise.resolve()
    await Promise.resolve()
  })
  return { host, root }
}

describe('DeviceCheck media handling', () => {
  it('reports available media and stops every track on unmount', async () => {
    const cameraTrack = { stop: vi.fn() }
    const microphoneTrack = { stop: vi.fn() }
    const cameraStream = { getTracks: () => [cameraTrack] }
    const microphoneStream = { getTracks: () => [microphoneTrack] }
    const getUserMedia = vi.fn(({ video }) => Promise.resolve(video ? cameraStream : microphoneStream))
    const { host, root } = await renderCheck({ getUserMedia })

    expect(host.textContent).toContain('CameraAvailable')
    expect(host.textContent).toContain('MicrophoneAvailable')
    expect(getUserMedia).toHaveBeenCalledTimes(2)
    await act(async () => root.unmount())
    expect(cameraTrack.stop).toHaveBeenCalledOnce()
    expect(microphoneTrack.stop).toHaveBeenCalledOnce()
  })

  it('keeps permission-denied device access non-blocking', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    const { host, root } = await renderCheck({ getUserMedia: vi.fn().mockRejectedValue(denied) })

    expect(host.textContent).toContain('Permission denied')
    expect(host.textContent).toContain('You can still continue')
    await act(async () => root.unmount())
  })
})

describe('DeviceCheck localization', () => {
  it('shows patient-facing device state in Hindi when browser media testing is unavailable', async () => {
    window.localStorage.setItem('medreach.language', 'hi')
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => { root.render(<LanguageProvider><DeviceCheck /></LanguageProvider>); await Promise.resolve() })
    expect(host.textContent).toContain('कैमरा')
    expect(host.textContent).toContain('माइक्रोफोन')
    expect(host.textContent).toContain('यह ब्राउज़र कैमरा और माइक्रोफोन टेस्ट सपोर्ट नहीं करता।')
    await act(async () => root.unmount())
  })

  it('supports an English-only doctor presentation without overwriting the saved preference', async () => {
    window.localStorage.setItem('medreach.language', 'hi')
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => { root.render(<LanguageProvider><DeviceCheck forceEnglish /></LanguageProvider>); await Promise.resolve() })
    expect(host.textContent).toContain('Camera')
    expect(host.textContent).toContain('Microphone')
    expect(window.localStorage.getItem('medreach.language')).toBe('hi')
    await act(async () => root.unmount())
  })
})
