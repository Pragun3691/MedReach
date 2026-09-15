import {
  AvailabilityDataError,
  availabilityRepository,
} from '../data-access/availability.repository.js'
import { AppError } from '../errors/app-error.js'

function indiaInstant(date, time) {
  return new Date(`${date}T${time}:00+05:30`)
}

function optionalNumber(value) {
  return value === null || value === undefined ? null : Number(value)
}

function translateDataError(error) {
  if (!(error instanceof AvailabilityDataError)) throw error

  if (error.code === 'AVAILABILITY_OVERLAP') {
    throw new AppError(409, 'AVAILABILITY_OVERLAP', 'Availability overlaps an existing block')
  }

  if (error.code === 'DOCTOR_NOT_APPROVED') {
    throw new AppError(403, 'DOCTOR_NOT_APPROVED', 'Only approved Doctors can create availability')
  }

  if (error.code === 'ACCOUNT_DISABLED') {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is disabled')
  }

  throw error
}

export function createAvailabilityService(repository = availabilityRepository, clock = () => new Date()) {
  return {
    async create(doctorId, input) {
      const startAt = indiaInstant(input.date, input.startTime)
      const endAt = indiaInstant(input.date, input.endTime)

      if (startAt <= clock()) {
        throw new AppError(400, 'AVAILABILITY_IN_PAST', 'Availability must start in the future')
      }

      try {
        const result = await repository.create({
          doctorId,
          startAt,
          endAt,
          fee: input.fee ?? null,
        })

        return {
          id: Number(result.block.id),
          doctorId: Number(result.block.doctor_id),
          date: input.date,
          startAt: result.block.start_at,
          endAt: result.block.end_at,
          fee: optionalNumber(result.block.effective_fee),
          slots: result.slots.map(slot => ({
            id: Number(slot.id),
            startAt: slot.start_at,
            endAt: slot.end_at,
          })),
          createdAt: result.block.created_at,
          updatedAt: result.block.updated_at,
        }
      } catch (error) {
        translateDataError(error)
      }
    },
  }
}

export const availabilityService = createAvailabilityService()
