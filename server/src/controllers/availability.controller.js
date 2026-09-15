import { createAvailabilitySchema } from '../validation/availability.schemas.js'

export function createAvailabilityController(service) {
  return {
    async create(request, response) {
      const input = createAvailabilitySchema.parse(request.body)
      const availability = await service.create(request.authUser.id, input)

      response.status(201).json({ availability })
    },
  }
}
