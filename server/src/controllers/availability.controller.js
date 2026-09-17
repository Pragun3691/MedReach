import {
  availabilityBlockIdSchema,
  createAvailabilitySchema,
  createRecurringAvailabilitySchema,
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

    async listRecurring(request, response) {
      const rules = await service.listRecurringForDoctor(request.authUser.id)

      response.status(200).json(rules)
    },

    async createRecurring(request, response) {
      const input = createRecurringAvailabilitySchema.parse(request.body)
      const rule = await service.createRecurring(request.authUser.id, input)

      response.status(201).json({ rule })
    },

    async remove(request, response) {
      const blockId = availabilityBlockIdSchema.parse(request.params.blockId)
      await service.remove(request.authUser.id, blockId)

      response.status(204).send()
    },
  }
}
