import { Link } from 'react-router-dom'
import { AppointmentCard } from './AppointmentCard.jsx'

export function AppointmentSections({ appointments, audience }) {
  if (appointments.upcoming.length === 0 && appointments.history.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-blue-50 text-xl font-semibold text-blue-700" aria-hidden="true">+</div>
        <h2 className="mt-4 text-xl font-semibold text-slate-950">No appointments yet</h2>
        <p className="mx-auto mt-2 max-w-md leading-7 text-slate-600">
          {audience === 'doctor'
            ? 'New Patient bookings will appear here when they are confirmed.'
            : 'Find a verified doctor and choose a real 30-minute consultation slot.'}
        </p>
        {audience === 'patient' && (
          <Link className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800" to="/doctors">
            Find Doctors
          </Link>
        )}
      </section>
    )
  }

  return (
    <div className="space-y-12">
      <section aria-labelledby="upcoming-appointments-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-700">Scheduled care</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950" id="upcoming-appointments-heading">Upcoming</h2>
          </div>
          <span className="text-sm text-slate-500">{appointments.upcoming.length} {appointments.upcoming.length === 1 ? 'appointment' : 'appointments'}</span>
        </div>
        {appointments.upcoming.length > 0 ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {appointments.upcoming.map(appointment => <AppointmentCard appointment={appointment} audience={audience} key={appointment.id} />)}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center text-slate-600">No upcoming appointments.</div>
        )}
      </section>

      <section aria-labelledby="appointment-history-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-500">Previous activity</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950" id="appointment-history-heading">History</h2>
          </div>
          <span className="text-sm text-slate-500">{appointments.history.length} {appointments.history.length === 1 ? 'record' : 'records'}</span>
        </div>
        {appointments.history.length > 0 ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {appointments.history.map(appointment => <AppointmentCard appointment={appointment} audience={audience} key={appointment.id} />)}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center text-slate-600">No appointment history yet.</div>
        )}
      </section>
    </div>
  )
}
