// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeviceCheck } from './DeviceCheck.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

async function renderCheck(mediaDevices) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => { root.render(createElement(DeviceCheck, { mediaDevices })); await Promise.resolve(); await Promise.resolve() })
  return { host, root }
}

afterEach(() => { document.body.replaceChildren() })

describe('DeviceCheck', () => {
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

  it('handles denied permission without blocking the user', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    const { host, root } = await renderCheck({ getUserMedia: vi.fn().mockRejectedValue(denied) })
    expect(host.textContent).toContain('Permission denied')
    expect(host.textContent).toContain('You can still continue')
    await act(async () => root.unmount())
  })
})
