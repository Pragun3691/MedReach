const jaasDomain = '8x8.vc'
const safeRoomPart = /^[A-Za-z0-9_-]+$/
const scriptLoads = new Map()

export const jaasToolbarButtons = Object.freeze(['microphone', 'camera', 'hangup'])

export function jaasAppIdFromRoomName(roomName) {
  const parts = String(roomName).split('/')
  if (parts.length !== 2 || !parts.every(part => safeRoomPart.test(part))) {
    throw new Error('Invalid authorized JaaS room name')
  }
  return parts[0]
}

export function loadJaasExternalApi(roomName, {
  documentObject = document,
  windowObject = window,
} = {}) {
  if (windowObject.JitsiMeetExternalAPI) return Promise.resolve(windowObject.JitsiMeetExternalAPI)

  const appId = jaasAppIdFromRoomName(roomName)
  const source = `https://${jaasDomain}/${appId}/external_api.js`
  if (scriptLoads.has(source)) return scriptLoads.get(source)

  const promise = new Promise((resolve, reject) => {
    const existing = documentObject.querySelector(`script[data-medreach-jaas="${appId}"]`)
    const script = existing ?? documentObject.createElement('script')

    function loaded() {
      if (windowObject.JitsiMeetExternalAPI) {
        resolve(windowObject.JitsiMeetExternalAPI)
      } else {
        scriptLoads.delete(source)
        reject(new Error('JaaS iframe API did not initialize'))
      }
    }

    function failed() {
      scriptLoads.delete(source)
      reject(new Error('JaaS iframe API could not be loaded'))
    }

    script.addEventListener('load', loaded, { once: true })
    script.addEventListener('error', failed, { once: true })
    if (!existing) {
      script.src = source
      script.async = true
      script.dataset.medreachJaas = appId
      documentObject.head.append(script)
    }
  })
  scriptLoads.set(source, promise)
  return promise
}

const callbackEvents = Object.freeze({
  videoConferenceJoined: 'onLocalJoined',
  participantJoined: 'onParticipantJoined',
  participantLeft: 'onParticipantLeft',
  videoConferenceLeft: 'onConferenceLeft',
  readyToClose: 'onConferenceLeft',
  audioAvailabilityChanged: 'onAudioAvailabilityChanged',
  audioMuteStatusChanged: 'onAudioMuteChanged',
  videoAvailabilityChanged: 'onVideoAvailabilityChanged',
  videoMuteStatusChanged: 'onVideoMuteChanged',
})

export async function mountJaasMeeting({
  parentNode,
  session,
  callbacks = {},
  loadExternalApi = loadJaasExternalApi,
}) {
  if (!parentNode) throw new Error('A JaaS meeting container is required')
  if (session.domain !== jaasDomain) throw new Error('Invalid authorized JaaS domain')

  const JitsiMeetExternalAPI = await loadExternalApi(session.roomName)
  const api = new JitsiMeetExternalAPI(session.domain, {
    roomName: session.roomName,
    jwt: session.jwt,
    parentNode,
    width: '100%',
    height: '100%',
    configOverwrite: {
      toolbarButtons: jaasToolbarButtons,
      disableInviteFunctions: true,
    },
  })
  const listeners = []

  for (const [eventName, callbackName] of Object.entries(callbackEvents)) {
    const callback = callbacks[callbackName]
    if (typeof callback !== 'function') continue
    api.addEventListener(eventName, callback)
    listeners.push([eventName, callback])
  }

  let disposed = false
  return {
    api,
    dispose() {
      if (disposed) return
      disposed = true
      for (const [eventName, callback] of listeners) {
        api.removeEventListener(eventName, callback)
      }
      api.dispose()
    },
  }
}
