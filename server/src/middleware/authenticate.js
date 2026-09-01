import { AppError } from '../errors/app-error.js'
import { destroySession } from '../session/session-lifecycle.js'

export function createAuthenticationMiddleware(service) {
  return async function authenticate(request, _response, next) {
    const userId = request.session?.userId

    if (!userId) {
      next(new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required'))
      return
    }

    const user = await service.getSessionUser(userId)

    if (!user) {
      await destroySession(request)
      next(new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required'))
      return
    }

    if (!user.isEnabled) {
      await destroySession(request)
      next(new AppError(403, 'ACCOUNT_DISABLED', 'This account is disabled'))
      return
    }

    request.authUser = user
    next()
  }
}
