export function createSpecializationController(service) {
  return {
    async list(_request, response) {
      const result = await service.list()

      response.status(200).json(result)
    },
  }
}
