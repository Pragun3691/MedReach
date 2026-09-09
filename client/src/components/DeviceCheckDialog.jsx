import { useCallback, useRef } from 'react'
import { useModalDialog } from '../hooks/useModalDialog.js'
import { DeviceCheck } from './DeviceCheck.jsx'
import { useLanguage } from '../hooks/useLanguage.js'
import { translateMessage } from '../i18n/messages.js'

export function DeviceCheckDialog({ onClose, forceEnglish = false }) {
  const languageState = useLanguage()
  const t = forceEnglish ? (key, values) => translateMessage('en', key, values) : languageState.t
  const dialogRef = useRef(null)
  const closeButtonRef = useRef(null)
  const close = useCallback(() => onClose(), [onClose])
  useModalDialog({ open: true, onClose: close, dialogRef, initialFocusRef: closeButtonRef })

  return (
    <div className="consultation-dialog-backdrop" onMouseDown={event => event.target === event.currentTarget && close()} role="presentation">
      <section aria-labelledby="device-check-heading" aria-modal="true" className="consultation-dialog consultation-dialog--device" ref={dialogRef} role="dialog">
        <p className="consultation-dialog__eyebrow">{t('device.before')}</p>
        <h2 id="device-check-heading">{t('device.title')}</h2>
        <p className="consultation-dialog__intro">{t('device.copy')}</p>
        <DeviceCheck forceEnglish={forceEnglish} />
        <button className="consultation-secondary-button" onClick={close} ref={closeButtonRef} type="button">{t('device.close')}</button>
      </section>
    </div>
  )
}
