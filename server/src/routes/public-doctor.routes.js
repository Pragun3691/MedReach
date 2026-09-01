import { Router } from 'express'
import { createPublicDoctorController } from '../controllers/public-doctor.controller.js'

export function createPublicDoctorRouter(service) {
  const router = Router()
  const controller = createPublicDoctorController(service)

  router.get('/', controller.search)
  router.get('/:doctorId/slots', controller.getSlots)
  router.get('/:doctorId', controller.getById)

  return router
}
