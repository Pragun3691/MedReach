import { randomBytes, timingSafeEqual } from 'node:crypto'
import { AppError } from '../errors/app-error.js'
import { saveSession } from '../session/session-lifecycle.js'

export async function issueCsrfToken(request, response) {
  if (!request.session.csrfToken) request.session.csrfToken = randomBytes(32).toString('hex')
  await saveSession(request)
  response.set('Cache-Control', 'no-store').json({ csrfToken: request.session.csrfToken })
}

export function requireCsrf(request, _response, next) {
  const token = request.get('X-CSRF-Token')
  const expected = request.session?.csrfToken
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)
    || typeof expected !== 'string' || expected.length !== 64
    || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    next(new AppError(403, 'CSRF_INVALID', 'Refresh this page and try again.'))
    return
  }
  next()
}
