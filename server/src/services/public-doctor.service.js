import { publicDoctorRepository } from '../data-access/public-doctor.repository.js'
import { AppError } from '../errors/app-error.js'

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
      const result = await repository.search(filters)

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
