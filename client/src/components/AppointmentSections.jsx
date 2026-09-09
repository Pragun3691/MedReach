import { AppointmentCard } from './AppointmentCard.jsx'

function SectionHeading({ eyebrow, heading, count, unit, headingId }) {
  return <div className="doctor-appointments__section-heading"><div><p>{eyebrow}</p><h2 id={headingId}>{heading}</h2></div><span>{count} {count === 1 ? unit : `${unit}s`}</span></div>
}

export function AppointmentSections({ appointments }) {
  return (
    <div className="doctor-appointments__sections">
      <section aria-labelledby="upcoming-appointments-heading">
        <SectionHeading count={appointments.upcoming.length} eyebrow="Scheduled consultations" heading="Upcoming" headingId="upcoming-appointments-heading" unit="appointment" />
        {appointments.upcoming.length > 0 ? (
          <div className="doctor-appointment-grid">
            {appointments.upcoming.map(appointment => <AppointmentCard appointment={appointment} key={appointment.id} />)}
          </div>
        ) : (
          <div className="doctor-appointments__empty"><h3>No upcoming consultations</h3><p>New patient bookings will appear here when they are confirmed.</p></div>
        )}
      </section>

      <section aria-labelledby="appointment-history-heading">
        <SectionHeading count={appointments.history.length} eyebrow="Previous activity" heading="History" headingId="appointment-history-heading" unit="record" />
        {appointments.history.length > 0 ? (
          <div className="doctor-appointment-grid doctor-appointment-grid--history">
            {appointments.history.map(appointment => <AppointmentCard appointment={appointment} key={appointment.id} />)}
          </div>
        ) : (
          <div className="doctor-appointments__empty doctor-appointments__empty--quiet"><h3>No appointment history yet.</h3></div>
        )}
      </section>
    </div>
  )
}
