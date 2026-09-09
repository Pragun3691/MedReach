import { publicDoctorRepository } from '../data-access/public-doctor.repository.js'
import { AppError } from '../errors/app-error.js'
import {
  normalizeDoctorName,
  resolveSpecializationQuery,
} from './doctor-search.js'

function optionalNumber(value) {
  return value === null ? null : Number(value)
}

function mapDoctor(row) {
  return {
    id: Number(row.id),
    fullName: row.full_name,
    verified: true,
    qualification: row.qualification,
    experienceYears: row.experience_years,
    bio: row.bio,
    clinic: {
      name: row.clinic_name,
      city: row.clinic_city,
      district: row.clinic_district,
    },
    defaultFee: optionalNumber(row.default_fee),
    specializations: row.specializations.map(specialization => ({
      id: Number(specialization.id),
      name: specialization.name,
    })),
    nextAvailableAt: row.next_available_at,
  }
}

export function createPublicDoctorService(repository = publicDoctorRepository) {
  return {
    async search(filters) {
      const resolvedFilters = { ...filters }
      let vocabulary

      async function getVocabulary() {
        vocabulary ??= (await repository.findSearchVocabulary()).map(item => ({
          specializationId: Number(item.specialization_id),
          name: item.name,
          terms: item.terms,
        }))
        return vocabulary
      }

      if (filters.name) resolvedFilters.name = normalizeDoctorName(filters.name)
      if (filters.q) {
        const specializationMatch = resolveSpecializationQuery(
          filters.q,
          await getVocabulary(),
        )
        resolvedFilters.qName = normalizeDoctorName(filters.q)
        resolvedFilters.qSpecializationIds = specializationMatch.specializationIds
        resolvedFilters.qSpecializationKind = specializationMatch.kind
      }
      for (const field of ['specialization', 'problem']) {
        if (!filters[field]) continue
        const matchField = field === 'specialization' ? 'specializationIds' : 'problemSpecializationIds'
        resolvedFilters[matchField] = resolveSpecializationQuery(
          filters[field],
          await getVocabulary(),
        ).specializationIds
      }

      const result = await repository.search(resolvedFilters)

      return {
        items: result.rows.map(mapDoctor),
        limit: filters.limit,
        offset: filters.offset,
        total: result.total,
      }
    },

    async getById(doctorId) {
      const doctor = await repository.findById(doctorId)

      if (!doctor) {
        throw new AppError(404, 'DOCTOR_NOT_FOUND', 'Doctor not found')
      }

      return mapDoctor(doctor)
    },

    async getSlots(doctorId, date) {
      const doctor = await repository.findById(doctorId)

      if (!doctor) {
        throw new AppError(404, 'DOCTOR_NOT_FOUND', 'Doctor not found')
      }

      const slots = await repository.findSlotsByDate(doctorId, date)

      return {
        doctorId,
        date,
        items: slots.map(slot => ({
          id: Number(slot.id),
          startAt: slot.start_at,
          endAt: slot.end_at,
          fee: optionalNumber(slot.fee),
        })),
      }
    },
  }
}

export const publicDoctorService = createPublicDoctorService()
