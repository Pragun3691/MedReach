export function safeInternalReturnTo(value, fallback = '/') {
  if (typeof value !== 'string') return fallback
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback
  if (/\p{Cc}/u.test(value)) return fallback

  return value
}
