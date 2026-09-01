import { destroySession, regenerateSession, saveSession } from '../session/session-lifecycle.js'
import { sessionCookieName, sessionCookieOptions } from '../session/session.js'
import {
  doctorRegistrationSchema,
  loginSchema,
  patientRegistrationSchema,
} from '../validation/auth.schemas.js'

export function createAuthController(service) {
  return {
    async registerPatient(request, response) {
      const input = patientRegistrationSchema.parse(request.body)
      const user = await service.registerPatient(input)

      response.status(201).json({
        message: 'Patient account created. You can now log in.',
        user,
      })
    },

    async registerDoctor(request, response) {
      const input = doctorRegistrationSchema.parse(request.body)
      const user = await service.registerDoctor(input)

      response.status(201).json({
        message: 'Doctor account created. Your profile will remain private until verification is complete.',
        user,
      })
    },

    async login(request, response) {
      const { email, password } = loginSchema.parse(request.body)
      const user = await service.authenticate(email, password)

      await regenerateSession(request)
      request.session.userId = user.id
      await saveSession(request)

      response.status(200).json({ user })
    },

    async logout(request, response) {
      await destroySession(request)
      response.clearCookie(sessionCookieName, sessionCookieOptions())
      response.status(200).json({ message: 'You have been logged out.' })
    },

    async me(request, response) {
      response.status(200).json({ user: request.authUser })
    },
  }
}
