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

export function createAvailabilityRepository(databaseProvider = getPool) {
  return {
    async create({ doctorId, startAt, endAt, fee }) {
      return withTransaction(databaseProvider, async client => {
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
  }
}

export const availabilityRepository = createAvailabilityRepository()
