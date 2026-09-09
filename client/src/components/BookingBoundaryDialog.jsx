import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useModalDialog } from '../hooks/useModalDialog.js'
import { formatAppointmentDate, formatAppointmentTime, formatFee } from '../lib/appointment-format.js'
import { bookAppointment, rescheduleAppointment } from '../lib/api.js'
import { useLanguage } from '../hooks/useLanguage.js'
import { specializationDisplayName } from '../i18n/messages.js'

export function BookingBoundaryDialog({ doctor, slot, rescheduleFrom, onClose, onUnavailable }) {
  const { status, currentUser } = useAuth()
  const { language, locale, t } = useLanguage()
  const navigate = useNavigate()
  const closeButtonRef = useRef(null)
  const dialogRef = useRef(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const returnTo = useMemo(() => {
    const params = new URLSearchParams({ date: slot.date, slot: String(slot.id) })
    if (rescheduleFrom) params.set('rescheduleFrom', String(rescheduleFrom))
    return `/doctors/${doctor.id}?${params.toString()}`
  }, [doctor.id, rescheduleFrom, slot.date, slot.id])
  const loginUrl = `/login?${new URLSearchParams({ returnTo }).toString()}`
  const registerUrl = `/register?${new URLSearchParams({ role: 'patient', returnTo }).toString()}`
  const patientCanConfirm = status === 'authenticated' && currentUser?.role === 'patient'
  const restrictedRole = status === 'authenticated' && currentUser?.role !== 'patient'
  const guardedClose = useCallback(() => {
    if (!pending) onClose()
  }, [onClose, pending])

  useModalDialog({ open: true, onClose: guardedClose, dialogRef, initialFocusRef: closeButtonRef })

  async function confirmAppointment() {
    setPending(true)
    setError('')
    try {
      const result = rescheduleFrom
        ? await rescheduleAppointment(rescheduleFrom, slot.id)
        : await bookAppointment(slot.id)
      window.dispatchEvent(new Event('medreach:notifications-changed'))
      navigate(`/appointments/${result.appointment.id}`)
    } catch (submitError) {
      if (submitError.code === 'SLOT_UNAVAILABLE') {
        setError(t('booking.slotTaken'))
        onUnavailable()
      } else {
        setError(submitError.message)
      }
      setPending(false)
    }
  }

  return (
    <div className="booking-dialog-backdrop" onMouseDown={event => event.target === event.currentTarget && guardedClose()} role="presentation">
      <section className="booking-dialog" ref={dialogRef} role="dialog" aria-labelledby="booking-boundary-heading" aria-modal="true">
        <div className="booking-dialog__header">
          <div>
            <p className="profile-eyebrow">{rescheduleFrom ? t('booking.reschedule') : t('booking.selected')}</p>
            <h2 id="booking-boundary-heading">
              {patientCanConfirm
                ? rescheduleFrom ? t('booking.confirmNew') : t('booking.confirm')
                : restrictedRole ? t('booking.patientRequired') : t('booking.signInContinue')}
            </h2>
          </div>
          <button className="booking-dialog__close" disabled={pending} onClick={guardedClose} ref={closeButtonRef} type="button" aria-label={t('booking.closePrompt')}>×</button>
        </div>

        <div className="booking-dialog__summary">
          <p className="booking-dialog__doctor">{doctor.fullName}</p>
          <p className="booking-dialog__specialization">{doctor.specializations.map(item => specializationDisplayName(language, item.name)).join(' · ')}</p>
          <dl>
            <div>
              <dt>{t('booking.date')}</dt>
              <dd>{formatAppointmentDate(slot.startAt, { short: true, locale })}</dd>
            </div>
            <div>
              <dt>{t('booking.time')}</dt>
              <dd>{formatAppointmentTime(slot.startAt, locale)} IST · {t('booking.duration')}</dd>
            </div>
            <div>
              <dt>{t('booking.confirmFee')}</dt>
              <dd>{formatFee(slot.fee, locale)}</dd>
            </div>
          </dl>
        </div>

        {patientCanConfirm && (
          <>
            <p className="booking-dialog__copy">
              {rescheduleFrom
                ? t('booking.currentStays')
                : t('booking.reservedAfter')}
              {' '}{t('booking.noPayment')}
            </p>
            {error && <p className="booking-dialog__error" role="alert">{error}</p>}
            <button className="booking-dialog__primary" disabled={pending} onClick={confirmAppointment} type="button">
              {pending ? t('booking.confirming') : rescheduleFrom ? t('booking.confirmNewTime') : t('booking.confirm')}
            </button>
          </>
        )}

        {restrictedRole && <div className="booking-dialog__notice">{t('booking.restricted')}</div>}

        {status !== 'authenticated' && (
          <>
            <p className="booking-dialog__copy">{t('booking.signInCopy')}</p>
            <div className="booking-dialog__actions">
              <Link className="booking-dialog__primary" to={loginUrl}>{t('booking.logIn')}</Link>
              <Link className="booking-dialog__secondary" to={registerUrl}>{t('booking.createPatient')}</Link>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
