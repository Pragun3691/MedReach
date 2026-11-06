import { getPool } from '../db/pool.js'
import { AppError } from '../errors/app-error.js'

const conflict = () => new AppError(409, 'VERIFICATION_CONFLICT', 'This request has changed or cannot be edited. Reload its latest status.')
const notFound = () => new AppError(404, 'VERIFICATION_NOT_FOUND', 'Verification request not found.')

// Explicit allowlist: no patient, appointment, prescription or clinical tables.
const detailColumns = `v.id, v.doctor_id AS "doctorId", v.status, v.version,
  v.registration_number AS "registrationNumber", v.issuing_authority AS "issuingAuthority",
  v.rejection_reason AS "rejectionReason", v.submitted_at AS "submittedAt",
  v.reviewed_by_user_id AS "reviewedByUserId", v.reviewed_at AS "reviewedAt",
  u.full_name AS "fullName", u.is_enabled AS "isEnabled", p.qualification,
  p.experience_years AS "experienceYears", p.bio, p.clinic_name AS "clinicName",
  p.clinic_city AS "clinicCity", p.clinic_district AS "clinicDistrict",
  COALESCE((SELECT json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
    FROM doctor_specializations ds JOIN specializations s ON s.id = ds.specialization_id
    WHERE ds.doctor_id = v.doctor_id), '[]'::json) AS specializations`
const detailFrom = `FROM doctor_verifications v
  JOIN users u ON u.id = v.doctor_id AND u.role = 'doctor'
  JOIN doctor_profiles p ON p.user_id = v.doctor_id`

export function createVerificationRepository(databaseProvider = getPool) {
  async function transaction(work) {
    const client = await databaseProvider().connect()
    try {
      await client.query('BEGIN')
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      if (error.code === '23505') {
        throw new AppError(409, 'CREDENTIALS_IN_USE', 'These registration credentials cannot be submitted. Please check them or contact support.')
      }
      throw error
    } finally {
      client.release()
    }
  }

  return {
    async list({ status, limit, offset }) {
      const result = await databaseProvider().query(
        `SELECT ${detailColumns} ${detailFrom}
         WHERE v.status = $1 ORDER BY v.submitted_at ASC NULLS FIRST, v.id ASC LIMIT $2 OFFSET $3`,
        [status, limit + 1, offset],
      )
      return { items: result.rows.slice(0, limit), hasMore: result.rows.length > limit }
    },

    async get(id) {
      const result = await databaseProvider().query(`SELECT ${detailColumns} ${detailFrom} WHERE v.id = $1`, [id])
      if (!result.rows[0]) throw notFound()
      return result.rows[0]
    },

    async getMine(doctorId) {
      const result = await databaseProvider().query(
        `SELECT id, status, version, registration_number AS "registrationNumber",
          issuing_authority AS "issuingAuthority", rejection_reason AS "rejectionReason",
          submitted_at AS "submittedAt", reviewed_at AS "reviewedAt"
         FROM doctor_verifications WHERE doctor_id = $1`, [doctorId],
      )
      return result.rows[0] ?? {
        id: null, status: 'missing_credentials', version: 0, registrationNumber: null,
        issuingAuthority: null, rejectionReason: null, submittedAt: null, reviewedAt: null,
      }
    },

    async submit(doctorId, input) {
      return transaction(async client => {
        // Locks the owner before the verification, consistently with availability.
        const owner = await client.query(
          `SELECT u.id FROM users u JOIN doctor_profiles p ON p.user_id = u.id
           WHERE u.id = $1 AND u.role = 'doctor' AND u.is_enabled = TRUE FOR UPDATE OF u, p`, [doctorId],
        )
        if (!owner.rows[0]) throw new AppError(403, 'ROLE_FORBIDDEN', 'An enabled Doctor account is required.')
        const current = await client.query('SELECT status, version FROM doctor_verifications WHERE doctor_id = $1 FOR UPDATE', [doctorId])
        const row = current.rows[0]
        if ((!row && input.version !== 0) || (row && (row.version !== input.version
          || !['missing_credentials', 'rejected'].includes(row.status)))) throw conflict()
        const result = row
          ? await client.query(
            `UPDATE doctor_verifications SET registration_number = $2, issuing_authority = $3,
              status = 'pending', rejection_reason = NULL, reviewed_by_user_id = NULL,
              reviewed_at = NULL, submitted_at = current_timestamp, updated_at = current_timestamp,
              version = version + 1 WHERE doctor_id = $1 RETURNING id, status, version`,
            [doctorId, input.registrationNumber, input.issuingAuthority],
          )
          : await client.query(
            `INSERT INTO doctor_verifications (doctor_id, registration_number, issuing_authority)
             VALUES ($1, $2, $3) RETURNING id, status, version`,
            [doctorId, input.registrationNumber, input.issuingAuthority],
          )
        return result.rows[0]
      })
    },

    async review(id, adminId, decision, input) {
      return transaction(async client => {
        // Recheck and lock the reviewer as well as using live route authorization.
        const reviewer = await client.query(
          `SELECT id FROM users WHERE id = $1 AND role = 'admin' AND is_enabled = TRUE FOR SHARE`, [adminId],
        )
        if (!reviewer.rows[0]) throw new AppError(403, 'ROLE_FORBIDDEN', 'An enabled Admin account is required.')
        const owner = await client.query(
          `SELECT u.id FROM users u JOIN doctor_profiles p ON p.user_id = u.id
           JOIN doctor_verifications v ON v.doctor_id = u.id
           WHERE v.id = $1 AND u.role = 'doctor' AND u.is_enabled = TRUE FOR UPDATE OF u, p`, [id],
        )
        if (!owner.rows[0]) throw new AppError(409, 'DOCTOR_UNAVAILABLE', 'The Doctor account is unavailable or disabled.')
        const current = await client.query('SELECT * FROM doctor_verifications WHERE id = $1 FOR UPDATE', [id])
        const row = current.rows[0]
        if (!row) throw notFound()
        if (row.status !== 'pending' || row.version !== input.version) throw conflict()
        if (!row.registration_number?.trim() || row.registration_number.trim().length < 2
          || !row.issuing_authority?.trim() || row.issuing_authority.trim().length < 2 || !row.submitted_at) {
          throw new AppError(409, 'CREDENTIALS_REQUIRED', 'Registration number and issuing authority are required before review.')
        }
        const result = await client.query(
          `UPDATE doctor_verifications SET status = $2, rejection_reason = $3,
            reviewed_by_user_id = $4, reviewed_at = current_timestamp,
            updated_at = current_timestamp, version = version + 1
           WHERE id = $1 AND status = 'pending' AND version = $5 RETURNING id, status, version`,
          [id, decision, decision === 'rejected' ? input.reason : null, adminId, input.version],
        )
        if (!result.rows[0]) throw conflict()
        await client.query(
          `INSERT INTO doctor_verification_reviews (verification_id, submission_version, decision,
            registration_number, issuing_authority, reason, reviewed_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, input.version, decision, row.registration_number, row.issuing_authority,
            decision === 'rejected' ? input.reason : null, adminId],
        )
        return result.rows[0]
      })
    },
  }
}

export const verificationRepository = createVerificationRepository()
