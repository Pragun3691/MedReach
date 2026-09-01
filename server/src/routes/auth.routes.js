import { Router } from 'express'
import { createAuthController } from '../controllers/auth.controller.js'

export function createAuthRouter(service, authenticate) {
  const router = Router()
  const controller = createAuthController(service)

  router.post('/register/patient', controller.registerPatient)
  router.post('/register/doctor', controller.registerDoctor)
  router.post('/login', controller.login)
  router.post('/logout', authenticate, controller.logout)
  router.get('/me', authenticate, controller.me)

  return router
}
