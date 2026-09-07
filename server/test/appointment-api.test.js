import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { JaasConfigurationError } from '../src/services/jaas-token.service.js'
import { createBookingTestContext } from './support/booking-test-context.js'

async function login(app, email) {
  const agent = request.agent(app)
  const response = await agent.post('/api/auth/login').send({ email, password: 'test-password' })
  expect(response.status).toBe(200)
  return agent
}

describe('appointment booking API', () => {
  let context
  let app

  beforeEach(() => {
    context = createBookingTestContext()
    app = createApp(context.services)
  })

  it('lets a Patient book an available slot and snapshots its effective fee', async () => {
    const patient = await login(app, 'patient@example.test')
    const response = await patient.post('/api/appointments').send({ slotId: 101 })

    expect(response.status).toBe(201)
    expect(response.body.appointment).toMatchObject({
      status: 'booked',
      feeSnapshot: 700,
      patient: { id: 1, fullName: 'Ananya Rao' },
      doctor: { id: 10, fullName: 'Dr. Aditi Sharma' },
      slot: { id: 101 },
    })
  })

  it('uses the doctor default fee when a block has no effective fee', async () => {
    const patient = await login(app, 'patient@example.test')
    const response = await patient.post('/api/appointments').send({ slotId: 102 })

    expect(response.status).toBe(201)
    expect(response.body.appointment.feeSnapshot).toBe(650)
  })

  it('requires authentication to book', async () => {
    const response = await request(app).post('/api/appointments').send({ slotId: 101 })

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED')
  })

  it('forbids Doctor and Admin accounts from booking', async () => {
    const doctor = await login(app, 'doctor@example.test')
    const admin = await login(app, 'admin@example.test')
    const doctorResponse = await doctor.post('/api/appointments').send({ slotId: 101 })
    const adminResponse = await admin.post('/api/appointments').send({ slotId: 101 })

    expect(doctorResponse.status).toBe(403)
    expect(adminResponse.status).toBe(403)
    expect(context.appointments).toHaveLength(0)
  })

  it('rejects a disabled Patient session before booking', async () => {
    const patient = await login(app, 'patient@example.test')
    context.users.find(user => user.id === 1).isEnabled = false
    const response = await patient.post('/api/appointments').send({ slotId: 101 })

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('ACCOUNT_DISABLED')
    expect(context.appointments).toHaveLength(0)
  })

  it.each([
    [103, 'inactive'],
    [104, 'past'],
    [105, 'unapproved doctor'],
    [106, 'disabled doctor'],
  ])('returns the locked slot conflict for an %s (%s) slot', async slotId => {
    const patient = await login(app, 'patient@example.test')
    const response = await patient.post('/api/appointments').send({ slotId })

    expect(response.status).toBe(409)
    expect(response.body.error).toEqual({
      code: 'SLOT_UNAVAILABLE',
      message: 'Slot is no longer available.',
    })
  })

  it('allows only one of two concurrent booking attempts to own a slot', async () => {
    const patient = await login(app, 'patient@example.test')
    const otherPatient = await login(app, 'other-patient@example.test')
    const responses = await Promise.all([
      patient.post('/api/appointments').send({ slotId: 101 }),
      otherPatient.post('/api/appointments').send({ slotId: 101 }),
    ])

    expect(responses.map(response => response.status).sort()).toEqual([201, 409])
    expect(context.appointments.filter(item => item.slotId === 101 && item.status === 'booked')).toHaveLength(1)
  })

  it('removes a booked slot from public availability', async () => {
    const patient = await login(app, 'patient@example.test')
    const date = context.indiaDate(context.slots.find(slot => slot.id === 101).startAt)
    const before = await request(app).get(`/api/doctors/10/slots?date=${date}`)
    await patient.post('/api/appointments').send({ slotId: 101 })
    const after = await request(app).get(`/api/doctors/10/slots?date=${date}`)

    expect(before.body.items.map(item => item.id)).toContain(101)
    expect(after.body.items.map(item => item.id)).not.toContain(101)
    expect(context.slots.find(slot => slot.id === 101).active).toBe(true)
  })

  it('lists only the signed-in Patient appointments in upcoming order', async () => {
    const patient = await login(app, 'patient@example.test')
    const otherPatient = await login(app, 'other-patient@example.test')
    await patient.post('/api/appointments').send({ slotId: 102 })
    await patient.post('/api/appointments').send({ slotId: 101 })
    await otherPatient.post('/api/appointments').send({ slotId: 107 })
    const response = await patient.get('/api/appointments/me')

    expect(response.status).toBe(200)
    expect(response.body.upcoming.map(item => item.slot.id)).toEqual([101, 102])
    expect(response.body.upcoming.every(item => item.patient.id === 1)).toBe(true)
  })

  it('lists only appointments assigned to the signed-in Doctor', async () => {
    const patient = await login(app, 'patient@example.test')
    const otherPatient = await login(app, 'other-patient@example.test')
    const doctor = await login(app, 'doctor@example.test')
    await patient.post('/api/appointments').send({ slotId: 101 })
    await otherPatient.post('/api/appointments').send({ slotId: 107 })
    const response = await doctor.get('/api/doctors/me/appointments')

    expect(response.status).toBe(200)
    expect(response.body.upcoming).toHaveLength(1)
    expect(response.body.upcoming[0].doctor.id).toBe(10)
    expect(response.body.upcoming[0].patient.fullName).toBe('Ananya Rao')
  })

  it('forbids an unrelated Patient and Doctor from appointment detail', async () => {
    const patient = await login(app, 'patient@example.test')
    const otherPatient = await login(app, 'other-patient@example.test')
    const otherDoctor = await login(app, 'other-doctor@example.test')
    const booking = await patient.post('/api/appointments').send({ slotId: 101 })
    const appointmentId = booking.body.appointment.id

    expect((await otherPatient.get(`/api/appointments/${appointmentId}`)).status).toBe(403)
    expect((await otherDoctor.get(`/api/appointments/${appointmentId}`)).status).toBe(403)
  })

  it('allows the Patient owner and assigned Doctor to see safe appointment detail', async () => {
    const patient = await login(app, 'patient@example.test')
    const doctor = await login(app, 'doctor@example.test')
    const booking = await patient.post('/api/appointments').send({ slotId: 101 })
    const appointmentId = booking.body.appointment.id
    const patientDetail = await patient.get(`/api/appointments/${appointmentId}`)
    const doctorDetail = await doctor.get(`/api/appointments/${appointmentId}`)

    expect(patientDetail.status).toBe(200)
    expect(doctorDetail.status).toBe(200)
    expect(doctorDetail.body.appointment.patient).toEqual({ id: 1, fullName: 'Ananya Rao' })
    expect(doctorDetail.body.appointment).not.toHaveProperty('passwordHash')
  })

  it('Patient cancellation returns an active future slot to public availability', async () => {
    const patient = await login(app, 'patient@example.test')
    const booking = await patient.post('/api/appointments').send({ slotId: 101 })
    const response = await patient.post(`/api/appointments/${booking.body.appointment.id}/cancel`).send({})
    const date = context.indiaDate(context.slots.find(slot => slot.id === 101).startAt)
    const publicSlots = await request(app).get(`/api/doctors/10/slots?date=${date}`)

    expect(response.status).toBe(200)
    expect(response.body.appointment.status).toBe('cancelled')
    expect(context.slots.find(slot => slot.id === 101).active).toBe(true)
    expect(publicSlots.body.items.map(item => item.id)).toContain(101)
  })

  it('requires a Doctor cancellation reason without changing the appointment', async () => {
    const patient = await login(app, 'patient@example.test')
    const doctor = await login(app, 'doctor@example.test')
    const booking = await patient.post('/api/appointments').send({ slotId: 101 })
    const response = await doctor.post(`/api/appointments/${booking.body.appointment.id}/cancel`).send({})

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('CANCELLATION_REASON_REQUIRED')
    expect(context.appointments[0].status).toBe('booked')
  })

  it('Doctor cancellation deactivates the slot and notifies the Patient', async () => {
    const patient = await login(app, 'patient@example.test')
    const doctor = await login(app, 'doctor@example.test')
    const booking = await patient.post('/api/appointments').send({ slotId: 101 })
    const response = await doctor
      .post(`/api/appointments/${booking.body.appointment.id}/cancel`)
      .send({ reason: 'Unavailable due to an emergency' })

    expect(response.status).toBe(200)
    expect(context.slots.find(slot => slot.id === 101).active).toBe(false)
    expect(context.notifications.some(item => item.recipient_user_id === 1 && item.type === 'appointment_cancelled')).toBe(true)
  })

  it('moves cancelled appointments into Patient history', async () => {
    const patient = await login(app, 'patient@example.test')
    const booking = await patient.post('/api/appointments').send({ slotId: 101 })
    await patient.post(`/api/appointments/${booking.body.appointment.id}/cancel`).send({ reason: 'Plans changed' })
    const response = await patient.get('/api/appointments/me')

    expect(response.body.upcoming).toHaveLength(0)
    expect(response.body.history[0].status).toBe('cancelled')
  })

  it('reschedules atomically into a linked new appointment', async () => {
    const patient = await login(app, 'patient@example.test')
    const booking = await patient.post('/api/appointments').send({ slotId: 101 })
    const originalId = booking.body.appointment.id
    const response = await patient
      .post(`/api/appointments/${originalId}/reschedule`)
      .send({ slotId: 102 })

    expect(response.status).toBe(200)
    expect(response.body.appointment).toMatchObject({
      status: 'booked',
      rescheduledFromAppointmentId: originalId,
      slot: { id: 102 },
    })
    expect(context.appointments.find(item => item.id === originalId).status).toBe('rescheduled')
    expect(context.appointments).toHaveLength(2)
  })

  it('rejects the same slot during rescheduling', async () => {
    const patient = await login(app, 'patient@example.test')
    const booking = await patient.post('/api/appointments').send({ slotId: 101 })
    const response = await patient
      .post(`/api/appointments/${booking.body.appointment.id}/reschedule`)
      .send({ slotId: 101 })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('SAME_SLOT')
    expect(context.appointments[0].status).toBe('booked')
  })

  it('leaves the original appointment booked when rescheduling fails', async () => {
    const patient = await login(app, 'patient@example.test')
    const booking = await patient.post('/api/appointments').send({ slotId: 101 })
    const response = await patient
      .post(`/api/appointments/${booking.body.appointment.id}/reschedule`)
      .send({ slotId: 103 })

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('SLOT_UNAVAILABLE')
    expect(context.appointments).toHaveLength(1)
    expect(context.appointments[0].status).toBe('booked')
  })

  it('creates stored Patient and Doctor notification snapshots when booking', async () => {
    const patient = await login(app, 'patient@example.test')
    await patient.post('/api/appointments').send({ slotId: 101 })

    expect(context.notifications).toHaveLength(2)
    expect(context.notifications.map(item => item.recipient_user_id).sort()).toEqual([1, 10])
    expect(context.notifications.every(item => item.action_path.startsWith('/appointments/'))).toBe(true)
  })

  it('returns owned notifications newest first with pagination and unread count', async () => {
    const patient = await login(app, 'patient@example.test')
    const booking = await patient.post('/api/appointments').send({ slotId: 101 })
    await patient.post(`/api/appointments/${booking.body.appointment.id}/cancel`).send({ reason: 'No longer needed' })
    const response = await patient.get('/api/notifications?limit=1&offset=0')

    expect(response.status).toBe(200)
    expect(response.body.items).toHaveLength(1)
    expect(response.body.total).toBeGreaterThanOrEqual(1)
    expect(response.body.unreadCount).toBeGreaterThanOrEqual(1)
  })

  it('enforces notification ownership when marking read', async () => {
    const patient = await login(app, 'patient@example.test')
    const doctor = await login(app, 'doctor@example.test')
    await patient.post('/api/appointments').send({ slotId: 101 })
    const patientNotification = context.notifications.find(item => item.recipient_user_id === 1)
    const forbidden = await doctor.patch(`/api/notifications/${patientNotification.id}/read`)
    const allowed = await patient.patch(`/api/notifications/${patientNotification.id}/read`)

    expect(forbidden.status).toBe(404)
    expect(allowed.status).toBe(200)
    expect(allowed.body.notification.isRead).toBe(true)
  })

  it('requires authentication for notifications', async () => {
    expect((await request(app).get('/api/notifications')).status).toBe(401)
    expect((await request(app).patch('/api/notifications/5000/read')).status).toBe(401)
  })
})

describe('consultation lifecycle API', () => {
  let context
  let app
  let patient
  let otherPatient
  let doctor
  let otherDoctor
  let admin
  let appointmentId
  let startAt
  let endAt
  let currentTime

  beforeEach(async () => {
    currentTime = new Date('2030-01-01T00:00:00.000Z')
    context = createBookingTestContext({ clock: () => currentTime })
    const lifecycleSlot = context.slots.find(item => item.id === 101)
    lifecycleSlot.startAt = new Date(currentTime.getTime() + 60 * 60 * 1000).toISOString()
    lifecycleSlot.endAt = new Date(currentTime.getTime() + 90 * 60 * 1000).toISOString()
    app = createApp(context.services)
    patient = await login(app, 'patient@example.test')
    otherPatient = await login(app, 'other-patient@example.test')
    doctor = await login(app, 'doctor@example.test')
    otherDoctor = await login(app, 'other-doctor@example.test')
    admin = await login(app, 'admin@example.test')
    const booking = await patient.post('/api/appointments').send({ slotId: 101 })
    appointmentId = booking.body.appointment.id
    const slot = context.slots.find(item => item.id === 101)
    startAt = new Date(slot.startAt)
    endAt = new Date(slot.endAt)
  })

  function atMinutesFromStart(minutes) {
    currentTime = new Date(startAt.getTime() + minutes * 60 * 1000)
  }

  async function openAndBegin() {
    atMinutesFromStart(-5)
    expect((await doctor.post(`/api/appointments/${appointmentId}/open-room`)).status).toBe(200)
    return doctor.post(`/api/appointments/${appointmentId}/begin-consultation`)
  }

  it('rejects Ready before T-15 and allows it exactly at T-15', async () => {
    atMinutesFromStart(-15 - 1 / 60)
    expect((await patient.post(`/api/appointments/${appointmentId}/ready`)).status).toBe(409)
    atMinutesFromStart(-15)
    const response = await patient.post(`/api/appointments/${appointmentId}/ready`)
    expect(response.status).toBe(200)
    expect(response.body.appointment.status).toBe('booked')
    expect(response.body.appointment.consultationFlow.readyAt).toBe(currentTime.toISOString())
  })

  it('preserves the first Ready timestamp across repeated calls', async () => {
    atMinutesFromStart(-15)
    const first = await patient.post(`/api/appointments/${appointmentId}/ready`)
    atMinutesFromStart(-10)
    const repeated = await patient.post(`/api/appointments/${appointmentId}/ready`)
    expect(repeated.status).toBe(200)
    expect(repeated.body.appointment.consultationFlow.readyAt).toBe(first.body.appointment.consultationFlow.readyAt)
  })

  it('forbids another Patient from marking Ready', async () => {
    atMinutesFromStart(-15)
    const response = await otherPatient.post(`/api/appointments/${appointmentId}/ready`)
    expect(response.status).toBe(403)
  })

  it.each(['cancelled', 'rescheduled', 'no_show'])('rejects Ready for a %s appointment', async status => {
    context.appointments[0].status = status
    atMinutesFromStart(-15)
    expect((await patient.post(`/api/appointments/${appointmentId}/ready`)).status).toBe(409)
  })

  it('rejects Ready after consultation begins and at slot end', async () => {
    await openAndBegin()
    expect((await patient.post(`/api/appointments/${appointmentId}/ready`)).status).toBe(409)

    context.consultations.length = 0
    context.appointments[0].roomOpenedAt = null
    currentTime = endAt
    expect((await patient.post(`/api/appointments/${appointmentId}/ready`)).status).toBe(409)
  })

  it('rejects Open Room before T-5 and allows it exactly at T-5 without Ready', async () => {
    atMinutesFromStart(-5 - 1 / 60)
    expect((await doctor.post(`/api/appointments/${appointmentId}/open-room`)).status).toBe(409)
    atMinutesFromStart(-5)
    const response = await doctor.post(`/api/appointments/${appointmentId}/open-room`)
    expect(response.status).toBe(200)
    expect(response.body.appointment.status).toBe('booked')
    expect(response.body.appointment.consultationFlow.readyAt).toBeNull()
    expect(response.body.appointment.consultationFlow.roomOpenedAt).toBe(currentTime.toISOString())
    expect(context.consultations).toHaveLength(0)
  })

  it('makes Open Room idempotent and assigned-doctor-only', async () => {
    atMinutesFromStart(-5)
    const first = await doctor.post(`/api/appointments/${appointmentId}/open-room`)
    atMinutesFromStart(0)
    const repeated = await doctor.post(`/api/appointments/${appointmentId}/open-room`)
    const forbidden = await otherDoctor.post(`/api/appointments/${appointmentId}/open-room`)
    expect(repeated.body.appointment.consultationFlow.roomOpenedAt).toBe(first.body.appointment.consultationFlow.roomOpenedAt)
    expect(forbidden.status).toBe(403)
  })

  it.each(['cancelled', 'rescheduled', 'no_show'])('rejects Open Room for a %s appointment', async status => {
    context.appointments[0].status = status
    atMinutesFromStart(-5)
    expect((await doctor.post(`/api/appointments/${appointmentId}/open-room`)).status).toBe(409)
  })

  it('rejects Open Room after consultation begins and at slot end', async () => {
    await openAndBegin()
    expect((await doctor.post(`/api/appointments/${appointmentId}/open-room`)).status).toBe(409)
    context.consultations.length = 0
    currentTime = endAt
    expect((await doctor.post(`/api/appointments/${appointmentId}/open-room`)).status).toBe(409)
  })

  it('requires the room and timing before Begin Consultation', async () => {
    atMinutesFromStart(-6)
    expect((await doctor.post(`/api/appointments/${appointmentId}/begin-consultation`)).status).toBe(409)
    atMinutesFromStart(-5)
    expect((await doctor.post(`/api/appointments/${appointmentId}/begin-consultation`)).status).toBe(409)
    await doctor.post(`/api/appointments/${appointmentId}/open-room`)
    const response = await doctor.post(`/api/appointments/${appointmentId}/begin-consultation`)
    expect(response.status).toBe(200)
    expect(response.body.appointment.status).toBe('booked')
    expect(response.body.appointment.consultationFlow.consultationId).toBeTruthy()
  })

  it('does not require Ready and creates only one Consultation on duplicate Begin', async () => {
    const first = await openAndBegin()
    const repeated = await doctor.post(`/api/appointments/${appointmentId}/begin-consultation`)
    expect(first.status).toBe(200)
    expect(first.body.appointment.consultationFlow.readyAt).toBeNull()
    expect(repeated.status).toBe(200)
    expect(repeated.body.appointment.consultationFlow.consultationId).toBe(first.body.appointment.consultationFlow.consultationId)
    expect(context.consultations).toHaveLength(1)
  })

  it('forbids the wrong doctor from Begin Consultation', async () => {
    atMinutesFromStart(-5)
    await doctor.post(`/api/appointments/${appointmentId}/open-room`)
    expect((await otherDoctor.post(`/api/appointments/${appointmentId}/begin-consultation`)).status).toBe(403)
  })

  it.each(['cancelled', 'rescheduled', 'no_show'])('rejects Begin Consultation for a %s appointment', async status => {
    context.appointments[0].status = status
    context.appointments[0].roomOpenedAt = startAt.toISOString()
    atMinutesFromStart(-5)
    expect((await doctor.post(`/api/appointments/${appointmentId}/begin-consultation`)).status).toBe(409)
  })

  it('rejects first Begin at slot end', async () => {
    context.appointments[0].roomOpenedAt = new Date(startAt.getTime() - 5 * 60 * 1000).toISOString()
    currentTime = endAt
    expect((await doctor.post(`/api/appointments/${appointmentId}/begin-consultation`)).status).toBe(409)
  })

  it('rejects no-show before T+15 and allows it exactly at T+15 even when Ready', async () => {
    atMinutesFromStart(-15)
    await patient.post(`/api/appointments/${appointmentId}/ready`)
    atMinutesFromStart(15 - 1 / 60)
    expect((await doctor.post(`/api/appointments/${appointmentId}/no-show`)).status).toBe(409)
    atMinutesFromStart(15)
    const response = await doctor.post(`/api/appointments/${appointmentId}/no-show`)
    expect(response.status).toBe(200)
    expect(response.body.appointment.status).toBe('no_show')
    expect(context.appointments[0].noShowMarkedAt).toBe(currentTime.toISOString())
    expect(context.consultations).toHaveLength(0)
  })

  it('notifies the Patient once and rejects repeated no-show', async () => {
    atMinutesFromStart(15)
    expect((await doctor.post(`/api/appointments/${appointmentId}/no-show`)).status).toBe(200)
    expect((await doctor.post(`/api/appointments/${appointmentId}/no-show`)).status).toBe(409)
    const notifications = context.notifications.filter(item => item.type === 'appointment_no_show')
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({ recipient_user_id: 1, action_path: `/appointments/${appointmentId}` })
    expect(notifications[0].message).toContain('Dr. Aditi Sharma')
  })

  it('allows assigned-doctor no-show after slot end and for old unresolved bookings', async () => {
    const slot = context.slots.find(item => item.id === 101)
    slot.startAt = '2029-12-01T09:00:00.000Z'
    slot.endAt = '2029-12-01T09:30:00.000Z'
    expect((await doctor.post(`/api/appointments/${appointmentId}/no-show`)).status).toBe(200)
  })

  it('forbids wrong-role, admin, wrong-doctor, and begun-consultation no-show', async () => {
    atMinutesFromStart(15)
    expect((await patient.post(`/api/appointments/${appointmentId}/no-show`)).status).toBe(403)
    expect((await admin.post(`/api/appointments/${appointmentId}/no-show`)).status).toBe(403)
    expect((await otherDoctor.post(`/api/appointments/${appointmentId}/no-show`)).status).toBe(403)
    atMinutesFromStart(-5)
    await openAndBegin()
    atMinutesFromStart(15)
    expect((await doctor.post(`/api/appointments/${appointmentId}/no-show`)).status).toBe(409)
  })

  it.each([
    [14 + 59 / 60, 200],
    [15, 409],
    [16, 409],
  ])('applies the Patient cancel cutoff at T+%s minutes', async (minutes, expectedStatus) => {
    atMinutesFromStart(minutes)
    const response = await patient.post(`/api/appointments/${appointmentId}/cancel`).send({})
    expect(response.status).toBe(expectedStatus)
  })

  it.each([
    [14 + 59 / 60, 200],
    [15, 409],
    [16, 409],
  ])('applies the Patient reschedule cutoff at T+%s minutes', async (minutes, expectedStatus) => {
    atMinutesFromStart(minutes)
    const response = await patient.post(`/api/appointments/${appointmentId}/reschedule`).send({ slotId: 102 })
    expect(response.status).toBe(expectedStatus)
    if (expectedStatus === 409) {
      expect(context.appointments).toHaveLength(1)
      expect(context.appointments[0].status).toBe('booked')
    }
  })

  it('blocks Patient cancel/reschedule and Doctor cancellation once consultation begins', async () => {
    await openAndBegin()
    expect((await patient.post(`/api/appointments/${appointmentId}/cancel`).send({})).status).toBe(409)
    expect((await patient.post(`/api/appointments/${appointmentId}/reschedule`).send({ slotId: 102 })).status).toBe(409)
    expect((await doctor.post(`/api/appointments/${appointmentId}/cancel`).send({ reason: 'Emergency' })).status).toBe(409)
  })

  it.each([
    ['before T', -1],
    ['after T', 1],
    ['after T+15', 16],
    ['after slot end', 31],
  ])('allows assigned Doctor cancellation %s while the booking is unresolved', async (_label, minutes) => {
    atMinutesFromStart(minutes)
    const detail = await doctor.get(`/api/appointments/${appointmentId}`)
    expect(detail.body.appointment.consultationFlow.canCancel).toBe(true)
    const response = await doctor.post(`/api/appointments/${appointmentId}/cancel`).send({ reason: 'Emergency' })
    expect(response.status).toBe(200)
    expect(response.body.appointment.status).toBe('cancelled')
  })

  it('forbids the wrong Doctor from cancelling an unresolved booking', async () => {
    atMinutesFromStart(31)
    const response = await otherDoctor.post(`/api/appointments/${appointmentId}/cancel`).send({ reason: 'Emergency' })
    expect(response.status).toBe(403)
    expect(context.appointments[0].status).toBe('booked')
  })

  it('rejects Finish without a Consultation', async () => {
    atMinutesFromStart(-5)
    expect((await doctor.post(`/api/appointments/${appointmentId}/consultation/finish`).send({})).status).toBe(409)
  })

  it('forbids the wrong doctor from finishing a Consultation', async () => {
    await openAndBegin()
    expect((await otherDoctor.post(`/api/appointments/${appointmentId}/consultation/finish`).send({})).status).toBe(403)
  })

  it('atomically finishes the active Consultation and is idempotent', async () => {
    await openAndBegin()
    currentTime = new Date(endAt.getTime() + 60 * 60 * 1000)
    const first = await doctor.post(`/api/appointments/${appointmentId}/consultation/finish`).send({})
    const repeated = await doctor.post(`/api/appointments/${appointmentId}/consultation/finish`).send({})
    expect(first.status).toBe(200)
    expect(first.body.appointment.status).toBe('completed')
    expect(first.body.appointment.consultationFlow.consultationFinishedAt).toBe(currentTime.toISOString())
    expect(repeated.status).toBe(200)
    expect(repeated.body.appointment.consultationFlow.consultationFinishedAt).toBe(first.body.appointment.consultationFlow.consultationFinishedAt)
    expect((await doctor.post(`/api/appointments/${appointmentId}/no-show`)).status).toBe(409)
    expect((await patient.post(`/api/appointments/${appointmentId}/cancel`).send({})).status).toBe(409)
    expect((await patient.post(`/api/appointments/${appointmentId}/reschedule`).send({ slotId: 102 })).status).toBe(409)
    const history = await patient.get('/api/appointments/me')
    expect(history.body.history.some(item => item.id === appointmentId && item.status === 'completed')).toBe(true)
  })

  it.each(['completed', 'no_show', 'cancelled', 'rescheduled'])('prevents Doctor cancellation of a %s appointment', async status => {
    context.appointments[0].status = status
    atMinutesFromStart(-1)
    const response = await doctor.post(`/api/appointments/${appointmentId}/cancel`).send({ reason: 'Emergency' })
    expect(response.status).toBe(409)
  })

  it('exposes role-derived flow data in detail and Doctor list responses', async () => {
    atMinutesFromStart(-5)
    await patient.post(`/api/appointments/${appointmentId}/ready`)
    await doctor.post(`/api/appointments/${appointmentId}/open-room`)
    const patientDetail = await patient.get(`/api/appointments/${appointmentId}`)
    const doctorDetail = await doctor.get(`/api/appointments/${appointmentId}`)
    const doctorList = await doctor.get('/api/doctors/me/appointments')
    expect(patientDetail.body.appointment.consultationFlow).toMatchObject({
      readyAt: expect.any(String),
      roomOpenedAt: expect.any(String),
      canMarkReady: true,
      canOpenRoom: false,
    })
    expect(doctorDetail.body.appointment.consultationFlow).toMatchObject({
      canMarkReady: false,
      canOpenRoom: true,
      canBeginConsultation: true,
      checkInOpensAt: expect.any(String),
      noShowAvailableAt: expect.any(String),
    })
    expect(doctorList.body.upcoming[0]).toMatchObject({
      patient: { id: 1, fullName: 'Ananya Rao' },
      consultationFlow: {
        readyAt: expect.any(String),
        roomOpenedAt: expect.any(String),
        consultationId: null,
      },
    })
  })

  it('requires authentication for every lifecycle action', async () => {
    const responses = await Promise.all(
      ['ready', 'open-room', 'begin-consultation', 'no-show', 'consultation/finish']
        .map(action => request(app).post(`/api/appointments/${appointmentId}/${action}`).send({})),
    )
    expect(responses.map(response => response.status)).toEqual([401, 401, 401, 401, 401])
  })

  it('enforces clinical roles with no Patient or Admin bypass', async () => {
    atMinutesFromStart(-5)
    const doctorActions = ['open-room', 'begin-consultation', 'no-show', 'consultation/finish']
    const responses = await Promise.all([
      ...doctorActions.map(action => patient.post(`/api/appointments/${appointmentId}/${action}`).send({})),
      ...doctorActions.map(action => admin.post(`/api/appointments/${appointmentId}/${action}`).send({})),
      doctor.post(`/api/appointments/${appointmentId}/ready`).send({}),
      admin.post(`/api/appointments/${appointmentId}/ready`).send({}),
    ])
    expect(responses.every(response => response.status === 403)).toBe(true)
  })

  it('returns 404 for a missing appointment after valid role authorization', async () => {
    atMinutesFromStart(-5)
    expect((await patient.post('/api/appointments/999999/ready').send({})).status).toBe(404)
    expect((await doctor.post('/api/appointments/999999/open-room').send({})).status).toBe(404)
  })
})

describe('appointment video-token API', () => {
  let context
  let app
  let patient
  let otherPatient
  let doctor
  let otherDoctor
  let admin
  let appointmentId
  let startAt
  let endAt
  let currentTime

  beforeEach(async () => {
    currentTime = new Date('2030-01-01T00:00:00.000Z')
    context = createBookingTestContext({ clock: () => currentTime })
    const slot = context.slots.find(item => item.id === 101)
    slot.startAt = new Date(currentTime.getTime() + 60 * 60 * 1000).toISOString()
    slot.endAt = new Date(currentTime.getTime() + 90 * 60 * 1000).toISOString()
    app = createApp(context.services)
    patient = await login(app, 'patient@example.test')
    otherPatient = await login(app, 'other-patient@example.test')
    doctor = await login(app, 'doctor@example.test')
    otherDoctor = await login(app, 'other-doctor@example.test')
    admin = await login(app, 'admin@example.test')
    const booking = await patient.post('/api/appointments').send({ slotId: 101 })
    appointmentId = booking.body.appointment.id
    startAt = new Date(slot.startAt)
    endAt = new Date(slot.endAt)
  })

  function atMinutesFromStart(minutes) {
    currentTime = new Date(startAt.getTime() + minutes * 60 * 1000)
  }

  async function openRoom() {
    atMinutesFromStart(-5)
    expect((await doctor.post(`/api/appointments/${appointmentId}/open-room`)).status).toBe(200)
  }

  it('issues matching appointment-scoped sessions to the assigned Doctor and owning Patient without requiring Ready', async () => {
    await openRoom()
    const stateBefore = JSON.stringify({ appointments: context.appointments, consultations: context.consultations })
    const doctorSession = await doctor
      .post(`/api/appointments/${appointmentId}/video-token`)
      .send({ roomName: 'client-selected-room', moderator: false })
    const patientSession = await patient
      .post(`/api/appointments/${appointmentId}/video-token`)
      .send({ roomName: 'another-room', moderator: true })

    expect(doctorSession.status).toBe(200)
    expect(patientSession.status).toBe(200)
    expect(doctorSession.body).toMatchObject({
      domain: '8x8.vc',
      roomName: `test-app/medreach-appointment-${appointmentId}`,
      role: 'doctor',
    })
    expect(patientSession.body).toMatchObject({
      roomName: doctorSession.body.roomName,
      role: 'patient',
    })
    expect(context.appointments[0].readyAt).toBeNull()
    expect(JSON.stringify({ appointments: context.appointments, consultations: context.consultations })).toBe(stateBefore)
  })

  it('requires an opened room before issuing an unstarted Doctor or Patient session', async () => {
    atMinutesFromStart(-5)
    expect((await doctor.post(`/api/appointments/${appointmentId}/video-token`)).status).toBe(409)
    expect((await patient.post(`/api/appointments/${appointmentId}/video-token`)).status).toBe(409)
  })

  it('rejects anonymous, Admin, wrong-Patient, and wrong-Doctor requests', async () => {
    await openRoom()
    expect((await request(app).post(`/api/appointments/${appointmentId}/video-token`)).status).toBe(401)
    expect((await admin.post(`/api/appointments/${appointmentId}/video-token`)).status).toBe(403)
    expect((await otherPatient.post(`/api/appointments/${appointmentId}/video-token`)).status).toBe(403)
    expect((await otherDoctor.post(`/api/appointments/${appointmentId}/video-token`)).status).toBe(403)
  })

  it.each(['cancelled', 'rescheduled', 'no_show', 'completed'])('locks out both clinical roles when the appointment is %s', async status => {
    context.appointments[0].roomOpenedAt = startAt.toISOString()
    context.appointments[0].status = status
    atMinutesFromStart(0)
    expect((await doctor.post(`/api/appointments/${appointmentId}/video-token`)).status).toBe(409)
    expect((await patient.post(`/api/appointments/${appointmentId}/video-token`)).status).toBe(409)
  })

  it('rejects both roles after an unstarted slot ends', async () => {
    context.appointments[0].roomOpenedAt = new Date(startAt.getTime() - 5 * 60 * 1000).toISOString()
    currentTime = endAt
    expect((await doctor.post(`/api/appointments/${appointmentId}/video-token`)).status).toBe(409)
    expect((await patient.post(`/api/appointments/${appointmentId}/video-token`)).status).toBe(409)
  })

  it('allows both roles to reconnect after slot end while the Consultation is active', async () => {
    await openRoom()
    expect((await doctor.post(`/api/appointments/${appointmentId}/begin-consultation`)).status).toBe(200)
    currentTime = new Date(endAt.getTime() + 60 * 60 * 1000)
    expect((await doctor.post(`/api/appointments/${appointmentId}/video-token`)).status).toBe(200)
    expect((await patient.post(`/api/appointments/${appointmentId}/video-token`)).status).toBe(200)
  })

  it('rejects both roles after the Consultation is finished', async () => {
    await openRoom()
    await doctor.post(`/api/appointments/${appointmentId}/begin-consultation`)
    currentTime = new Date(endAt.getTime() + 60 * 60 * 1000)
    await doctor.post(`/api/appointments/${appointmentId}/consultation/finish`)
    expect((await doctor.post(`/api/appointments/${appointmentId}/video-token`)).status).toBe(409)
    expect((await patient.post(`/api/appointments/${appointmentId}/video-token`)).status).toBe(409)
  })

  it('returns distinct rooms for different appointments and stable rooms for reconnects', async () => {
    const secondSlot = context.slots.find(item => item.id === 102)
    secondSlot.startAt = startAt.toISOString()
    secondSlot.endAt = endAt.toISOString()
    const secondBooking = await patient.post('/api/appointments').send({ slotId: 102 })
    await openRoom()
    expect((await doctor.post(`/api/appointments/${secondBooking.body.appointment.id}/open-room`)).status).toBe(200)
    const first = await patient.post(`/api/appointments/${appointmentId}/video-token`)
    const repeated = await patient.post(`/api/appointments/${appointmentId}/video-token`)
    const different = await patient.post(`/api/appointments/${secondBooking.body.appointment.id}/video-token`)
    expect(first.body.roomName).toBe(repeated.body.roomName)
    expect(first.body.roomName).not.toBe(different.body.roomName)
  })

  it('fails safely when server-only JaaS configuration is unavailable', async () => {
    context = createBookingTestContext({
      clock: () => currentTime,
      tokenService: { async createVideoSession() { throw new JaasConfigurationError() } },
    })
    const slot = context.slots.find(item => item.id === 101)
    slot.startAt = startAt.toISOString()
    slot.endAt = endAt.toISOString()
    app = createApp(context.services)
    patient = await login(app, 'patient@example.test')
    doctor = await login(app, 'doctor@example.test')
    appointmentId = (await patient.post('/api/appointments').send({ slotId: 101 })).body.appointment.id
    await openRoom()
    const response = await patient.post(`/api/appointments/${appointmentId}/video-token`)
    expect(response.status).toBe(503)
    expect(response.body.error).toEqual({
      code: 'VIDEO_CONFIGURATION_UNAVAILABLE',
      message: 'Video service is temporarily unavailable',
    })
  })
})
