import { Router } from 'express'
import { createAuthController } from '../controllers/auth.controller.js'
import { issueCsrfToken } from '../middleware/csrf.js'

export function createAuthRouter(service, authenticate) {
  const router = Router()
  const controller = createAuthController(service)

  router.post('/register/patient', controller.registerPatient)
  router.post('/register/doctor', controller.registerDoctor)
  router.post('/login', controller.login)
  router.post('/logout', authenticate, controller.logout)
  router.get('/me', authenticate, controller.me)
  router.get('/csrf', authenticate, issueCsrfToken)

  return router
}
