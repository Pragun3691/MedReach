// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JaasMeeting } from '../components/JaasMeeting.jsx'
import {
  jaasToolbarButtons,
  loadJaasExternalApi,
} from './jaas.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  document.head.querySelectorAll('script[data-medreach-jaas]').forEach(script => script.remove())
  delete window.JitsiMeetExternalAPI
})

describe('JaaS iframe integration', () => {
  it('loads the App-ID-scoped external API script only once', async () => {
    const first = loadJaasExternalApi('test-app-one/medreach-appointment-1')
    const second = loadJaasExternalApi('test-app-one/medreach-appointment-1')
    const scripts = document.head.querySelectorAll('script[data-medreach-jaas="test-app-one"]')
    expect(scripts).toHaveLength(1)
    expect(scripts[0].src).toBe('https://8x8.vc/test-app-one/external_api.js')

    function ExternalApi() {}
    window.JitsiMeetExternalAPI = ExternalApi
    scripts[0].dispatchEvent(new Event('load'))
    await expect(first).resolves.toBe(ExternalApi)
    await expect(second).resolves.toBe(ExternalApi)
  })

  it('mounts with authorized values, wires events, and disposes without finishing clinical state', async () => {
    const listeners = new Map()
    const removeEventListener = vi.fn((name, callback) => {
      if (listeners.get(name) === callback) listeners.delete(name)
    })
    const dispose = vi.fn()
    let constructorArguments
    class ExternalApi {
      constructor(domain, options) {
        constructorArguments = { domain, options }
      }

      addEventListener(name, callback) {
        listeners.set(name, callback)
      }

      removeEventListener(name, callback) {
        removeEventListener(name, callback)
      }

      dispose() {
        dispose()
      }
    }
    const callbacks = {
      onLocalJoined: vi.fn(),
      onParticipantJoined: vi.fn(),
      onParticipantLeft: vi.fn(),
      onConferenceLeft: vi.fn(),
      onAudioAvailabilityChanged: vi.fn(),
      onAudioMuteChanged: vi.fn(),
      onVideoAvailabilityChanged: vi.fn(),
      onVideoMuteChanged: vi.fn(),
    }
    const loadExternalApi = vi.fn().mockResolvedValue(ExternalApi)
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const session = {
      domain: '8x8.vc',
      roomName: 'test-app-two/medreach-appointment-8',
      jwt: 'short-lived-test-token',
      expiresAt: '2030-01-01T09:10:00.000Z',
      role: 'patient',
    }

    await act(async () => {
      root.render(createElement(JaasMeeting, { session, loadExternalApi, ...callbacks }))
      await Promise.resolve()
    })

    expect(loadExternalApi).toHaveBeenCalledWith(session.roomName)
    expect(constructorArguments.domain).toBe('8x8.vc')
    expect(constructorArguments.options).toMatchObject({
      roomName: session.roomName,
      jwt: session.jwt,
      width: '100%',
      height: '100%',
      configOverwrite: {
        toolbarButtons: jaasToolbarButtons,
        disableInviteFunctions: true,
      },
    })
    expect(constructorArguments.options).not.toHaveProperty('privateKey')

    listeners.get('videoConferenceJoined')({ id: 'local-id' })
    listeners.get('participantJoined')({ id: 'jitsi-id', userContext: { id: '10' } })
    listeners.get('participantLeft')({ id: 'jitsi-id' })
    listeners.get('videoConferenceLeft')({ roomName: session.roomName })
    listeners.get('readyToClose')()
    listeners.get('audioAvailabilityChanged')({ available: true })
    listeners.get('audioMuteStatusChanged')({ muted: true })
    listeners.get('videoAvailabilityChanged')({ available: true })
    listeners.get('videoMuteStatusChanged')({ muted: false })
    expect(callbacks.onLocalJoined).toHaveBeenCalledWith({ id: 'local-id' })
    expect(callbacks.onParticipantJoined).toHaveBeenCalledWith({ id: 'jitsi-id', userContext: { id: '10' } })
    expect(callbacks.onParticipantLeft).toHaveBeenCalledWith({ id: 'jitsi-id' })
    expect(callbacks.onConferenceLeft).toHaveBeenCalledTimes(2)
    expect(callbacks.onAudioAvailabilityChanged).toHaveBeenCalledWith({ available: true })
    expect(callbacks.onAudioMuteChanged).toHaveBeenCalledWith({ muted: true })
    expect(callbacks.onVideoAvailabilityChanged).toHaveBeenCalledWith({ available: true })
    expect(callbacks.onVideoMuteChanged).toHaveBeenCalledWith({ muted: false })

    await act(async () => root.unmount())
    expect(removeEventListener).toHaveBeenCalledTimes(9)
    expect(listeners.size).toBe(0)
    expect(dispose).toHaveBeenCalledOnce()
    host.remove()
  })
})
