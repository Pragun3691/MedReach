import { Router } from 'express'
import { createAvailabilityController } from '../controllers/availability.controller.js'
import { authorizeRoles } from '../middleware/authorize-roles.js'

export function createDoctorAvailabilityRouter(service, authenticate) {
  const router = Router()
  const controller = createAvailabilityController(service)

  router.post('/me/availability', authenticate, authorizeRoles('doctor'), controller.create)

  return router
}
