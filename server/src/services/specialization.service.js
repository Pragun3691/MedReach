import { specializationRepository } from '../data-access/specialization.repository.js'

export function createSpecializationService(repository = specializationRepository) {
  return {
    async list() {
      const rows = await repository.findAll()

      return {
        items: rows.map(row => ({
          id: Number(row.id),
          name: row.name,
        })),
      }
    },
  }
}

export const specializationService = createSpecializationService()
