import { useEffect, useRef } from 'react'
import { loadJaasExternalApi, mountJaasMeeting } from '../lib/jaas.js'

export function JaasMeeting({
  session,
  onLocalJoined,
  onParticipantJoined,
  onParticipantLeft,
  onConferenceLeft,
  onAudioAvailabilityChanged,
  onAudioMuteChanged,
  onVideoAvailabilityChanged,
  onVideoMuteChanged,
  onError,
  loadExternalApi = loadJaasExternalApi,
  className,
}) {
  const containerRef = useRef(null)
  const domain = session.domain
  const roomName = session.roomName
  const jwt = session.jwt

  useEffect(() => {
    let active = true
    let meeting
    const callbacks = {
      onLocalJoined,
      onParticipantJoined,
      onParticipantLeft,
      onConferenceLeft,
      onAudioAvailabilityChanged,
      onAudioMuteChanged,
      onVideoAvailabilityChanged,
      onVideoMuteChanged,
    }

    mountJaasMeeting({
      parentNode: containerRef.current,
      session: { domain, roomName, jwt },
      callbacks,
      loadExternalApi,
    }).then(instance => {
      if (active) meeting = instance
      else instance.dispose()
    }).catch(error => {
      if (active) onError?.(error)
    })

    return () => {
      active = false
      meeting?.dispose()
    }
  }, [
    domain,
    roomName,
    jwt,
    loadExternalApi,
    onLocalJoined,
    onParticipantJoined,
    onParticipantLeft,
    onConferenceLeft,
    onAudioAvailabilityChanged,
    onAudioMuteChanged,
    onVideoAvailabilityChanged,
    onVideoMuteChanged,
    onError,
  ])

  return <div className={className} ref={containerRef} />
}
