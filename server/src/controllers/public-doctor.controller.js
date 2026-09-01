import {
  doctorIdSchema,
  doctorSearchQuerySchema,
  doctorSlotsQuerySchema,
} from '../validation/public-doctor.schemas.js'

export function createPublicDoctorController(service) {
  return {
    async search(request, response) {
      const filters = doctorSearchQuerySchema.parse(request.query)
      const result = await service.search(filters)

      response.status(200).json(result)
    },

    async getById(request, response) {
      const doctorId = doctorIdSchema.parse(request.params.doctorId)
      const doctor = await service.getById(doctorId)

      response.status(200).json(doctor)
    },

    async getSlots(request, response) {
      const doctorId = doctorIdSchema.parse(request.params.doctorId)
      const { date } = doctorSlotsQuerySchema.parse(request.query)
      const result = await service.getSlots(doctorId, date)

      response.status(200).json(result)
    },
  }
}
