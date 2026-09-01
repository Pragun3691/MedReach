import {
  appointmentIdSchema,
  bookingSchema,
  cancellationSchema,
  rescheduleSchema,
} from '../validation/appointment.schemas.js'

export function createAppointmentController(service) {
  return {
    async book(request, response) {
      const { slotId } = bookingSchema.parse(request.body)
      const appointment = await service.book(request.authUser, slotId)
      response.status(201).json({ appointment })
    },

    async listMine(request, response) {
      const appointments = await service.listForPatient(request.authUser.id)
      response.status(200).json(appointments)
    },

    async listDoctorAppointments(request, response) {
      const appointments = await service.listForDoctor(request.authUser.id)
      response.status(200).json(appointments)
    },

    async getById(request, response) {
      const appointmentId = appointmentIdSchema.parse(request.params.appointmentId)
      const appointment = await service.getById(appointmentId, request.authUser)
      response.status(200).json({ appointment })
    },

    async cancel(request, response) {
      const appointmentId = appointmentIdSchema.parse(request.params.appointmentId)
      const { reason } = cancellationSchema.parse(request.body ?? {})
      const appointment = await service.cancel(appointmentId, request.authUser, reason)
      response.status(200).json({ appointment })
    },

    async reschedule(request, response) {
      const appointmentId = appointmentIdSchema.parse(request.params.appointmentId)
      const { slotId } = rescheduleSchema.parse(request.body)
      const appointment = await service.reschedule(appointmentId, request.authUser.id, slotId)
      response.status(200).json({ appointment })
    },
  }
}
