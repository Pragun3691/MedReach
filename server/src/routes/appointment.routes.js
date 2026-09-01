import { Router } from 'express'
import { createAppointmentController } from '../controllers/appointment.controller.js'
import { authorizeRoles } from '../middleware/authorize-roles.js'

export function createAppointmentRouter(service, authenticate) {
  const router = Router()
  const controller = createAppointmentController(service)

  router.post('/', authenticate, authorizeRoles('patient'), controller.book)
  router.get('/me', authenticate, authorizeRoles('patient'), controller.listMine)
  router.get('/:appointmentId', authenticate, authorizeRoles('patient', 'doctor'), controller.getById)
  router.post('/:appointmentId/cancel', authenticate, authorizeRoles('patient', 'doctor'), controller.cancel)
  router.post('/:appointmentId/reschedule', authenticate, authorizeRoles('patient'), controller.reschedule)

  return router
}

export function createDoctorAppointmentRouter(service, authenticate) {
  const router = Router()
  const controller = createAppointmentController(service)

  router.get('/me/appointments', authenticate, authorizeRoles('doctor'), controller.listDoctorAppointments)

  return router
}
