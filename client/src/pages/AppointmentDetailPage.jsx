import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CancellationDialog } from '../components/CancellationDialog.jsx'
import { PublicFooter } from '../components/PublicFooter.jsx'
import { PublicHeader } from '../components/PublicHeader.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { appointmentStatusLabels, getAppointmentDisplayStatus } from '../lib/appointment-display.js'
import { formatAppointmentTime, formatFee } from '../lib/appointment-format.js'
import { cancelAppointment, getAppointment } from '../lib/api.js'
import { resolveDoctorPortrait } from '../lib/doctor-portraits.js'

function doctorInitials(name) {
  return name.replace(/^Dr\.\s*/i, '').split(' ').slice(0, 2).map(part => part[0]).join('')
}

function formatPrimaryDate(value) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))
}

function DisplayStatus({ appointment }) {
  const displayStatus = getAppointmentDisplayStatus(appointment)
  return <span className="patient-appointment-status" data-status={displayStatus}>{appointmentStatusLabels[displayStatus] ?? displayStatus}</span>
}

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
    <div className="appointment-detail-page min-h-screen">
      <PublicHeader editorial />
      <main className="appointment-detail-shell">
        <Link className="appointment-detail-back" to={isDoctor ? '/doctor/appointments' : '/appointments'}><span aria-hidden="true">←</span> Back to appointments</Link>
        {loading && <div className="appointment-detail-loading animate-pulse" aria-label="Loading appointment details"><div /><div /></div>}
        {!loading && state.error && (
          <section className="appointment-detail-error">
            <h1>We couldn’t load this appointment</h1>
            <p>{state.error.message}</p>
            <button onClick={() => setRequestVersion(version => version + 1)} type="button">Try again</button>
          </section>
        )}
        {appointment && <AppointmentWorkspace appointment={appointment} canChange={canChange} isDoctor={isDoctor} onCancel={() => setCancellationOpen(true)} />}
      </main>
      <PublicFooter />
      {cancellationOpen && appointment && <CancellationDialog doctorRequired={isDoctor} onClose={closeCancellation} onConfirm={confirmCancellation} />}
    </div>
  )
}

function AppointmentWorkspace({ appointment, canChange, isDoctor, onCancel }) {
  const portrait = resolveDoctorPortrait(appointment.doctor)
  const isUpcoming = appointment.status === 'booked' && new Date(appointment.slot.startAt) > new Date()

  return (
    <div className="appointment-detail-workspace">
      <section className="appointment-detail-summary" aria-labelledby="appointment-detail-heading">
        <p className="appointment-detail-eyebrow">{isUpcoming ? 'Upcoming consultation' : 'Past consultation'}</p>
        <h1 id="appointment-detail-heading">{formatPrimaryDate(appointment.slot.startAt)}</h1>
        <p className="appointment-detail-primary-time">{formatAppointmentTime(appointment.slot.startAt)} IST</p>
        <div className="appointment-detail-doctor">
          <div className="appointment-detail-doctor__portrait">
            {portrait
              ? <img alt={`Portrait of ${appointment.doctor.fullName}`} src={portrait} />
              : <span aria-hidden="true">{doctorInitials(appointment.doctor.fullName)}</span>}
          </div>
          <div>
            <h2>{appointment.doctor.fullName}</h2>
            <p>{appointment.doctor.specializations.map(item => item.name).join(' · ')}</p>
            {!isDoctor && <Link to={`/doctors/${appointment.doctor.id}`}>View doctor profile <span aria-hidden="true">→</span></Link>}
          </div>
        </div>
      </section>

      <aside className="appointment-state-panel" aria-labelledby="consultation-state-heading">
        <p className="appointment-state-panel__eyebrow">Your consultation</p>
        <h2 className="sr-only" id="consultation-state-heading">Current consultation status and actions</h2>
        <DisplayStatus appointment={appointment} />
        <div className="appointment-state-panel__schedule">
          <strong>{formatPrimaryDate(appointment.slot.startAt)}</strong>
          <span>{formatAppointmentTime(appointment.slot.startAt)} IST</span>
          <p>30 min <span aria-hidden="true">·</span> Remote consultation</p>
        </div>
        <p className="appointment-state-panel__fee">{formatFee(appointment.feeSnapshot)}</p>
        {canChange && (
          <div className="appointment-state-panel__management">
            <p>Manage appointment</p>
            {!isDoctor && <Link className="appointment-state-panel__reschedule" to={`/doctors/${appointment.doctor.id}?${new URLSearchParams({ rescheduleFrom: String(appointment.id) }).toString()}`}>Reschedule appointment <span aria-hidden="true">→</span></Link>}
            <button className="appointment-state-panel__cancel" onClick={onCancel} type="button">Cancel appointment</button>
          </div>
        )}
        {!canChange && <p className="appointment-state-panel__past-note">This appointment is part of your previous care activity.</p>}
      </aside>

      <p className="appointment-detail-reference">Appointment reference: #{appointment.id}</p>

      {(appointment.cancellation || appointment.rescheduledFromAppointmentId || appointment.replacementAppointmentId) && (
        <section className="appointment-detail-history" aria-labelledby="appointment-history-detail-heading">
          <p className="appointment-detail-eyebrow">Appointment history</p>
          <h2 id="appointment-history-detail-heading">Previous activity</h2>
          {appointment.cancellation && (
            <div>
              <p>Cancelled {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(appointment.cancellation.cancelledAt))}.</p>
              {appointment.cancellation.reason && <p><strong>Reason:</strong> {appointment.cancellation.reason}</p>}
            </div>
          )}
          {appointment.rescheduledFromAppointmentId && <p>This booking replaces <Link to={`/appointments/${appointment.rescheduledFromAppointmentId}`}>appointment #{appointment.rescheduledFromAppointmentId}</Link>.</p>}
          {appointment.replacementAppointmentId && <p>This booking was replaced by <Link to={`/appointments/${appointment.replacementAppointmentId}`}>appointment #{appointment.replacementAppointmentId}</Link>.</p>}
        </section>
      )}
    </div>
  )
}
