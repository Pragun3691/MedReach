import { Link } from 'react-router-dom'

function initials(name) {
  return name
    .replace(/^Dr\.\s*/i, '')
    .split(' ')
    .slice(0, 2)
    .map(part => part[0])
    .join('')
}

function formatAvailability(value) {
  if (!value) return null

  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))
}

function formatSelectedDate(value) {
  if (!value) return null

  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(`${value}T12:00:00+05:30`))
}

export function DoctorResultCard({ doctor, selectedDate }) {
  const availability = selectedDate
    ? `Available ${formatSelectedDate(selectedDate)}`
    : formatAvailability(doctor.nextAvailableAt)

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_12px_35px_-30px_rgba(15,23,42,0.55)] sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="grid size-16 shrink-0 place-items-center rounded-full bg-blue-50 text-lg font-bold text-blue-700" aria-hidden="true">
          {initials(doctor.fullName)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">{doctor.fullName}</h2>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
              <span className="grid size-4 place-items-center rounded-full bg-blue-700 text-[10px] text-white" aria-hidden="true">✓</span>
              Verified
            </span>
          </div>

          <p className="mt-1 font-medium text-blue-700">
            {doctor.specializations.map(specialization => specialization.name).join(' · ')}
          </p>
          <p className="mt-1 text-sm text-slate-600">{doctor.qualification}</p>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-700">
            <span><strong className="font-semibold text-slate-950">{doctor.experienceYears} years</strong> experience</span>
            {doctor.clinic?.name && <span>{doctor.clinic.name}</span>}
          </div>

          {doctor.bio && <p className="mt-4 max-w-3xl leading-7 text-slate-600">{doctor.bio}</p>}

          <div className="mt-5 flex flex-col gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                  {selectedDate ? 'Selected date' : 'Next available'}
                </p>
                <p className={`mt-1 text-sm font-semibold ${availability ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {availability ?? 'No upcoming slots'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Consultation fee</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">
                  {doctor.defaultFee === null ? 'Shown with slots' : `₹${doctor.defaultFee}`}
                </p>
              </div>
            </div>

            <Link
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
              to={`/doctors/${doctor.id}${selectedDate ? `?date=${selectedDate}` : ''}`}
            >
              View profile
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}
