import { Link } from 'react-router-dom'
import { appointmentStatusLabels, getAppointmentDisplayStatus } from '../lib/appointment-display.js'
import { formatAppointmentDate, formatAppointmentTime, formatFee } from '../lib/appointment-format.js'
import { resolveDoctorPortrait } from '../lib/doctor-portraits.js'

function doctorInitials(name) {
  return name.replace(/^Dr\.\s*/i, '').split(' ').slice(0, 2).map(part => part[0]).join('')
}

function DoctorPortrait({ doctor, compact = false }) {
  const portrait = resolveDoctorPortrait(doctor)
  return (
    <div className={compact ? 'patient-history__portrait' : 'patient-upcoming__portrait'}>
      {portrait
        ? <img alt={`Portrait of ${doctor.fullName}`} src={portrait} />
        : <span aria-hidden="true">{doctorInitials(doctor.fullName)}</span>}
    </div>
  )
}

function AppointmentStatus({ appointment }) {
  const displayStatus = getAppointmentDisplayStatus(appointment)
  return <span className="patient-appointment-status" data-status={displayStatus}>{appointmentStatusLabels[displayStatus] ?? displayStatus}</span>
}

function UpcomingAppointment({ appointment, featured }) {
  return (
    <article className="patient-upcoming" data-featured={featured || undefined}>
      <div className="patient-upcoming__topline">
        <p>{featured ? 'Upcoming consultation' : 'Scheduled consultation'}</p>
        <AppointmentStatus appointment={appointment} />
      </div>
      <div className="patient-upcoming__body">
        <DoctorPortrait doctor={appointment.doctor} />
        <div className="patient-upcoming__identity">
          <h3>{appointment.doctor.fullName}</h3>
          <p>{appointment.doctor.specializations.map(item => item.name).join(' · ')}</p>
        </div>
        <div className="patient-upcoming__schedule">
          <p>{formatAppointmentDate(appointment.slot.startAt)}</p>
          <strong>{formatAppointmentTime(appointment.slot.startAt)} IST <span aria-hidden="true">·</span> 30 min</strong>
          <span>Remote consultation</span>
        </div>
        <div className="patient-upcoming__decision">
          <p>{formatFee(appointment.feeSnapshot)}</p>
          <Link to={`/appointments/${appointment.id}`}>View appointment <span aria-hidden="true">→</span></Link>
        </div>
      </div>
    </article>
  )
}

function HistoryAppointment({ appointment }) {
  return (
    <article className="patient-history">
      <DoctorPortrait compact doctor={appointment.doctor} />
      <div className="patient-history__identity">
        <h3>{appointment.doctor.fullName}</h3>
        <p>{appointment.doctor.specializations.map(item => item.name).join(' · ')}</p>
      </div>
      <p className="patient-history__schedule">
        {formatAppointmentDate(appointment.slot.startAt, { short: true })}<span aria-hidden="true"> · </span>{formatAppointmentTime(appointment.slot.startAt)} IST
      </p>
      <div className="patient-history__status"><AppointmentStatus appointment={appointment} /></div>
      <Link className="patient-history__link" to={`/appointments/${appointment.id}`}>View details <span aria-hidden="true">→</span></Link>
    </article>
  )
}

function SectionHeading({ eyebrow, heading, count, unit, headingId }) {
  return (
    <div className="patient-appointments__section-heading">
      <div><p>{eyebrow}</p><h2 id={headingId}>{heading}</h2></div>
      <span>{count} {count === 1 ? unit : `${unit}s`}</span>
    </div>
  )
}

export function PatientAppointmentSections({ appointments }) {
  return (
    <div className="patient-appointments__sections">
      <section aria-labelledby="upcoming-appointments-heading">
        <SectionHeading count={appointments.upcoming.length} eyebrow="Scheduled care" heading="Upcoming" headingId="upcoming-appointments-heading" unit="appointment" />
        {appointments.upcoming.length > 0 ? (
          <div className="patient-upcoming-list">
            {appointments.upcoming.map((appointment, index) => <UpcomingAppointment appointment={appointment} featured={index === 0} key={appointment.id} />)}
          </div>
        ) : (
          <div className="patient-appointments__empty">
            <h3>No upcoming consultations</h3>
            <p>When you’re ready, find a doctor and choose an available time.</p>
            <Link to="/doctors">Find a doctor <span aria-hidden="true">→</span></Link>
          </div>
        )}
      </section>
      <section aria-labelledby="appointment-history-heading">
        <SectionHeading count={appointments.history.length} eyebrow="Previous activity" heading="History" headingId="appointment-history-heading" unit="record" />
        {appointments.history.length > 0 ? (
          <div className="patient-history-list">
            {appointments.history.map(appointment => <HistoryAppointment appointment={appointment} key={appointment.id} />)}
          </div>
        ) : (
          <div className="patient-appointments__empty patient-appointments__empty--quiet"><h3>No previous appointment activity yet.</h3></div>
        )}
      </section>
    </div>
  )
}
