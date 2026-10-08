import {
  availabilityBlockIdSchema,
  availabilityExceptionIdSchema,
  availabilityExceptionRangeIdSchema,
  createAvailabilityExceptionSchema,
  createAvailabilitySchema,
  createRecurringAvailabilitySchema,
  recurringAvailabilityRuleIdSchema,
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

    async listExceptions(request, response) {
      const exceptions = await service.listExceptions(request.authUser.id)

      response.status(200).json(exceptions)
    },

    async createException(request, response) {
      const input = createAvailabilityExceptionSchema.parse(request.body)
      const result = await service.createException(request.authUser.id, input)

      response.status(201).json('startDate' in input ? { range: result } : { exception: result })
    },

    async removeExceptionRange(request, response) {
      const rangeId = availabilityExceptionRangeIdSchema.parse(request.params.rangeId)
      await service.removeExceptionRange(request.authUser.id, rangeId)

      response.status(204).send()
    },

    async removeException(request, response) {
      const exceptionId = availabilityExceptionIdSchema.parse(request.params.exceptionId)
      await service.removeException(request.authUser.id, exceptionId)

      response.status(204).send()
    },

    async stopRecurring(request, response) {
      const ruleId = recurringAvailabilityRuleIdSchema.parse(request.params.ruleId)
      await service.stopRecurring(request.authUser.id, ruleId)

      response.status(204).send()
    },

    async remove(request, response) {
      const blockId = availabilityBlockIdSchema.parse(request.params.blockId)
      await service.remove(request.authUser.id, blockId)

      response.status(204).send()
    },
  }
}
