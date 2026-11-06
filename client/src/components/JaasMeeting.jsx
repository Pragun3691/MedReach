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
  const apiRef = useRef(null)
  const meetingRef = useRef(null)
  const initializationRef = useRef(null)
  const mountedMeetingKeyRef = useRef(null)
  const callbacksRef = useRef({
    onLocalJoined,
    onParticipantJoined,
    onParticipantLeft,
    onConferenceLeft,
    onAudioAvailabilityChanged,
    onAudioMuteChanged,
    onVideoAvailabilityChanged,
    onVideoMuteChanged,
    onError,
  })
  const domain = session.domain
  const roomName = session.roomName
  const jwt = session.jwt

  useEffect(() => {
    callbacksRef.current = {
      onLocalJoined,
      onParticipantJoined,
      onParticipantLeft,
      onConferenceLeft,
      onAudioAvailabilityChanged,
      onAudioMuteChanged,
      onVideoAvailabilityChanged,
      onVideoMuteChanged,
      onError,
    }
  }, [
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

  useEffect(() => {
    const meetingKey = `${domain}\u0000${roomName}\u0000${jwt}`
    mountedMeetingKeyRef.current = meetingKey
    const callbacks = {
      onLocalJoined: event => callbacksRef.current.onLocalJoined?.(event),
      onParticipantJoined: event => callbacksRef.current.onParticipantJoined?.(event),
      onParticipantLeft: event => callbacksRef.current.onParticipantLeft?.(event),
      onConferenceLeft: event => callbacksRef.current.onConferenceLeft?.(event),
      onAudioAvailabilityChanged: event => callbacksRef.current.onAudioAvailabilityChanged?.(event),
      onAudioMuteChanged: event => callbacksRef.current.onAudioMuteChanged?.(event),
      onVideoAvailabilityChanged: event => callbacksRef.current.onVideoAvailabilityChanged?.(event),
      onVideoMuteChanged: event => callbacksRef.current.onVideoMuteChanged?.(event),
    }

    let initialization = initializationRef.current
    if (!initialization || initialization.key !== meetingKey) {
      initialization = { key: meetingKey, meeting: null, promise: null }
      initializationRef.current = initialization
      initialization.promise = mountJaasMeeting({
        parentNode: containerRef.current,
        session: { domain, roomName, jwt },
        callbacks,
        loadExternalApi,
      }).then(meeting => {
        if (initializationRef.current !== initialization || mountedMeetingKeyRef.current !== meetingKey) {
          meeting.dispose()
          if (initializationRef.current === initialization) initializationRef.current = null
          return
        }
        initialization.meeting = meeting
        meetingRef.current = meeting
        apiRef.current = meeting.api
      }).catch(error => {
        if (initializationRef.current === initialization) {
          initializationRef.current = null
          if (mountedMeetingKeyRef.current === meetingKey) callbacksRef.current.onError?.(error)
        }
      })
    }

    return () => {
      if (mountedMeetingKeyRef.current === meetingKey) mountedMeetingKeyRef.current = null
      if (meetingRef.current && meetingRef.current === initialization.meeting) {
        meetingRef.current.dispose()
        meetingRef.current = null
        apiRef.current = null
        if (initializationRef.current === initialization) initializationRef.current = null
      }
    }
  }, [domain, roomName, jwt, loadExternalApi])

  return <div className={className} ref={containerRef} />
}
