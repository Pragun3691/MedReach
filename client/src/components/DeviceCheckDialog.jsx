import { useCallback, useRef } from 'react'
import { useModalDialog } from '../hooks/useModalDialog.js'
import { DeviceCheck } from './DeviceCheck.jsx'

export function DeviceCheckDialog({ onClose }) {
  const dialogRef = useRef(null)
  const closeButtonRef = useRef(null)
  const close = useCallback(() => onClose(), [onClose])
  useModalDialog({ open: true, onClose: close, dialogRef, initialFocusRef: closeButtonRef })

  return (
    <div className="consultation-dialog-backdrop" onMouseDown={event => event.target === event.currentTarget && close()} role="presentation">
      <section aria-labelledby="device-check-heading" aria-modal="true" className="consultation-dialog consultation-dialog--device" ref={dialogRef} role="dialog">
        <p className="consultation-dialog__eyebrow">Before your consultation</p>
        <h2 id="device-check-heading">Test camera &amp; microphone</h2>
        <p className="consultation-dialog__intro">Allow access to confirm that this device is ready. A successful test is helpful, but not required.</p>
        <DeviceCheck />
        <button className="consultation-secondary-button" onClick={close} ref={closeButtonRef} type="button">Close device check</button>
      </section>
    </div>
  )
}
