import { useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useModalDialog } from '../hooks/useModalDialog.js'

function formatDateTime(value) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))
}

export function BookingBoundaryDialog({ doctor, slot, onClose }) {
  const { status, currentUser } = useAuth()
  const closeButtonRef = useRef(null)
  const dialogRef = useRef(null)
  const returnTo = useMemo(() => `/doctors/${doctor.id}?date=${slot.date}&slot=${slot.id}`, [doctor.id, slot.date, slot.id])
  const loginUrl = `/login?${new URLSearchParams({ returnTo }).toString()}`
  const registerUrl = `/register?${new URLSearchParams({ role: 'patient', returnTo }).toString()}`

  useModalDialog({ open: true, onClose, dialogRef, initialFocusRef: closeButtonRef })

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-6"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="presentation"
    >
      <section
        className="w-full rounded-t-2xl bg-white p-6 shadow-2xl sm:max-w-lg sm:rounded-2xl"
        ref={dialogRef}
        role="dialog"
        aria-labelledby="booking-boundary-heading"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-700">Selected consultation</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950" id="booking-boundary-heading">
              {status === 'authenticated' ? 'Your consultation is selected' : 'Sign in to continue booking'}
            </h2>
          </div>
          <button
            className="grid size-10 shrink-0 place-items-center rounded-full text-2xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
            aria-label="Close booking prompt"
          >
            ×
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="font-semibold text-slate-950">{doctor.fullName}</p>
          <p className="mt-1 text-sm text-slate-600">{doctor.specializations.map(item => item.name).join(' · ')}</p>
          <dl className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-[1fr_auto]">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Date and time</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">{formatDateTime(slot.startAt)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Fee</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">{slot.fee === null ? 'Shown at confirmation' : `₹${slot.fee}`}</dd>
            </div>
          </dl>
        </div>

        <p className="mt-5 text-sm leading-6 text-slate-600">
          {status === 'authenticated'
            ? `${currentUser?.fullName ?? 'You'} is signed in. This slot is not reserved because appointment confirmation is not available yet.`
            : 'Signing in protects your appointment and care information. This slot is not reserved until booking is confirmed.'}
        </p>

        {status === 'authenticated' ? (
          <button className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-blue-700 px-5 text-sm font-semibold text-blue-700 hover:bg-blue-50" onClick={onClose} type="button">
            Return to availability
          </button>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800" to={loginUrl}>
              Log in
            </Link>
            <Link className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue-700 px-5 text-sm font-semibold text-blue-700 hover:bg-blue-50" to={registerUrl}>
              Create patient account
            </Link>
          </div>
        )}
        <p className="mt-4 text-center text-xs text-slate-500">No appointment or payment is created at this step.</p>
      </section>
    </div>
  )
}
