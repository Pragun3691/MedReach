import {
  AppointmentDataError,
  appointmentRepository,
} from '../data-access/appointment.repository.js'
import { AppError } from '../errors/app-error.js'

function optionalNumber(value) {
  return value === null || value === undefined ? null : Number(value)
}

function mapAppointment(row) {
  return {
    id: Number(row.id),
    status: row.status,
    patient: {
      id: Number(row.patient_id),
      fullName: row.patient_name,
    },
    doctor: {
      id: Number(row.doctor_id),
      fullName: row.doctor_name,
      specializations: row.specializations.map(item => ({
        id: Number(item.id),
        name: item.name,
      })),
    },
    slot: {
      id: Number(row.slot_id),
      startAt: row.start_at,
      endAt: row.end_at,
    },
    feeSnapshot: optionalNumber(row.fee_snapshot),
    rescheduledFromAppointmentId: optionalNumber(row.rescheduled_from_appointment_id),
    replacementAppointmentId: optionalNumber(row.replacement_appointment_id),
    cancellation: row.cancelled_at ? {
      cancelledByUserId: Number(row.cancelled_by_user_id),
      reason: row.cancellation_reason,
      cancelledAt: row.cancelled_at,
    } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function groupedAppointments(rows) {
  const appointments = rows.map(mapAppointment)
  const upcoming = appointments
    .filter(item => item.status === 'booked' && new Date(item.slot.startAt) > new Date())
    .sort((left, right) => new Date(left.slot.startAt) - new Date(right.slot.startAt))
  const history = appointments
    .filter(item => !upcoming.includes(item))
    .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))

  return { upcoming, history }
}

function translateDataError(error) {
  if (!(error instanceof AppointmentDataError)) throw error

  const errors = {
    SLOT_UNAVAILABLE: [409, 'SLOT_UNAVAILABLE', 'Slot is no longer available.'],
    APPOINTMENT_NOT_FOUND: [404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found'],
    APPOINTMENT_ACCESS_DENIED: [403, 'APPOINTMENT_ACCESS_DENIED', 'You cannot access this appointment'],
    APPOINTMENT_NOT_CANCELLABLE: [409, 'APPOINTMENT_NOT_CANCELLABLE', 'This appointment can no longer be cancelled'],
    APPOINTMENT_NOT_RESCHEDULABLE: [409, 'APPOINTMENT_NOT_RESCHEDULABLE', 'This appointment can no longer be rescheduled'],
    SAME_SLOT: [400, 'SAME_SLOT', 'Choose a different slot to reschedule'],
  }
  const [status, code, message] = errors[error.code] ?? []
  if (!status) throw error
  throw new AppError(status, code, message)
}

export function createAppointmentService(repository = appointmentRepository) {
  return {
    async book(patient, slotId) {
      try {
        const row = await repository.book({
          patientId: patient.id,
          patientName: patient.fullName,
          slotId,
        })
        return mapAppointment(row)
      } catch (error) {
        translateDataError(error)
      }
    },

    async listForPatient(patientId) {
      return groupedAppointments(await repository.listForPatient(patientId))
    },

    async listForDoctor(doctorId) {
      return groupedAppointments(await repository.listForDoctor(doctorId))
    },

    async getById(appointmentId, user) {
      const row = await repository.findById(appointmentId)
      if (!row) throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found')

      const isOwner = user.role === 'patient' && Number(row.patient_id) === user.id
      const isAssignedDoctor = user.role === 'doctor' && Number(row.doctor_id) === user.id
      if (!isOwner && !isAssignedDoctor) {
        throw new AppError(403, 'APPOINTMENT_ACCESS_DENIED', 'You cannot access this appointment')
      }

      return mapAppointment(row)
    },

    async cancel(appointmentId, user, reason) {
      if (user.role === 'doctor' && !reason) {
        throw new AppError(400, 'CANCELLATION_REASON_REQUIRED', 'A cancellation reason is required')
      }

      try {
        const row = await repository.cancel({
          appointmentId,
          actorId: user.id,
          actorRole: user.role,
          reason,
        })
        return mapAppointment(row)
      } catch (error) {
        translateDataError(error)
      }
    },

    async reschedule(appointmentId, patientId, slotId) {
      try {
        const row = await repository.reschedule({ appointmentId, patientId, slotId })
        return mapAppointment(row)
      } catch (error) {
        translateDataError(error)
      }
    },
  }
}

export const appointmentService = createAppointmentService()
