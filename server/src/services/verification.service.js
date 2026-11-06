import { verificationRepository } from '../data-access/verification.repository.js'

export function createVerificationService(repository = verificationRepository) {
  return {
    list: filters => repository.list(filters),
    get: id => repository.get(id),
    getMine: doctorId => repository.getMine(doctorId),
    async submit(doctorId, input) {
      await repository.submit(doctorId, input)
      return repository.getMine(doctorId)
    },
    approve: (id, adminId, input) => repository.review(id, adminId, 'approved', input),
    reject: (id, adminId, input) => repository.review(id, adminId, 'rejected', input),
  }
}

export const verificationService = createVerificationService()
