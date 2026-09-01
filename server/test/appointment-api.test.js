import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
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
