import { Router } from 'express'
import { createAvailabilityController } from '../controllers/availability.controller.js'
import { authorizeRoles } from '../middleware/authorize-roles.js'

export function createDoctorAvailabilityRouter(service, authenticate) {
  const router = Router()
  const controller = createAvailabilityController(service)

  router.get('/me/availability', authenticate, authorizeRoles('doctor'), controller.listMine)
  router.post('/me/availability', authenticate, authorizeRoles('doctor'), controller.create)
  router.delete('/me/availability/:blockId', authenticate, authorizeRoles('doctor'), controller.remove)

  return router
}
