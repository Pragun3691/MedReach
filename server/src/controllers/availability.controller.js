import {
  availabilityBlockIdSchema,
  createAvailabilitySchema,
} from '../validation/availability.schemas.js'

export function createAvailabilityController(service) {
  return {
    async listMine(request, response) {
      const availability = await service.listForDoctor(request.authUser.id)

      response.status(200).json(availability)
    },

    async create(request, response) {
      const input = createAvailabilitySchema.parse(request.body)
      const availability = await service.create(request.authUser.id, input)

      response.status(201).json({ availability })
    },

    async remove(request, response) {
      const blockId = availabilityBlockIdSchema.parse(request.params.blockId)
      await service.remove(request.authUser.id, blockId)

      response.status(204).send()
    },
  }
}
