import {
  AppointmentDataError,
  appointmentRepository,
} from '../data-access/appointment.repository.js'
import { AppError } from '../errors/app-error.js'
import { consultationTimes, isConsultationEditable, isWithin } from './consultation-lifecycle.js'
import { JaasConfigurationError, jaasTokenService } from './jaas-token.service.js'

function optionalNumber(value) {
  return value === null || value === undefined ? null : Number(value)
}

function mapClinicalWorkspace(row) {
  return {
    consultationId: Number(row.id),
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? null,
    notes: row.notes ?? '',
    prescriptionItems: row.prescription_items.map(item => ({
      id: Number(item.id),
      medicineName: item.medicineName,
      dosage: item.dosage,
      frequency: item.frequency,
      duration: item.duration,
      instructions: item.instructions,
    })),
    followUp: row.follow_up_interval ? {
      interval: Number(row.follow_up_interval),
      unit: row.follow_up_unit,
      targetAt: row.follow_up_target_at ?? null,
    } : null,
    editable: row.appointment_status === 'booked' && row.finished_at == null,
  }
}

function mapAppointment(row, user, now = new Date()) {
  const consultation = row.consultation_id ? {
    id: Number(row.consultation_id),
    startedAt: row.consultation_started_at,
    finishedAt: row.consultation_finished_at,
  } : null
  const times = consultationTimes(row.start_at, row.end_at)
  const instant = new Date(now).getTime()
  const isOwner = user?.role === 'patient' && Number(row.patient_id) === user.id
  const isAssignedDoctor = user?.role === 'doctor' && Number(row.doctor_id) === user.id
  const isBooked = row.status === 'booked'
  const hasConsultation = Boolean(consultation)
  const beforeNoShowCutoff = instant < times.noShowAvailableAt.getTime()
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
    consultationFlow: {
      readyAt: row.ready_at ?? null,
      roomOpenedAt: row.room_opened_at ?? null,
      consultationId: consultation?.id ?? null,
      consultationStartedAt: consultation?.startedAt ?? null,
      consultationFinishedAt: consultation?.finishedAt ?? null,
      checkInOpensAt: times.checkInOpensAt.toISOString(),
      doctorRoomOpensAt: times.doctorRoomOpensAt.toISOString(),
      noShowAvailableAt: times.noShowAvailableAt.toISOString(),
      startCutoffAt: times.startCutoffAt.toISOString(),
      canMarkReady: isOwner && isBooked && !hasConsultation && isWithin(now, times.checkInOpensAt, times.startCutoffAt),
      canOpenRoom: isAssignedDoctor && isBooked && !hasConsultation && isWithin(now, times.doctorRoomOpensAt, times.startCutoffAt),
      canBeginConsultation: isAssignedDoctor && isBooked && !hasConsultation && Boolean(row.room_opened_at) && isWithin(now, times.doctorRoomOpensAt, times.startCutoffAt),
      canMarkNoShow: isAssignedDoctor && isBooked && !hasConsultation && instant >= times.noShowAvailableAt.getTime(),
      canCancel: isBooked && !hasConsultation && (isAssignedDoctor || (isOwner && beforeNoShowCutoff)),
      canReschedule: isOwner && isBooked && !hasConsultation && beforeNoShowCutoff,
      isClinicalWorkspaceEditable: isConsultationEditable(consultation && {
        finished_at: consultation.finishedAt,
      }),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function groupedAppointments(rows, user, now) {
  const appointments = rows.map(row => mapAppointment(row, user, now))
  const upcoming = appointments
    .filter(item => item.status === 'booked' && new Date(item.slot.startAt) > new Date(now))
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
    APPOINTMENT_NOT_READYABLE: [409, 'APPOINTMENT_NOT_READYABLE', 'Check-in is not available for this appointment'],
    ROOM_NOT_OPENABLE: [409, 'ROOM_NOT_OPENABLE', 'The consultation room cannot be opened at this time'],
    CONSULTATION_NOT_BEGINNABLE: [409, 'CONSULTATION_NOT_BEGINNABLE', 'The consultation cannot be started at this time'],
    APPOINTMENT_NOT_NO_SHOWABLE: [409, 'APPOINTMENT_NOT_NO_SHOWABLE', 'This appointment cannot be marked as a no-show'],
    CONSULTATION_NOT_FINISHABLE: [409, 'CONSULTATION_NOT_FINISHABLE', 'The consultation cannot be finished'],
    CLINICAL_WORKSPACE_UNAVAILABLE: [409, 'CLINICAL_WORKSPACE_UNAVAILABLE', 'The clinical workspace is not available for this appointment'],
    CLINICAL_WORKSPACE_LOCKED: [409, 'CLINICAL_WORKSPACE_LOCKED', 'This consultation is finished and its clinical record is read-only'],
    VIDEO_SESSION_UNAVAILABLE: [409, 'VIDEO_SESSION_UNAVAILABLE', 'Video access is not available for this appointment'],
    SAME_SLOT: [400, 'SAME_SLOT', 'Choose a different slot to reschedule'],
  }
  const [status, code, message] = errors[error.code] ?? []
  if (!status) throw error
  throw new AppError(status, code, message)
}

export function createAppointmentService(repository = appointmentRepository, clock = () => new Date(), tokenService = jaasTokenService) {
  return {
    async book(patient, slotId) {
      try {
        const row = await repository.book({
          patientId: patient.id,
          patientName: patient.fullName,
          slotId,
        })
        return mapAppointment(row, patient, clock())
      } catch (error) {
        translateDataError(error)
      }
    },

    async listForPatient(patientId) {
      const now = clock()
      return groupedAppointments(await repository.listForPatient(patientId), { id: patientId, role: 'patient' }, now)
    },

    async listForDoctor(doctorId) {
      const now = clock()
      return groupedAppointments(await repository.listForDoctor(doctorId), { id: doctorId, role: 'doctor' }, now)
    },

    async getById(appointmentId, user) {
      const row = await repository.findById(appointmentId)
      if (!row) throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found')

      const isOwner = user.role === 'patient' && Number(row.patient_id) === user.id
      const isAssignedDoctor = user.role === 'doctor' && Number(row.doctor_id) === user.id
      if (!isOwner && !isAssignedDoctor) {
        throw new AppError(403, 'APPOINTMENT_ACCESS_DENIED', 'You cannot access this appointment')
      }

      return mapAppointment(row, user, clock())
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
          now: clock(),
        })
        return mapAppointment(row, user, clock())
      } catch (error) {
        translateDataError(error)
      }
    },

    async reschedule(appointmentId, patient, slotId) {
      try {
        const row = await repository.reschedule({ appointmentId, patientId: patient.id, slotId, now: clock() })
        return mapAppointment(row, patient, clock())
      } catch (error) {
        translateDataError(error)
      }
    },

    async markReady(appointmentId, patient) {
      try {
        return mapAppointment(await repository.markReady({ appointmentId, patientId: patient.id, now: clock() }), patient, clock())
      } catch (error) {
        translateDataError(error)
      }
    },

    async openRoom(appointmentId, doctor) {
      try {
        return mapAppointment(await repository.openRoom({ appointmentId, doctorId: doctor.id, now: clock() }), doctor, clock())
      } catch (error) {
        translateDataError(error)
      }
    },

    async beginConsultation(appointmentId, doctor) {
      try {
        return mapAppointment(await repository.beginConsultation({ appointmentId, doctorId: doctor.id, now: clock() }), doctor, clock())
      } catch (error) {
        translateDataError(error)
      }
    },

    async markNoShow(appointmentId, doctor) {
      try {
        return mapAppointment(await repository.markNoShow({ appointmentId, doctorId: doctor.id, now: clock() }), doctor, clock())
      } catch (error) {
        translateDataError(error)
      }
    },

    async finishConsultation(appointmentId, doctor) {
      try {
        return mapAppointment(await repository.finishConsultation({ appointmentId, doctorId: doctor.id, now: clock() }), doctor, clock())
      } catch (error) {
        translateDataError(error)
      }
    },

    async getClinicalWorkspace(appointmentId, user) {
      try {
        return mapClinicalWorkspace(await repository.getClinicalWorkspace({ appointmentId, userId: user.id, userRole: user.role }))
      } catch (error) {
        translateDataError(error)
      }
    },

    async saveClinicalDraft(appointmentId, doctor, draft) {
      try {
        return mapClinicalWorkspace(await repository.saveClinicalDraft({ appointmentId, doctorId: doctor.id, draft }))
      } catch (error) {
        translateDataError(error)
      }
    },

    async createVideoSession(appointmentId, user) {
      try {
        const authorization = await repository.authorizeVideoSession({
          appointmentId,
          userId: user.id,
          userRole: user.role,
          now: clock(),
        })
        return await tokenService.createVideoSession({
          appointmentId: authorization.appointmentId,
          user,
        })
      } catch (error) {
        if (error instanceof JaasConfigurationError) {
          if (process.env.NODE_ENV !== 'test') {
            console.error('JaaS video authorization is unavailable because server configuration is invalid')
          }
          throw new AppError(503, 'VIDEO_CONFIGURATION_UNAVAILABLE', 'Video service is temporarily unavailable')
        }
        translateDataError(error)
      }
    },
  }
}

export const appointmentService = createAppointmentService()
