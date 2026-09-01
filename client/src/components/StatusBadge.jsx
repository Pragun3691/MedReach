const statusStyles = {
  booked: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  completed: 'bg-blue-50 text-blue-700 ring-blue-200',
  cancelled: 'bg-rose-50 text-rose-700 ring-rose-200',
  no_show: 'bg-amber-50 text-amber-800 ring-amber-200',
  rescheduled: 'bg-slate-100 text-slate-700 ring-slate-200',
}

const statusLabels = {
  booked: 'Booked',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
  rescheduled: 'Rescheduled',
}

export function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyles[status] ?? statusStyles.rescheduled}`}>
      {statusLabels[status] ?? status}
    </span>
  )
}
