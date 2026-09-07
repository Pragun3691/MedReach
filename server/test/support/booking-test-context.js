import { AppError } from '../../src/errors/app-error.js'
import { AppointmentDataError } from '../../src/data-access/appointment.repository.js'
import { createAppointmentService } from '../../src/services/appointment.service.js'
import { createNotificationService } from '../../src/services/notification.service.js'

const hour = 60 * 60 * 1000

function indiaDate(value) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))
}

export function createBookingTestContext({
  clock = () => new Date(),
  tokenService = {
    async createVideoSession({ appointmentId, user }) {
      return {
        domain: '8x8.vc',
        roomName: `test-app/medreach-appointment-${appointmentId}`,
        jwt: `test-jwt-${appointmentId}-${user.role}`,
        expiresAt: new Date(new Date(clock()).getTime() + 10 * 60 * 1000).toISOString(),
        role: user.role,
      }
    },
  },
} = {}) {
  const users = [
    { id: 1, fullName: 'Ananya Rao', email: 'patient@example.test', role: 'patient', isEnabled: true },
    { id: 2, fullName: 'Rohan Das', email: 'other-patient@example.test', role: 'patient', isEnabled: true },
    { id: 10, fullName: 'Dr. Aditi Sharma', email: 'doctor@example.test', role: 'doctor', isEnabled: true },
    { id: 11, fullName: 'Dr. Pending Sen', email: 'pending@example.test', role: 'doctor', isEnabled: true },
    { id: 12, fullName: 'Dr. Disabled Roy', email: 'disabled-doctor@example.test', role: 'doctor', isEnabled: false },
    { id: 13, fullName: 'Dr. Nisha Kapoor', email: 'other-doctor@example.test', role: 'doctor', isEnabled: true },
    { id: 20, fullName: 'MedReach Admin', email: 'admin@example.test', role: 'admin', isEnabled: true },
  ]
  const doctors = new Map([
    [10, { status: 'approved', defaultFee: 650, specializations: [{ id: 1, name: 'General Medicine' }] }],
    [11, { status: 'pending', defaultFee: 500, specializations: [{ id: 2, name: 'Dermatology' }] }],
    [12, { status: 'approved', defaultFee: 550, specializations: [{ id: 1, name: 'General Medicine' }] }],
    [13, { status: 'approved', defaultFee: 800, specializations: [{ id: 3, name: 'Cardiology' }] }],
  ])
  const slots = [
    { id: 101, doctorId: 10, startAt: new Date(Date.now() + 24 * hour).toISOString(), active: true, effectiveFee: 700 },
    { id: 102, doctorId: 10, startAt: new Date(Date.now() + 48 * hour).toISOString(), active: true, effectiveFee: null },
    { id: 103, doctorId: 10, startAt: new Date(Date.now() + 72 * hour).toISOString(), active: false, effectiveFee: 700 },
    { id: 104, doctorId: 10, startAt: new Date(Date.now() - 24 * hour).toISOString(), active: true, effectiveFee: 700 },
    { id: 105, doctorId: 11, startAt: new Date(Date.now() + 24 * hour).toISOString(), active: true, effectiveFee: 500 },
    { id: 106, doctorId: 12, startAt: new Date(Date.now() + 24 * hour).toISOString(), active: true, effectiveFee: 550 },
    { id: 107, doctorId: 13, startAt: new Date(Date.now() + 96 * hour).toISOString(), active: true, effectiveFee: 900 },
  ].map(slot => ({ ...slot, endAt: new Date(new Date(slot.startAt).getTime() + 30 * 60 * 1000).toISOString() }))
  const appointments = []
  const notifications = []
  const consultations = []
  let nextAppointmentId = 1000
  let nextNotificationId = 5000

  function userById(userId) {
    return users.find(user => user.id === Number(userId))
  }

  function slotById(slotId) {
    return slots.find(slot => slot.id === Number(slotId))
  }

  function doctorAvailable(doctorId) {
    const user = userById(doctorId)
    return user?.isEnabled && doctors.get(doctorId)?.status === 'approved'
  }

  function slotAvailable(slot) {
    return Boolean(
      slot
      && slot.active
      && new Date(slot.startAt) > new Date()
      && doctorAvailable(slot.doctorId)
      && !appointments.some(item => item.slotId === slot.id && item.status === 'booked'),
    )
  }

  function addNotification(recipientUserId, type, message, appointmentId) {
    notifications.push({
      id: nextNotificationId++,
      recipient_user_id: Number(recipientUserId),
      type,
      message,
      is_read: false,
      action_path: `/appointments/${appointmentId}`,
      created_at: new Date(Date.now() + notifications.length).toISOString(),
    })
  }

  function rowFor(appointment) {
    const slot = slotById(appointment.slotId)
    const doctor = userById(slot.doctorId)
    const patient = userById(appointment.patientId)
    const replacement = appointments.find(item => item.rescheduledFromId === appointment.id)
    const consultation = consultations.find(item => item.appointmentId === appointment.id)

    return {
      id: appointment.id,
      patient_id: appointment.patientId,
      slot_id: appointment.slotId,
      rescheduled_from_appointment_id: appointment.rescheduledFromId ?? null,
      status: appointment.status,
      fee_snapshot: appointment.feeSnapshot,
      cancelled_by_user_id: appointment.cancelledByUserId ?? null,
      cancellation_reason: appointment.cancellationReason ?? null,
      cancelled_at: appointment.cancelledAt ?? null,
      ready_at: appointment.readyAt ?? null,
      room_opened_at: appointment.roomOpenedAt ?? null,
      no_show_marked_at: appointment.noShowMarkedAt ?? null,
      consultation_id: consultation?.id ?? null,
      consultation_started_at: consultation?.startedAt ?? null,
      consultation_finished_at: consultation?.finishedAt ?? null,
      created_at: appointment.createdAt,
      updated_at: appointment.updatedAt,
      patient_name: patient.fullName,
      doctor_id: doctor.id,
      doctor_name: doctor.fullName,
      start_at: slot.startAt,
      end_at: slot.endAt,
      specializations: doctors.get(doctor.id).specializations,
      replacement_appointment_id: replacement?.id ?? null,
    }
  }

  function makeAppointment(patientId, slot, rescheduledFromId = null) {
    const doctor = doctors.get(slot.doctorId)
    const timestamp = new Date(Date.now() + appointments.length).toISOString()
    const appointment = {
      id: nextAppointmentId++,
      patientId,
      slotId: slot.id,
      rescheduledFromId,
      status: 'booked',
      feeSnapshot: slot.effectiveFee ?? doctor.defaultFee,
      createdAt: timestamp,
      updatedAt: timestamp,
      readyAt: null,
      roomOpenedAt: null,
      noShowMarkedAt: null,
    }
    appointments.push(appointment)
    return appointment
  }

  const repository = {
    async book({ patientId, patientName, slotId }) {
      const slot = slotById(slotId)
      if (!slotAvailable(slot)) throw new AppointmentDataError('SLOT_UNAVAILABLE')

      const appointment = makeAppointment(patientId, slot)
      addNotification(patientId, 'appointment_booked', `Your appointment with ${userById(slot.doctorId).fullName} is confirmed.`, appointment.id)
      addNotification(slot.doctorId, 'appointment_booked', `A new appointment was booked by ${patientName}.`, appointment.id)
      return rowFor(appointment)
    },

    async listForPatient(patientId) {
      return appointments.filter(item => item.patientId === patientId).map(rowFor)
    },

    async listForDoctor(doctorId) {
      return appointments.filter(item => slotById(item.slotId).doctorId === doctorId).map(rowFor)
    },

    async findById(appointmentId) {
      const appointment = appointments.find(item => item.id === Number(appointmentId))
      return appointment ? rowFor(appointment) : null
    },

    async cancel({ appointmentId, actorId, actorRole, reason, now = new Date() }) {
      const appointment = appointments.find(item => item.id === Number(appointmentId))
      if (!appointment) throw new AppointmentDataError('APPOINTMENT_NOT_FOUND')
      const slot = slotById(appointment.slotId)
      const owns = actorRole === 'patient' && appointment.patientId === actorId
      const assigned = actorRole === 'doctor' && slot.doctorId === actorId
      if (!owns && !assigned) throw new AppointmentDataError('APPOINTMENT_ACCESS_DENIED')
      const consultation = consultations.find(item => item.appointmentId === appointment.id)
      const patientCutoff = new Date(new Date(slot.startAt).getTime() + 15 * 60 * 1000)
      const withinActorWindow = actorRole === 'doctor' || new Date(now) < patientCutoff
      if (appointment.status !== 'booked' || consultation || !withinActorWindow) {
        throw new AppointmentDataError('APPOINTMENT_NOT_CANCELLABLE')
      }

      appointment.status = 'cancelled'
      appointment.cancelledByUserId = actorId
      appointment.cancellationReason = reason ?? null
      appointment.cancelledAt = new Date().toISOString()
      appointment.updatedAt = appointment.cancelledAt
      if (actorRole === 'doctor') {
        slot.active = false
        addNotification(appointment.patientId, 'appointment_cancelled', `${userById(actorId).fullName} cancelled your appointment: ${reason}`, appointment.id)
      } else {
        addNotification(slot.doctorId, 'appointment_cancelled', `${userById(actorId).fullName} cancelled their appointment.`, appointment.id)
      }
      return rowFor(appointment)
    },

    async reschedule({ appointmentId, patientId, slotId, now = new Date() }) {
      const original = appointments.find(item => item.id === Number(appointmentId))
      if (!original) throw new AppointmentDataError('APPOINTMENT_NOT_FOUND')
      if (original.patientId !== patientId) throw new AppointmentDataError('APPOINTMENT_ACCESS_DENIED')
      const originalStart = new Date(slotById(original.slotId).startAt)
      const cutoff = new Date(originalStart.getTime() + 15 * 60 * 1000)
      if (original.status !== 'booked' || consultations.some(item => item.appointmentId === original.id) || new Date(now) >= cutoff) {
        throw new AppointmentDataError('APPOINTMENT_NOT_RESCHEDULABLE')
      }
      if (original.slotId === slotId) throw new AppointmentDataError('SAME_SLOT')

      const newSlot = slotById(slotId)
      if (!slotAvailable(newSlot)) throw new AppointmentDataError('SLOT_UNAVAILABLE')

      original.status = 'rescheduled'
      original.updatedAt = new Date().toISOString()
      const replacement = makeAppointment(patientId, newSlot, original.id)
      addNotification(patientId, 'appointment_rescheduled', `Your appointment was rescheduled with ${userById(newSlot.doctorId).fullName}.`, replacement.id)
      addNotification(slotById(original.slotId).doctorId, 'appointment_rescheduled', `${userById(patientId).fullName} rescheduled their appointment.`, original.id)
      return rowFor(replacement)
    },

    async markReady({ appointmentId, patientId, now }) {
      const appointment = appointments.find(item => item.id === Number(appointmentId))
      if (!appointment) throw new AppointmentDataError('APPOINTMENT_NOT_FOUND')
      if (appointment.patientId !== patientId) throw new AppointmentDataError('APPOINTMENT_ACCESS_DENIED')
      const slot = slotById(appointment.slotId)
      const opensAt = new Date(new Date(slot.startAt).getTime() - 15 * 60 * 1000)
      if (appointment.status !== 'booked' || consultations.some(item => item.appointmentId === appointment.id) || new Date(now) < opensAt || new Date(now) >= new Date(slot.endAt)) {
        throw new AppointmentDataError('APPOINTMENT_NOT_READYABLE')
      }
      appointment.readyAt ??= new Date(now).toISOString()
      appointment.updatedAt = new Date(now).toISOString()
      return rowFor(appointment)
    },

    async openRoom({ appointmentId, doctorId, now }) {
      const appointment = appointments.find(item => item.id === Number(appointmentId))
      if (!appointment) throw new AppointmentDataError('APPOINTMENT_NOT_FOUND')
      const slot = slotById(appointment.slotId)
      if (slot.doctorId !== doctorId) throw new AppointmentDataError('APPOINTMENT_ACCESS_DENIED')
      const opensAt = new Date(new Date(slot.startAt).getTime() - 5 * 60 * 1000)
      if (appointment.status !== 'booked' || consultations.some(item => item.appointmentId === appointment.id) || new Date(now) < opensAt || new Date(now) >= new Date(slot.endAt)) {
        throw new AppointmentDataError('ROOM_NOT_OPENABLE')
      }
      appointment.roomOpenedAt ??= new Date(now).toISOString()
      appointment.updatedAt = new Date(now).toISOString()
      return rowFor(appointment)
    },

    async beginConsultation({ appointmentId, doctorId, now }) {
      const appointment = appointments.find(item => item.id === Number(appointmentId))
      if (!appointment) throw new AppointmentDataError('APPOINTMENT_NOT_FOUND')
      const slot = slotById(appointment.slotId)
      if (slot.doctorId !== doctorId) throw new AppointmentDataError('APPOINTMENT_ACCESS_DENIED')
      const existing = consultations.find(item => item.appointmentId === appointment.id)
      if (appointment.status === 'booked' && existing && !existing.finishedAt) return rowFor(appointment)
      const opensAt = new Date(new Date(slot.startAt).getTime() - 5 * 60 * 1000)
      if (appointment.status !== 'booked' || existing || !appointment.roomOpenedAt || new Date(now) < opensAt || new Date(now) >= new Date(slot.endAt)) {
        throw new AppointmentDataError('CONSULTATION_NOT_BEGINNABLE')
      }
      consultations.push({ id: 9000 + consultations.length, appointmentId: appointment.id, startedAt: new Date(now).toISOString(), finishedAt: null })
      return rowFor(appointment)
    },

    async markNoShow({ appointmentId, doctorId, now }) {
      const appointment = appointments.find(item => item.id === Number(appointmentId))
      if (!appointment) throw new AppointmentDataError('APPOINTMENT_NOT_FOUND')
      const slot = slotById(appointment.slotId)
      if (slot.doctorId !== doctorId) throw new AppointmentDataError('APPOINTMENT_ACCESS_DENIED')
      const availableAt = new Date(new Date(slot.startAt).getTime() + 15 * 60 * 1000)
      if (appointment.status !== 'booked' || consultations.some(item => item.appointmentId === appointment.id) || new Date(now) < availableAt) {
        throw new AppointmentDataError('APPOINTMENT_NOT_NO_SHOWABLE')
      }
      appointment.status = 'no_show'
      appointment.noShowMarkedAt = new Date(now).toISOString()
      appointment.updatedAt = appointment.noShowMarkedAt
      addNotification(appointment.patientId, 'appointment_no_show', `You were marked as not attending your consultation with ${userById(slot.doctorId).fullName} on ${new Date(slot.startAt).toISOString()}.`, appointment.id)
      return rowFor(appointment)
    },

    async finishConsultation({ appointmentId, doctorId, now }) {
      const appointment = appointments.find(item => item.id === Number(appointmentId))
      if (!appointment) throw new AppointmentDataError('APPOINTMENT_NOT_FOUND')
      const slot = slotById(appointment.slotId)
      if (slot.doctorId !== doctorId) throw new AppointmentDataError('APPOINTMENT_ACCESS_DENIED')
      const consultation = consultations.find(item => item.appointmentId === appointment.id)
      if (appointment.status === 'completed' && consultation?.finishedAt) return rowFor(appointment)
      if (appointment.status !== 'booked' || !consultation || consultation.finishedAt) throw new AppointmentDataError('CONSULTATION_NOT_FINISHABLE')
      consultation.finishedAt = new Date(now).toISOString()
      appointment.status = 'completed'
      appointment.updatedAt = consultation.finishedAt
      return rowFor(appointment)
    },

    async authorizeVideoSession({ appointmentId, userId, userRole, now }) {
      const appointment = appointments.find(item => item.id === Number(appointmentId))
      if (!appointment) throw new AppointmentDataError('APPOINTMENT_NOT_FOUND')
      const slot = slotById(appointment.slotId)
      const owns = userRole === 'patient' && appointment.patientId === userId
      const assigned = userRole === 'doctor' && slot.doctorId === userId
      if (!owns && !assigned) throw new AppointmentDataError('APPOINTMENT_ACCESS_DENIED')
      const consultation = consultations.find(item => item.appointmentId === appointment.id)
      if (appointment.status !== 'booked' || consultation?.finishedAt) {
        throw new AppointmentDataError('VIDEO_SESSION_UNAVAILABLE')
      }
      if (consultation) return { appointmentId: appointment.id }

      const doctorWindowOpensAt = new Date(new Date(slot.startAt).getTime() - 5 * 60 * 1000)
      const withinUnstartedWindow = Boolean(appointment.roomOpenedAt)
        && new Date(now) < new Date(slot.endAt)
        && (userRole === 'patient' || new Date(now) >= doctorWindowOpensAt)
      if (!withinUnstartedWindow) throw new AppointmentDataError('VIDEO_SESSION_UNAVAILABLE')
      return { appointmentId: appointment.id }
    },
  }

  const notificationRepository = {
    async listForUser(userId, { limit, offset }) {
      const owned = notifications
        .filter(item => item.recipient_user_id === userId)
        .sort((left, right) => right.id - left.id)
      return {
        rows: owned.slice(offset, offset + limit),
        total: owned.length,
        unreadCount: owned.filter(item => !item.is_read).length,
      }
    },
    async markRead(userId, notificationId) {
      const notification = notifications.find(item => item.id === notificationId && item.recipient_user_id === userId)
      if (!notification) return null
      notification.is_read = true
      return notification
    },
  }

  const auth = {
    async authenticate(email, password) {
      const user = users.find(item => item.email === email)
      if (!user || password !== 'test-password') {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect')
      }
      if (!user.isEnabled) throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is disabled')
      return { ...user }
    },
    async getSessionUser(userId) {
      const user = userById(userId)
      return user ? { ...user } : null
    },
  }

  const publicDoctors = {
    async search() {
      return { items: [], limit: 10, offset: 0, total: 0 }
    },
    async getById(doctorId) {
      const user = userById(doctorId)
      if (!user || !doctorAvailable(doctorId)) throw new AppError(404, 'DOCTOR_NOT_FOUND', 'Doctor not found')
      const doctor = doctors.get(doctorId)
      const availableSlots = slots
        .filter(slot => slot.doctorId === doctorId && slotAvailable(slot))
        .sort((left, right) => new Date(left.startAt) - new Date(right.startAt))
      return {
        id: doctorId,
        fullName: user.fullName,
        verified: true,
        qualification: 'MBBS, MD',
        experienceYears: 12,
        bio: 'Provides careful, evidence-based remote consultations with clear next steps for every Patient.',
        clinic: { name: 'MedReach Care Clinic', city: 'Kolkata', district: 'Kolkata' },
        defaultFee: doctor.defaultFee,
        specializations: doctor.specializations,
        nextAvailableAt: availableSlots[0]?.startAt ?? null,
      }
    },
    async getSlots(doctorId, date) {
      return {
        doctorId,
        date,
        items: slots
          .filter(slot => slot.doctorId === doctorId && indiaDate(slot.startAt) === date && slotAvailable(slot))
          .map(slot => ({ id: slot.id, startAt: slot.startAt, endAt: slot.endAt, fee: slot.effectiveFee ?? doctors.get(doctorId).defaultFee })),
      }
    },
  }

  return {
    users,
    slots,
    appointments,
    notifications,
    consultations,
    repository,
    services: {
      auth,
      appointments: createAppointmentService(repository, clock, tokenService),
      notifications: createNotificationService(notificationRepository),
      doctors: publicDoctors,
    },
    indiaDate,
  }
}
