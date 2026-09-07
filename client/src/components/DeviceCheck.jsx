import { useEffect, useRef, useState } from 'react'

function stopTracks(stream) {
  stream?.getTracks().forEach(track => track.stop())
}

function deviceResult(result) {
  if (result.status === 'fulfilled' && result.value.getTracks().length > 0) return 'available'
  if (result.status === 'rejected' && result.reason?.name === 'NotAllowedError') return 'denied'
  return 'unavailable'
}

const statusLabels = {
  checking: 'Checking…',
  available: 'Available',
  denied: 'Permission denied',
  unavailable: 'Not available',
  unsupported: 'Not supported',
}

export function DeviceCheck({ mediaDevices = navigator.mediaDevices }) {
  const videoRef = useRef(null)
  const streamsRef = useRef([])
  const supported = Boolean(mediaDevices?.getUserMedia)
  const [state, setState] = useState(() => supported
    ? { camera: 'checking', microphone: 'checking', error: '' }
    : { camera: 'unsupported', microphone: 'unsupported', error: 'Camera and microphone testing is not supported by this browser.' })

  useEffect(() => {
    let active = true
    const streams = streamsRef.current
    const videoElement = videoRef.current

    if (!supported) return undefined

    Promise.allSettled([
      mediaDevices.getUserMedia({ video: true, audio: false }),
      mediaDevices.getUserMedia({ video: false, audio: true }),
    ]).then(([cameraResult, microphoneResult]) => {
      const resolvedStreams = [cameraResult, microphoneResult]
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value)
      if (!active) {
        resolvedStreams.forEach(stopTracks)
        return
      }

      streams.push(...resolvedStreams)
      if (cameraResult.status === 'fulfilled' && videoElement) {
        videoElement.srcObject = cameraResult.value
      }
      const camera = deviceResult(cameraResult)
      const microphone = deviceResult(microphoneResult)
      const permissionDenied = camera === 'denied' || microphone === 'denied'
      setState({
        camera,
        microphone,
        error: permissionDenied ? 'Camera or microphone permission was denied. You can still continue and update browser permissions later.' : '',
      })
    })

    return () => {
      active = false
      streams.splice(0).forEach(stopTracks)
      if (videoElement) videoElement.srcObject = null
    }
  }, [mediaDevices, supported])

  return (
    <div className="device-check">
      <div className="device-check__preview">
        <video aria-label="Camera preview" autoPlay muted playsInline ref={videoRef} />
        {state.camera !== 'available' && <span>Camera preview unavailable</span>}
      </div>
      <dl className="device-check__statuses">
        <div><dt>Camera</dt><dd data-state={state.camera}>{statusLabels[state.camera]}</dd></div>
        <div><dt>Microphone</dt><dd data-state={state.microphone}>{statusLabels[state.microphone]}</dd></div>
      </dl>
      {state.error && <p className="device-check__message" role="status">{state.error}</p>}
      <p className="device-check__privacy">This check stays in your browser. MedReach does not upload or store camera or microphone data.</p>
    </div>
  )
}
