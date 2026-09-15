import { getPool } from '../db/pool.js'

export class AvailabilityDataError extends Error {
  constructor(code) {
    super(code)
    this.name = 'AvailabilityDataError'
    this.code = code
  }
}

async function withTransaction(databaseProvider, work) {
  const client = await databaseProvider().connect()

  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function lockDoctorForAvailability(client, doctorId) {
  await client.query(
    `SELECT pg_advisory_xact_lock(
       hashtextextended('medreach:doctor-availability:' || $1::text, 0)
     )`,
    [doctorId],
  )

  const doctorResult = await client.query(
    `SELECT u.is_enabled, verification.status AS verification_status
     FROM users u
     JOIN doctor_profiles profile ON profile.user_id = u.id
     JOIN doctor_verifications verification ON verification.doctor_id = u.id
     WHERE u.id = $1
       AND u.role = 'doctor'
     FOR UPDATE OF u, profile, verification`,
    [doctorId],
  )
  const doctor = doctorResult.rows[0]

  if (doctor && !doctor.is_enabled) {
    throw new AvailabilityDataError('ACCOUNT_DISABLED')
  }

  if (!doctor || doctor.verification_status !== 'approved') {
    throw new AvailabilityDataError('DOCTOR_NOT_APPROVED')
  }
}

export function createAvailabilityRepository(databaseProvider = getPool) {
  return {
    async listForDoctor(doctorId, now) {
      const result = await databaseProvider().query(
        `SELECT
           u.is_enabled,
           verification.status AS verification_status,
           block.id AS block_id,
           block.start_at AS block_start_at,
           block.end_at AS block_end_at,
           COALESCE(block.effective_fee, profile.default_fee) AS effective_fee,
           slot.id AS slot_id,
           slot.start_at AS slot_start_at,
           slot.end_at AS slot_end_at,
           slot.is_active AS slot_is_active,
           EXISTS (
             SELECT 1
             FROM appointments appointment
             WHERE appointment.slot_id = slot.id
               AND appointment.status = 'booked'
           ) AS slot_is_booked,
           EXISTS (
             SELECT 1
             FROM appointments appointment_history
             WHERE appointment_history.slot_id = slot.id
           ) AS slot_has_appointment_history
         FROM users u
         JOIN doctor_profiles profile ON profile.user_id = u.id
         LEFT JOIN doctor_verifications verification ON verification.doctor_id = u.id
         LEFT JOIN availability_blocks block
           ON block.doctor_id = u.id
          AND block.end_at > $2
         LEFT JOIN slots slot ON slot.availability_block_id = block.id
         WHERE u.id = $1
           AND u.role = 'doctor'
         ORDER BY block.start_at ASC, block.id ASC, slot.start_at ASC, slot.id ASC`,
        [doctorId, now],
      )

      const doctor = result.rows[0]
      if (doctor && !doctor.is_enabled) {
        throw new AvailabilityDataError('ACCOUNT_DISABLED')
      }
      if (!doctor || doctor.verification_status !== 'approved') {
        throw new AvailabilityDataError('DOCTOR_NOT_APPROVED')
      }

      return result.rows.filter(row => row.block_id !== null)
    },

    async create({ doctorId, startAt, endAt, fee }) {
      return withTransaction(databaseProvider, async client => {
        await lockDoctorForAvailability(client, doctorId)

        const overlapResult = await client.query(
          `SELECT 1
           FROM availability_blocks
           WHERE doctor_id = $1
             AND start_at < $3
             AND end_at > $2
           LIMIT 1`,
          [doctorId, startAt, endAt],
        )

        if (overlapResult.rowCount > 0) {
          throw new AvailabilityDataError('AVAILABILITY_OVERLAP')
        }

        const blockResult = await client.query(
          `INSERT INTO availability_blocks (doctor_id, start_at, end_at, effective_fee)
           VALUES ($1, $2, $3, $4)
           RETURNING id, doctor_id, start_at, end_at, effective_fee, created_at, updated_at`,
          [doctorId, startAt, endAt, fee],
        )
        const block = blockResult.rows[0]

        const slotsResult = await client.query(
          `INSERT INTO slots (availability_block_id, start_at, end_at)
           SELECT $1, slot_start, slot_start + interval '30 minutes'
           FROM generate_series(
             $2::timestamptz,
             $3::timestamptz - interval '30 minutes',
             interval '30 minutes'
           ) AS slot_start
           RETURNING id, availability_block_id, start_at, end_at, is_active, created_at`,
          [block.id, startAt, endAt],
        )

        return { block, slots: slotsResult.rows }
      })
    },

    async remove({ doctorId, blockId, now }) {
      return withTransaction(databaseProvider, async client => {
        await lockDoctorForAvailability(client, doctorId)

        await client.query(
          `SELECT slot.id
           FROM slots slot
           JOIN availability_blocks block ON block.id = slot.availability_block_id
           WHERE block.id = $1
             AND block.doctor_id = $2
           ORDER BY slot.id
           FOR UPDATE OF slot`,
          [blockId, doctorId],
        )

        const blockResult = await client.query(
          `SELECT id, start_at
           FROM availability_blocks
           WHERE id = $1
             AND doctor_id = $2
           FOR UPDATE`,
          [blockId, doctorId],
        )
        const block = blockResult.rows[0]

        if (!block) {
          throw new AvailabilityDataError('AVAILABILITY_BLOCK_NOT_FOUND')
        }

        if (new Date(block.start_at) <= now) {
          throw new AvailabilityDataError('AVAILABILITY_BLOCK_NOT_DELETABLE')
        }

        const appointmentResult = await client.query(
          `SELECT 1
           FROM appointments appointment
           JOIN slots slot ON slot.id = appointment.slot_id
           WHERE slot.availability_block_id = $1
           LIMIT 1`,
          [blockId],
        )

        if (appointmentResult.rowCount > 0) {
          throw new AvailabilityDataError('AVAILABILITY_BLOCK_PROTECTED')
        }

        await client.query('DELETE FROM slots WHERE availability_block_id = $1', [blockId])
        await client.query(
          'DELETE FROM availability_blocks WHERE id = $1 AND doctor_id = $2',
          [blockId, doctorId],
        )
      })
    },
  }
}

export const availabilityRepository = createAvailabilityRepository()
