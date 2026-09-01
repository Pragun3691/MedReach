import { getPool } from '../db/pool.js'

const publicDoctorRule = `
  u.role = 'doctor'
  AND u.is_enabled = TRUE
  AND dv.status = 'approved'
`

function buildSearchConditions(filters) {
  const conditions = [publicDoctorRule]
  const values = []

  function addValue(value) {
    values.push(value)
    return `$${values.length}`
  }

  if (filters.name) {
    const placeholder = addValue(`%${filters.name}%`)
    conditions.push(`u.full_name ILIKE ${placeholder}`)
  }

  if (filters.specialization) {
    const placeholder = addValue(filters.specialization)
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM doctor_specializations ds_filter
        JOIN specializations sp_filter ON sp_filter.id = ds_filter.specialization_id
        WHERE ds_filter.doctor_id = u.id
          AND lower(sp_filter.name) = lower(${placeholder})
      )
    `)
  }

  if (filters.problem) {
    const placeholder = addValue(filters.problem)
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM doctor_specializations ds_problem
        JOIN specialization_search_terms sst
          ON sst.specialization_id = ds_problem.specialization_id
        WHERE ds_problem.doctor_id = u.id
          AND sst.term = lower(btrim(${placeholder}))
      )
    `)
  }

  if (filters.date) {
    const placeholder = addValue(filters.date)
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM availability_blocks ab_date
        JOIN slots s_date ON s_date.availability_block_id = ab_date.id
        WHERE ab_date.doctor_id = u.id
          AND s_date.is_active = TRUE
          AND s_date.start_at > current_timestamp
          AND (s_date.start_at AT TIME ZONE 'Asia/Kolkata')::date = ${placeholder}::date
      )
    `)
  }

  if (filters.maxFee !== undefined) {
    const placeholder = addValue(filters.maxFee)
    conditions.push(`dp.default_fee IS NOT NULL AND dp.default_fee <= ${placeholder}`)
  }

  if (filters.minExperience !== undefined) {
    const placeholder = addValue(filters.minExperience)
    conditions.push(`dp.experience_years >= ${placeholder}`)
  }

  return {
    whereSql: conditions.map(condition => `(${condition})`).join(' AND '),
    values,
  }
}

const publicDoctorSelect = `
  SELECT
    u.id,
    u.full_name,
    dp.qualification,
    dp.experience_years,
    dp.bio,
    dp.clinic_name,
    dp.clinic_city,
    dp.clinic_district,
    dp.default_fee,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('id', sp.id, 'name', sp.name)
        ORDER BY sp.name
      )
      FROM doctor_specializations ds
      JOIN specializations sp ON sp.id = ds.specialization_id
      WHERE ds.doctor_id = u.id
    ), '[]'::jsonb) AS specializations,
    (
      SELECT MIN(s.start_at)
      FROM availability_blocks ab
      JOIN slots s ON s.availability_block_id = ab.id
      WHERE ab.doctor_id = u.id
        AND s.is_active = TRUE
        AND s.start_at > current_timestamp
    ) AS next_available_at
  FROM users u
  JOIN doctor_profiles dp ON dp.user_id = u.id
  JOIN doctor_verifications dv ON dv.doctor_id = u.id
`

export const publicDoctorRepository = {
  async search(filters) {
    const database = getPool()
    const { whereSql, values } = buildSearchConditions(filters)

    const totalResult = await database.query(
      `SELECT COUNT(*) AS total
       FROM users u
       JOIN doctor_profiles dp ON dp.user_id = u.id
       JOIN doctor_verifications dv ON dv.doctor_id = u.id
       WHERE ${whereSql}`,
      values,
    )

    const limitPlaceholder = `$${values.length + 1}`
    const offsetPlaceholder = `$${values.length + 2}`
    const result = await database.query(
      `${publicDoctorSelect}
       WHERE ${whereSql}
       ORDER BY next_available_at ASC NULLS LAST, u.full_name ASC
       LIMIT ${limitPlaceholder}
       OFFSET ${offsetPlaceholder}`,
      [...values, filters.limit, filters.offset],
    )

    return {
      rows: result.rows,
      total: Number(totalResult.rows[0].total),
    }
  },

  async findById(doctorId) {
    const result = await getPool().query(
      `${publicDoctorSelect}
       WHERE ${publicDoctorRule}
         AND u.id = $1`,
      [doctorId],
    )

    return result.rows[0] ?? null
  },

  async findSlotsByDate(doctorId, date) {
    const result = await getPool().query(
      `SELECT
         s.id,
         s.start_at,
         s.end_at,
         COALESCE(ab.effective_fee, dp.default_fee) AS fee
       FROM availability_blocks ab
       JOIN doctor_profiles dp ON dp.user_id = ab.doctor_id
       JOIN slots s ON s.availability_block_id = ab.id
       WHERE ab.doctor_id = $1
         AND s.is_active = TRUE
         AND s.start_at > current_timestamp
         AND (s.start_at AT TIME ZONE 'Asia/Kolkata')::date = $2::date
       ORDER BY s.start_at ASC`,
      [doctorId, date],
    )

    return result.rows
  },
}
