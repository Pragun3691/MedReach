import { Link } from 'react-router-dom'
import { appointmentStatusLabels, getAppointmentDisplayStatus } from '../lib/appointment-display.js'
import { formatAppointmentDate, formatAppointmentTime, formatFee } from '../lib/appointment-format.js'

export function AppointmentCard({ appointment }) {
  const displayStatus = getAppointmentDisplayStatus(appointment)
  const patientWaiting = appointment.status === 'booked' && Boolean(appointment.consultationFlow?.readyAt)

  return (
    <article className="doctor-appointment-card" data-waiting={patientWaiting || undefined}>
      <header className="doctor-appointment-card__header">
        <div className="doctor-appointment-card__identity">
          <p>Patient</p>
          <h3>{appointment.patient.fullName}</h3>
        </div>
        <div className="doctor-appointment-card__badges">
          <span className="patient-appointment-status" data-status={displayStatus}>{appointmentStatusLabels[displayStatus] ?? displayStatus}</span>
          {patientWaiting && <span className="doctor-appointment-waiting"><span aria-hidden="true" />Patient Waiting</span>}
        </div>
      </header>

      <dl className="doctor-appointment-card__schedule">
        <div><dt>Date</dt><dd>{formatAppointmentDate(appointment.slot.startAt, { short: true })}</dd></div>
        <div><dt>Time</dt><dd>{formatAppointmentTime(appointment.slot.startAt)} IST</dd></div>
        <div><dt>Duration</dt><dd>30 minutes</dd></div>
        <div><dt>Consultation fee</dt><dd>{formatFee(appointment.feeSnapshot)}</dd></div>
      </dl>

      <Link className="doctor-appointment-card__link" to={`/appointments/${appointment.id}`}>View appointment <span aria-hidden="true">→</span></Link>
    </article>
  )
}
