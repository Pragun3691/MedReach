export function formatAppointmentDate(value, options = {}) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: options.short ? 'short' : 'long',
    day: 'numeric',
    month: options.short ? 'short' : 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))
}

export function formatAppointmentTime(value) {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))
}

export function formatFee(value) {
  if (value === null || value === undefined) return 'Fee not listed'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value)
}

export function formatNotificationTime(value) {
  const date = new Date(value)
  const difference = date.getTime() - Date.now()
  const absoluteDifference = Math.abs(difference)
  const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  if (absoluteDifference < 60 * 1000) return 'just now'
  if (absoluteDifference < 60 * 60 * 1000) return relative.format(Math.round(difference / (60 * 1000)), 'minute')
  if (absoluteDifference < 24 * 60 * 60 * 1000) return relative.format(Math.round(difference / (60 * 60 * 1000)), 'hour')
  if (absoluteDifference < 7 * 24 * 60 * 60 * 1000) return relative.format(Math.round(difference / (24 * 60 * 60 * 1000)), 'day')

  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(date)
}
