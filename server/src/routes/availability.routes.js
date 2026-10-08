import { Router } from 'express'
import { createAvailabilityController } from '../controllers/availability.controller.js'
import { authorizeRoles } from '../middleware/authorize-roles.js'

export function createDoctorAvailabilityRouter(service, authenticate) {
  const router = Router()
  const controller = createAvailabilityController(service)

  router.get('/me/availability', authenticate, authorizeRoles('doctor'), controller.listMine)
  router.post('/me/availability', authenticate, authorizeRoles('doctor'), controller.create)
  router.get('/me/availability/rules', authenticate, authorizeRoles('doctor'), controller.listRecurring)
  router.post('/me/availability/rules', authenticate, authorizeRoles('doctor'), controller.createRecurring)
  router.delete('/me/availability/rules/:ruleId', authenticate, authorizeRoles('doctor'), controller.stopRecurring)
  router.get('/me/availability/exceptions', authenticate, authorizeRoles('doctor'), controller.listExceptions)
  router.post('/me/availability/exceptions', authenticate, authorizeRoles('doctor'), controller.createException)
  router.delete('/me/availability/exceptions/ranges/:rangeId', authenticate, authorizeRoles('doctor'), controller.removeExceptionRange)
  router.delete('/me/availability/exceptions/:exceptionId', authenticate, authorizeRoles('doctor'), controller.removeException)
  router.delete('/me/availability/:blockId', authenticate, authorizeRoles('doctor'), controller.remove)

  return router
}
