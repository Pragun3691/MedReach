export const verificationLabels = {
  missing_credentials: 'Missing credentials', pending: 'Pending review', approved: 'Approved', rejected: 'Rejected',
}

export function validateCredentials(values) {
  const errors = {}
  for (const [key, label, max] of [
    ['registrationNumber', 'medical registration number', 100],
    ['issuingAuthority', 'issuing authority', 160],
  ]) {
    const text = values[key]?.trim() ?? ''
    if (text.length < 2 || text.length > max || /\p{Cc}/u.test(text)) {
      errors[key] = `Enter your ${label} (2 to ${max} characters, without control characters).`
    }
  }
  return errors
}

export function verificationDate(value) {
  return value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST' : 'Not submitted'
}
