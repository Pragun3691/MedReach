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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-6" onMouseDown={event => event.target === event.currentTarget && guardedClose()} role="presentation">
      <section className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:max-w-lg sm:rounded-2xl" ref={dialogRef} role="dialog" aria-labelledby="booking-boundary-heading" aria-modal="true">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-700">{rescheduleFrom ? 'Reschedule consultation' : 'Selected consultation'}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950" id="booking-boundary-heading">
              {patientCanConfirm
                ? rescheduleFrom ? 'Confirm your new time' : 'Confirm appointment'
                : restrictedRole ? 'Patient account required' : 'Sign in to continue booking'}
            </h2>
          </div>
          <button className="grid size-10 shrink-0 place-items-center rounded-full text-2xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2" disabled={pending} onClick={guardedClose} ref={closeButtonRef} type="button" aria-label="Close booking prompt">×</button>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="font-semibold text-slate-950">{doctor.fullName}</p>
          <p className="mt-1 text-sm text-slate-600">{doctor.specializations.map(item => item.name).join(' · ')}</p>
          <dl className="mt-4 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Date</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">{formatAppointmentDate(slot.startAt, { short: true })}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Time</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">{formatAppointmentTime(slot.startAt)} IST · 30 min</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Fee</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">{formatFee(slot.fee)}</dd>
            </div>
          </dl>
        </div>

        {patientCanConfirm && (
          <>
            <p className="mt-5 text-sm leading-6 text-slate-600">
              {rescheduleFrom
                ? 'Your current appointment stays booked unless this new time is successfully reserved.'
                : 'Your appointment is reserved only after confirmation succeeds.'}
              {' '}No payment is taken now.
            </p>
            {error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
            <button className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60" disabled={pending} onClick={confirmAppointment} type="button">
              {pending ? 'Confirming…' : rescheduleFrom ? 'Confirm new time' : 'Confirm appointment'}
            </button>
          </>
        )}

        {restrictedRole && <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">Doctor and Admin accounts cannot book appointments. Sign in with a Patient account to reserve a consultation.</div>}

        {status !== 'authenticated' && (
          <>
            <p className="mt-5 text-sm leading-6 text-slate-600">Signing in protects your appointment information. This slot is not reserved until a Patient confirms it.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Link className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800" to={loginUrl}>Log in</Link>
              <Link className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue-700 px-5 text-sm font-semibold text-blue-700 hover:bg-blue-50" to={registerUrl}>Create patient account</Link>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
