import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../hooks/useLanguage.js'
import { translateMessage } from '../i18n/messages.js'

function stopTracks(stream) {
  stream?.getTracks().forEach(track => track.stop())
}

function deviceResult(result) {
  if (result.status === 'fulfilled' && result.value.getTracks().length > 0) return 'available'
  if (result.status === 'rejected' && result.reason?.name === 'NotAllowedError') return 'denied'
  return 'unavailable'
}

export function DeviceCheck({ mediaDevices = navigator.mediaDevices, forceEnglish = false }) {
  const languageState = useLanguage()
  const t = forceEnglish ? (key, values) => translateMessage('en', key, values) : languageState.t
  const statusLabels = Object.fromEntries(['checking', 'available', 'denied', 'unavailable', 'unsupported'].map(status => [status, t(`device.${status}`)]))
  const videoRef = useRef(null)
  const streamsRef = useRef([])
  const supported = Boolean(mediaDevices?.getUserMedia)
  const [state, setState] = useState(() => supported
    ? { camera: 'checking', microphone: 'checking', error: '' }
    : { camera: 'unsupported', microphone: 'unsupported', error: 'unsupported' })

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
        error: permissionDenied ? 'denied' : '',
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
        <video aria-label={t('device.preview')} autoPlay muted playsInline ref={videoRef} />
        {state.camera !== 'available' && <span>{t('device.previewUnavailable')}</span>}
      </div>
      <dl className="device-check__statuses">
        <div><dt>{t('device.camera')}</dt><dd data-state={state.camera}>{statusLabels[state.camera]}</dd></div>
        <div><dt>{t('device.microphone')}</dt><dd data-state={state.microphone}>{statusLabels[state.microphone]}</dd></div>
      </dl>
      {state.error && <p className="device-check__message" role="status">{t(state.error === 'denied' ? 'device.deniedCopy' : 'device.unsupportedCopy')}</p>}
      <p className="device-check__privacy">{t('device.privacy')}</p>
    </div>
  )
}
