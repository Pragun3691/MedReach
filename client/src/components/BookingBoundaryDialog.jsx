import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useModalDialog } from '../hooks/useModalDialog.js'
import { formatAppointmentDate, formatAppointmentTime, formatFee } from '../lib/appointment-format.js'
import { bookAppointment, rescheduleAppointment } from '../lib/api.js'

export function BookingBoundaryDialog({ doctor, slot, rescheduleFrom, onClose, onUnavailable }) {
  const { status, currentUser } = useAuth()
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
        setError('This time was just taken or is no longer available. Choose another slot.')
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
            <p className="profile-eyebrow">{rescheduleFrom ? 'Reschedule consultation' : 'Selected consultation'}</p>
            <h2 id="booking-boundary-heading">
              {patientCanConfirm
                ? rescheduleFrom ? 'Confirm your new time' : 'Confirm appointment'
                : restrictedRole ? 'Patient account required' : 'Sign in to continue booking'}
            </h2>
          </div>
          <button className="booking-dialog__close" disabled={pending} onClick={guardedClose} ref={closeButtonRef} type="button" aria-label="Close booking prompt">×</button>
        </div>

        <div className="booking-dialog__summary">
          <p className="booking-dialog__doctor">{doctor.fullName}</p>
          <p className="booking-dialog__specialization">{doctor.specializations.map(item => item.name).join(' · ')}</p>
          <dl>
            <div>
              <dt>Date</dt>
              <dd>{formatAppointmentDate(slot.startAt, { short: true })}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{formatAppointmentTime(slot.startAt)} IST · 30 min</dd>
            </div>
            <div>
              <dt>Fee</dt>
              <dd>{formatFee(slot.fee)}</dd>
            </div>
          </dl>
        </div>

        {patientCanConfirm && (
          <>
            <p className="booking-dialog__copy">
              {rescheduleFrom
                ? 'Your current appointment stays booked unless this new time is successfully reserved.'
                : 'Your appointment is reserved only after confirmation succeeds.'}
              {' '}No payment is taken now.
            </p>
            {error && <p className="booking-dialog__error" role="alert">{error}</p>}
            <button className="booking-dialog__primary" disabled={pending} onClick={confirmAppointment} type="button">
              {pending ? 'Confirming…' : rescheduleFrom ? 'Confirm new time' : 'Confirm appointment'}
            </button>
          </>
        )}

        {restrictedRole && <div className="booking-dialog__notice">Doctor and Admin accounts cannot book appointments. Sign in with a Patient account to reserve a consultation.</div>}

        {status !== 'authenticated' && (
          <>
            <p className="booking-dialog__copy">Signing in protects your appointment information. This slot is not reserved until a Patient confirms it.</p>
            <div className="booking-dialog__actions">
              <Link className="booking-dialog__primary" to={loginUrl}>Log in</Link>
              <Link className="booking-dialog__secondary" to={registerUrl}>Create patient account</Link>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
