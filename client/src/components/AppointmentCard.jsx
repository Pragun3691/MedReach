import { Link } from 'react-router-dom'
import { formatAppointmentDate, formatAppointmentTime, formatFee } from '../lib/appointment-format.js'
import { StatusBadge } from './StatusBadge.jsx'

export function AppointmentCard({ appointment, audience }) {
  const person = audience === 'doctor' ? appointment.patient.fullName : appointment.doctor.fullName
  const personLabel = audience === 'doctor' ? 'Patient' : appointment.doctor.specializations.map(item => item.name).join(' · ')

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_36px_-34px_rgba(15,23,42,0.5)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-lg font-semibold text-slate-950">{person}</h3>
            <StatusBadge status={appointment.status} />
          </div>
          <p className="mt-1 text-sm font-medium text-blue-700">{personLabel}</p>
        </div>
        <p className="shrink-0 text-sm font-semibold text-slate-900">{formatFee(appointment.feeSnapshot)}</p>
      </div>

      <dl className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Date</dt>
          <dd className="mt-1 text-sm font-medium text-slate-900">{formatAppointmentDate(appointment.slot.startAt, { short: true })}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Time</dt>
          <dd className="mt-1 text-sm font-medium text-slate-900">{formatAppointmentTime(appointment.slot.startAt)} IST · 30 minutes</dd>
        </div>
      </dl>

      <Link className="mt-5 inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-700 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-50" to={`/appointments/${appointment.id}`}>
        View details
      </Link>
    </article>
  )
}
