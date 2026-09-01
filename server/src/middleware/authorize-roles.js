import { AppError } from '../errors/app-error.js'

export function authorizeRoles(...allowedRoles) {
  return function authorizeRole(request, _response, next) {
    if (!request.authUser || !allowedRoles.includes(request.authUser.role)) {
      next(new AppError(403, 'ROLE_FORBIDDEN', 'This account cannot perform that action'))
      return
    }

    next()
  }
}
