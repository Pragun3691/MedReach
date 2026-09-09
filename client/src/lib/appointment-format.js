export function formatAppointmentDate(value, options = {}) {
  return new Intl.DateTimeFormat(options.locale ?? 'en-IN', {
    weekday: options.short ? 'short' : 'long',
    day: 'numeric',
    month: options.short ? 'short' : 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))
}

export function formatAppointmentTime(value, locale = 'en-IN') {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))
}

export function formatFee(value, locale = 'en-IN', missingLabel = 'Fee not listed') {
  if (value === null || value === undefined) return missingLabel
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value)
}

export function formatNotificationTime(value, locale = 'en-IN') {
  const date = new Date(value)
  const difference = date.getTime() - Date.now()
  const absoluteDifference = Math.abs(difference)
  const relative = new Intl.RelativeTimeFormat(locale.startsWith('hi') ? 'hi' : 'en', { numeric: 'auto' })

  if (absoluteDifference < 60 * 1000) return 'just now'
  if (absoluteDifference < 60 * 60 * 1000) return relative.format(Math.round(difference / (60 * 1000)), 'minute')
  if (absoluteDifference < 24 * 60 * 60 * 1000) return relative.format(Math.round(difference / (60 * 60 * 1000)), 'hour')
  if (absoluteDifference < 7 * 24 * 60 * 60 * 1000) return relative.format(Math.round(difference / (24 * 60 * 60 * 1000)), 'day')

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(date)
}
