import { getPool } from '../db/pool.js'

export class AppointmentDataError extends Error {
  constructor(code) {
    super(code)
    this.name = 'AppointmentDataError'
    this.code = code
  }
}

const appointmentSelect = `
  SELECT
    a.id,
    a.patient_id,
    a.slot_id,
    a.rescheduled_from_appointment_id,
    a.status,
    a.fee_snapshot,
    a.cancelled_by_user_id,
    a.cancellation_reason,
    a.cancelled_at,
    a.ready_at,
    a.no_show_marked_at,
    a.created_at,
    a.updated_at,
    patient_user.full_name AS patient_name,
    ab.doctor_id,
    doctor_user.full_name AS doctor_name,
    s.start_at,
    s.end_at,
    s.is_active AS slot_is_active,
    (
      SELECT replacement.id
      FROM appointments replacement
      WHERE replacement.rescheduled_from_appointment_id = a.id
      LIMIT 1
    ) AS replacement_appointment_id,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('id', specialization.id, 'name', specialization.name)
        ORDER BY specialization.name
      )
      FROM doctor_specializations doctor_specialization
      JOIN specializations specialization
        ON specialization.id = doctor_specialization.specialization_id
      WHERE doctor_specialization.doctor_id = ab.doctor_id
    ), '[]'::jsonb) AS specializations
  FROM appointments a
  JOIN patient_profiles patient ON patient.user_id = a.patient_id
  JOIN users patient_user ON patient_user.id = patient.user_id
  JOIN slots s ON s.id = a.slot_id
  JOIN availability_blocks ab ON ab.id = s.availability_block_id
  JOIN doctor_profiles doctor ON doctor.user_id = ab.doctor_id
  JOIN users doctor_user ON doctor_user.id = doctor.user_id
`

async function withTransaction(databaseProvider, work) {
  const client = await databaseProvider().connect()

  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')

    if (
      error?.code === '23505'
      && ['appointments_booked_slot_unique', 'appointments_reschedule_replacement_unique'].includes(error.constraint)
    ) {
      throw new AppointmentDataError('SLOT_UNAVAILABLE')
    }

    throw error
  } finally {
    client.release()
  }
}

async function lockSlot(client, slotId) {
  const result = await client.query(
    `SELECT
       s.id,
       s.start_at,
       s.end_at,
       s.is_active,
       s.start_at > current_timestamp AS is_future,
       ab.doctor_id,
       ab.effective_fee,
       dp.default_fee,
       doctor_user.full_name AS doctor_name,
       doctor_user.is_enabled AS doctor_is_enabled,
       verification.status AS verification_status,
       EXISTS (
         SELECT 1
         FROM appointments existing
         WHERE existing.slot_id = s.id
           AND existing.status = 'booked'
       ) AS is_booked
     FROM slots s
     JOIN availability_blocks ab ON ab.id = s.availability_block_id
     JOIN doctor_profiles dp ON dp.user_id = ab.doctor_id
     JOIN users doctor_user ON doctor_user.id = dp.user_id
     JOIN doctor_verifications verification ON verification.doctor_id = dp.user_id
     WHERE s.id = $1
     FOR UPDATE OF s, ab, dp, doctor_user, verification`,
    [slotId],
  )

  const slot = result.rows[0]
  if (
    !slot
    || !slot.is_active
    || !slot.is_future
    || !slot.doctor_is_enabled
    || slot.verification_status !== 'approved'
    || slot.is_booked
  ) {
    throw new AppointmentDataError('SLOT_UNAVAILABLE')
  }

  return slot
}

async function lockAppointment(client, appointmentId) {
  const result = await client.query(
    `SELECT
       a.*,
       s.start_at,
       s.is_active AS slot_is_active,
       s.start_at > current_timestamp AS is_future,
       ab.doctor_id,
       patient_user.full_name AS patient_name,
       doctor_user.full_name AS doctor_name
     FROM appointments a
     JOIN patient_profiles patient ON patient.user_id = a.patient_id
     JOIN users patient_user ON patient_user.id = patient.user_id
     JOIN slots s ON s.id = a.slot_id
     JOIN availability_blocks ab ON ab.id = s.availability_block_id
     JOIN users doctor_user ON doctor_user.id = ab.doctor_id
     WHERE a.id = $1
     FOR UPDATE OF a, s, ab`,
    [appointmentId],
  )

  return result.rows[0] ?? null
}

async function findAppointment(client, appointmentId) {
  const result = await client.query(
    `${appointmentSelect}
     WHERE a.id = $1`,
    [appointmentId],
  )
  return result.rows[0] ?? null
}

async function createNotification(client, recipientUserId, type, message, appointmentId) {
  await client.query(
    `INSERT INTO notifications (recipient_user_id, type, message, action_path)
     VALUES ($1, $2, $3, $4)`,
    [recipientUserId, type, message, `/appointments/${appointmentId}`],
  )
}

export function createAppointmentRepository(databaseProvider = getPool) {
  return {
  async book({ patientId, patientName, slotId }) {
    return withTransaction(databaseProvider, async client => {
      const slot = await lockSlot(client, slotId)
      const feeSnapshot = slot.effective_fee ?? slot.default_fee
      const result = await client.query(
        `INSERT INTO appointments (patient_id, slot_id, fee_snapshot)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [patientId, slot.id, feeSnapshot],
      )
      const appointmentId = result.rows[0].id

      await createNotification(
        client,
        patientId,
        'appointment_booked',
        `Your appointment with ${slot.doctor_name} is confirmed.`,
        appointmentId,
      )
      await createNotification(
        client,
        slot.doctor_id,
        'appointment_booked',
        `A new appointment was booked by ${patientName}.`,
        appointmentId,
      )

      return findAppointment(client, appointmentId)
    })
  },

  async listForPatient(patientId) {
    const result = await databaseProvider().query(
      `${appointmentSelect}
       WHERE a.patient_id = $1`,
      [patientId],
    )
    return result.rows
  },

  async listForDoctor(doctorId) {
    const result = await databaseProvider().query(
      `${appointmentSelect}
       WHERE ab.doctor_id = $1`,
      [doctorId],
    )
    return result.rows
  },

  async findById(appointmentId) {
    return findAppointment(databaseProvider(), appointmentId)
  },

  async cancel({ appointmentId, actorId, actorRole, reason }) {
    return withTransaction(databaseProvider, async client => {
      const appointment = await lockAppointment(client, appointmentId)
      if (!appointment) throw new AppointmentDataError('APPOINTMENT_NOT_FOUND')

      const ownsAppointment = actorRole === 'patient' && Number(appointment.patient_id) === actorId
      const isAssignedDoctor = actorRole === 'doctor' && Number(appointment.doctor_id) === actorId
      if (!ownsAppointment && !isAssignedDoctor) {
        throw new AppointmentDataError('APPOINTMENT_ACCESS_DENIED')
      }
      if (appointment.status !== 'booked' || !appointment.is_future) {
        throw new AppointmentDataError('APPOINTMENT_NOT_CANCELLABLE')
      }

      await client.query(
        `UPDATE appointments
         SET status = 'cancelled',
             cancelled_by_user_id = $2,
             cancellation_reason = $3,
             cancelled_at = current_timestamp,
             updated_at = current_timestamp
         WHERE id = $1`,
        [appointmentId, actorId, reason ?? null],
      )

      if (actorRole === 'doctor') {
        await client.query('UPDATE slots SET is_active = FALSE WHERE id = $1', [appointment.slot_id])
        await createNotification(
          client,
          appointment.patient_id,
          'appointment_cancelled',
          `${appointment.doctor_name} cancelled your appointment${reason ? `: ${reason}` : '.'}`,
          appointmentId,
        )
      } else {
        await createNotification(
          client,
          appointment.doctor_id,
          'appointment_cancelled',
          `${appointment.patient_name} cancelled their appointment.`,
          appointmentId,
        )
      }

      return findAppointment(client, appointmentId)
    })
  },

  async reschedule({ appointmentId, patientId, slotId }) {
    return withTransaction(databaseProvider, async client => {
      const original = await lockAppointment(client, appointmentId)
      if (!original) throw new AppointmentDataError('APPOINTMENT_NOT_FOUND')
      if (Number(original.patient_id) !== patientId) {
        throw new AppointmentDataError('APPOINTMENT_ACCESS_DENIED')
      }
      if (original.status !== 'booked' || !original.is_future) {
        throw new AppointmentDataError('APPOINTMENT_NOT_RESCHEDULABLE')
      }
      if (Number(original.slot_id) === slotId) {
        throw new AppointmentDataError('SAME_SLOT')
      }

      const newSlot = await lockSlot(client, slotId)
      const feeSnapshot = newSlot.effective_fee ?? newSlot.default_fee

      await client.query(
        `UPDATE appointments
         SET status = 'rescheduled', updated_at = current_timestamp
         WHERE id = $1`,
        [appointmentId],
      )
      const insertResult = await client.query(
        `INSERT INTO appointments (
           patient_id, slot_id, rescheduled_from_appointment_id, fee_snapshot
         ) VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [patientId, newSlot.id, appointmentId, feeSnapshot],
      )
      const newAppointmentId = insertResult.rows[0].id

      await createNotification(
        client,
        patientId,
        'appointment_rescheduled',
        `Your appointment was rescheduled with ${newSlot.doctor_name}.`,
        newAppointmentId,
      )
      await createNotification(
        client,
        original.doctor_id,
        'appointment_rescheduled',
        `${original.patient_name} rescheduled their appointment.`,
        appointmentId,
      )
      if (Number(newSlot.doctor_id) !== Number(original.doctor_id)) {
        await createNotification(
          client,
          newSlot.doctor_id,
          'appointment_booked',
          `A rescheduled appointment was booked by ${original.patient_name}.`,
          newAppointmentId,
        )
      }

      return findAppointment(client, newAppointmentId)
    })
  },
  }
}

export const appointmentRepository = createAppointmentRepository()
