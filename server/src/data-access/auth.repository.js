import { getPool } from '../db/pool.js'

const safeUserColumns = 'id, full_name, email, role, is_enabled'

async function withTransaction(work) {
  const client = await getPool().connect()

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

export const authRepository = {
  async createPatient(input) {
    return withTransaction(async client => {
      const userResult = await client.query(
        `INSERT INTO users (full_name, email, password_hash, role)
         VALUES ($1, $2, $3, 'patient')
         RETURNING ${safeUserColumns}`,
        [input.fullName, input.email, input.passwordHash],
      )
      const user = userResult.rows[0]

      await client.query(
        `INSERT INTO patient_profiles (
           user_id, date_of_birth, gender, city, district, blood_group, allergies
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          user.id,
          input.dateOfBirth ?? null,
          input.gender ?? null,
          input.city ?? null,
          input.district ?? null,
          input.bloodGroup ?? null,
          input.allergies ?? null,
        ],
      )

      return user
    })
  },

  async createDoctor(input) {
    return withTransaction(async client => {
      const specializationResult = await client.query(
        'SELECT id FROM specializations WHERE id = ANY($1::bigint[])',
        [input.specializationIds],
      )

      if (specializationResult.rows.length !== input.specializationIds.length) {
        return null
      }

      const userResult = await client.query(
        `INSERT INTO users (full_name, email, password_hash, role)
         VALUES ($1, $2, $3, 'doctor')
         RETURNING ${safeUserColumns}`,
        [input.fullName, input.email, input.passwordHash],
      )
      const user = userResult.rows[0]

      await client.query(
        `INSERT INTO doctor_profiles (
           user_id, qualification, experience_years, bio, clinic_name,
           clinic_city, clinic_district, default_fee
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          user.id,
          input.qualification,
          input.experienceYears,
          input.bio ?? null,
          input.clinicName ?? null,
          input.clinicCity ?? null,
          input.clinicDistrict ?? null,
          input.defaultFee ?? null,
        ],
      )

      await client.query(
        `INSERT INTO doctor_specializations (doctor_id, specialization_id)
         SELECT $1, unnest($2::bigint[])`,
        [user.id, input.specializationIds],
      )

      return user
    })
  },

  async findByEmailForAuthentication(email) {
    const result = await getPool().query(
      `SELECT ${safeUserColumns}, password_hash
       FROM users
       WHERE email = $1`,
      [email],
    )

    return result.rows[0] ?? null
  },

  async findSafeUserById(userId) {
    const result = await getPool().query(
      `SELECT ${safeUserColumns}
       FROM users
       WHERE id = $1`,
      [userId],
    )

    return result.rows[0] ?? null
  },
}
