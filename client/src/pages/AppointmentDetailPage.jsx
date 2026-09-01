import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CancellationDialog } from '../components/CancellationDialog.jsx'
import { PublicFooter } from '../components/PublicFooter.jsx'
import { PublicHeader } from '../components/PublicHeader.jsx'
import { StatusBadge } from '../components/StatusBadge.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { formatAppointmentDate, formatAppointmentTime, formatFee } from '../lib/appointment-format.js'
import { cancelAppointment, getAppointment } from '../lib/api.js'

export function AppointmentDetailPage() {
  const { appointmentId } = useParams()
  const { currentUser } = useAuth()
  const [requestVersion, setRequestVersion] = useState(0)
  const [state, setState] = useState({ key: null, appointment: null, error: null })
  const [cancellationOpen, setCancellationOpen] = useState(false)
  const closeCancellation = useCallback(() => setCancellationOpen(false), [])
  const requestKey = `${appointmentId}:${requestVersion}`

  useEffect(() => {
    const controller = new AbortController()
    const currentKey = requestKey
    getAppointment(appointmentId, controller.signal)
      .then(({ appointment }) => setState({ key: currentKey, appointment, error: null }))
      .catch(error => {
        if (error.name !== 'AbortError') setState({ key: currentKey, appointment: null, error })
      })
    return () => controller.abort()
  }, [appointmentId, requestKey])

  const loading = state.key !== requestKey
  const appointment = loading ? null : state.appointment
  const canChange = appointment?.status === 'booked' && new Date(appointment.slot.startAt) > new Date()
  const isDoctor = currentUser.role === 'doctor'

  async function confirmCancellation(reason) {
    const result = await cancelAppointment(appointment.id, reason)
    setState({ key: requestKey, appointment: result.appointment, error: null })
    setCancellationOpen(false)
    window.dispatchEvent(new Event('medreach:notifications-changed'))
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <PublicHeader />
      <main className="mx-auto max-w-4xl px-5 py-9 sm:px-8 lg:px-10 lg:py-12">
        <Link className="text-sm font-semibold text-blue-700 hover:text-blue-800" to={isDoctor ? '/doctor/appointments' : '/appointments'}>← Back to appointments</Link>

        {loading && <div className="mt-7 h-[560px] animate-pulse rounded-2xl bg-white" aria-label="Loading appointment details" />}

        {!loading && state.error && (
          <section className="mt-7 rounded-2xl border border-amber-200 bg-white p-8 text-center">
            <h1 className="text-2xl font-semibold">We couldn’t load this appointment</h1>
            <p className="mt-3 text-slate-600">{state.error.message}</p>
            <button className="mt-6 min-h-11 rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white" onClick={() => setRequestVersion(version => version + 1)} type="button">Try again</button>
          </section>
        )}

        {appointment && (
          <article className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_50px_-40px_rgba(15,23,42,0.55)]">
            <header className="border-b border-slate-200 bg-[#f4f8fd] p-6 sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-blue-700">Appointment #{appointment.id}</p>
                  <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-slate-950">{isDoctor ? appointment.patient.fullName : appointment.doctor.fullName}</h1>
                  <p className="mt-2 font-medium text-slate-600">
                    {isDoctor ? 'Patient' : appointment.doctor.specializations.map(item => item.name).join(' · ')}
                  </p>
                </div>
                <StatusBadge status={appointment.status} />
              </div>
            </header>

            <div className="p-6 sm:p-8">
              <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                <div className="border-t border-slate-200 pt-4">
                  <dt className="text-sm font-semibold text-slate-500">Confirmed date</dt>
                  <dd className="mt-1 font-semibold text-slate-950">{formatAppointmentDate(appointment.slot.startAt)}</dd>
                </div>
                <div className="border-t border-slate-200 pt-4">
                  <dt className="text-sm font-semibold text-slate-500">Time and duration</dt>
                  <dd className="mt-1 font-semibold text-slate-950">{formatAppointmentTime(appointment.slot.startAt)} IST · 30 minutes</dd>
                </div>
                <div className="border-t border-slate-200 pt-4">
                  <dt className="text-sm font-semibold text-slate-500">Consultation fee</dt>
                  <dd className="mt-1 font-semibold text-slate-950">{formatFee(appointment.feeSnapshot)}</dd>
                </div>
                <div className="border-t border-slate-200 pt-4">
                  <dt className="text-sm font-semibold text-slate-500">Current status</dt>
                  <dd className="mt-2"><StatusBadge status={appointment.status} /></dd>
                </div>
              </dl>

              {(appointment.cancellation || appointment.rescheduledFromAppointmentId || appointment.replacementAppointmentId) && (
                <section className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5" aria-labelledby="appointment-history-detail-heading">
                  <h2 className="font-semibold text-slate-950" id="appointment-history-detail-heading">Appointment history</h2>
                  {appointment.cancellation && (
                    <div className="mt-3 text-sm leading-6 text-slate-700">
                      <p>Cancelled {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(appointment.cancellation.cancelledAt))}.</p>
                      {appointment.cancellation.reason && <p className="mt-1"><strong>Reason:</strong> {appointment.cancellation.reason}</p>}
                    </div>
                  )}
                  {appointment.rescheduledFromAppointmentId && <p className="mt-3 text-sm text-slate-700">This booking replaces <Link className="font-semibold text-blue-700 underline underline-offset-2" to={`/appointments/${appointment.rescheduledFromAppointmentId}`}>appointment #{appointment.rescheduledFromAppointmentId}</Link>.</p>}
                  {appointment.replacementAppointmentId && <p className="mt-3 text-sm text-slate-700">This booking was replaced by <Link className="font-semibold text-blue-700 underline underline-offset-2" to={`/appointments/${appointment.replacementAppointmentId}`}>appointment #{appointment.replacementAppointmentId}</Link>.</p>}
                </section>
              )}

              <div className="mt-8 rounded-xl bg-blue-50 p-5 text-sm leading-6 text-blue-950">
                <strong>What’s included:</strong> This confirms a 30-minute consultation time. Video consultation access and payment are not part of this milestone, and no payment has been taken.
              </div>

              {canChange && (
                <div className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row">
                  {!isDoctor && (
                    <Link className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800" to={`/doctors/${appointment.doctor.id}?${new URLSearchParams({ rescheduleFrom: String(appointment.id) }).toString()}`}>
                      Reschedule
                    </Link>
                  )}
                  <button className="min-h-11 rounded-lg border border-rose-300 px-5 text-sm font-semibold text-rose-700 hover:bg-rose-50" onClick={() => setCancellationOpen(true)} type="button">Cancel appointment</button>
                </div>
              )}
            </div>
          </article>
        )}
      </main>
      <PublicFooter />

      {cancellationOpen && appointment && (
        <CancellationDialog doctorRequired={isDoctor} onClose={closeCancellation} onConfirm={confirmCancellation} />
      )}
    </div>
  )
}
