function initials(name) {
  return name
    .replace(/^Dr\.\s*/i, '')
    .split(' ')
    .slice(0, 2)
    .map(part => part[0])
    .join('')
}

function nextAvailability(value) {
  if (!value) return 'Availability coming soon'

  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))
}

export function DoctorPreview({ doctors, loading, error, onRetry }) {
  return (
    <div className="relative mx-auto max-w-[520px] lg:ml-auto">
      <div className="absolute -left-5 top-12 hidden h-[78%] w-10 rounded-l-3xl bg-blue-200/70 lg:block" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-[26px] border border-blue-100 bg-white shadow-[0_30px_70px_-38px_rgba(15,23,42,0.45)]">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">Doctor discovery</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-950">Verified care, clear availability</h2>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">Current availability</span>
          </div>
        </div>

        <div className="min-h-[276px] p-3 sm:p-4">
          {loading && (
            <div className="space-y-3" aria-label="Loading doctor preview">
              {[1, 2].map(item => (
                <div className="animate-pulse rounded-2xl border border-slate-100 p-4" key={item}>
                  <div className="flex gap-3">
                    <div className="size-12 rounded-full bg-slate-200" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="h-4 w-36 rounded bg-slate-200" />
                      <div className="h-3 w-48 rounded bg-slate-100" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="grid min-h-[244px] place-items-center rounded-2xl bg-slate-50 px-6 text-center">
              <div>
                <p className="font-semibold text-slate-900">Doctor preview is temporarily unavailable</p>
                <p className="mt-2 text-sm text-slate-600">Check that the MedReach API is running, then try again.</p>
                <button className="mt-4 text-sm font-semibold text-blue-700 hover:text-blue-800" onClick={onRetry} type="button">
                  Try again
                </button>
              </div>
            </div>
          )}

          {!loading && !error && doctors.map(doctor => (
            <article className="rounded-2xl border border-slate-200 p-4 [&+&]:mt-3" key={doctor.id}>
              <div className="flex items-start gap-3">
                <div className="grid size-12 shrink-0 place-items-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">
                  {initials(doctor.fullName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="font-semibold text-slate-950">{doctor.fullName}</h3>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                      <span className="grid size-4 place-items-center rounded-full bg-blue-700 text-[10px] text-white" aria-hidden="true">✓</span>
                      Verified
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-600">
                    {doctor.specializations.map(item => item.name).join(', ')} · {doctor.experienceYears} years
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm">
                    <span className="font-medium text-emerald-700">Next: {nextAvailability(doctor.nextAvailableAt)}</span>
                    {doctor.defaultFee !== null && <span className="font-semibold text-slate-800">₹{doctor.defaultFee}</span>}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
