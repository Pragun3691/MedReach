import { getPool } from '../db/pool.js'

const publicDoctorRule = `
  u.role = 'doctor'
  AND u.is_enabled = TRUE
  AND dv.status = 'approved'
`

const normalizedDoctorNameSql = `lower(regexp_replace(
  regexp_replace(btrim(u.full_name), '^dr[.]?[[:space:]]+', 'dr ', 'i'),
  '[[:space:]]+', ' ', 'g'
))`

function specializationMatchSql(alias, placeholder) {
  return `EXISTS (
    SELECT 1
    FROM doctor_specializations ${alias}
    WHERE ${alias}.doctor_id = u.id
      AND ${alias}.specialization_id = ANY(${placeholder}::bigint[])
  )`
}

function buildSearchConditions(filters) {
  const conditions = [publicDoctorRule]
  const values = []
  let searchRankSql = null

  function addValue(value) {
    values.push(value)
    return `$${values.length}`
  }

  if (filters.name) {
    const placeholder = addValue(filters.name)
    conditions.push(`strpos(${normalizedDoctorNameSql}, ${placeholder}) > 0`)
  }

  if (filters.qName) {
    const namePlaceholder = addValue(filters.qName)
    const nameMatchSql = `strpos(${normalizedDoctorNameSql}, ${namePlaceholder}) > 0`
    let specializationSql = null

    if (filters.qSpecializationIds?.length > 0) {
      const specializationPlaceholder = addValue(filters.qSpecializationIds)
      specializationSql = specializationMatchSql('ds_q', specializationPlaceholder)
    }

    conditions.push(specializationSql
      ? `(${nameMatchSql} OR ${specializationSql})`
      : nameMatchSql)

    const specializationRank = {
      'canonical-exact': 2,
      'term-exact': 3,
      prefix: 4,
      fuzzy: 4,
    }[filters.qSpecializationKind] ?? 5
    const unprefixedNameSql = `regexp_replace(${normalizedDoctorNameSql}, '^dr ', '')`
    searchRankSql = `CASE
      WHEN ${normalizedDoctorNameSql} = ${namePlaceholder}
        OR ${unprefixedNameSql} = ${namePlaceholder} THEN 0
      WHEN ${nameMatchSql} THEN 1
      ${specializationSql ? `WHEN ${specializationSql} THEN ${specializationRank}` : ''}
      ELSE 5
    END`
  }

  if (filters.specializationIds) {
    if (filters.specializationIds.length === 0) conditions.push('FALSE')
    else {
      const placeholder = addValue(filters.specializationIds)
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM doctor_specializations ds_filter
          WHERE ds_filter.doctor_id = u.id
            AND ds_filter.specialization_id = ANY(${placeholder}::bigint[])
        )
      `)
    }
  } else if (filters.specialization) {
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

  if (filters.problemSpecializationIds) {
    if (filters.problemSpecializationIds.length === 0) conditions.push('FALSE')
    else {
      const placeholder = addValue(filters.problemSpecializationIds)
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM doctor_specializations ds_problem
          WHERE ds_problem.doctor_id = u.id
            AND ds_problem.specialization_id = ANY(${placeholder}::bigint[])
        )
      `)
    }
  } else if (filters.problem) {
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
          AND NOT EXISTS (
            SELECT 1
            FROM appointments a_date
            WHERE a_date.slot_id = s_date.id
              AND a_date.status = 'booked'
          )
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
    searchRankSql,
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
        AND NOT EXISTS (
          SELECT 1
          FROM appointments a_next
          WHERE a_next.slot_id = s.id
            AND a_next.status = 'booked'
        )
    ) AS next_available_at
  FROM users u
  JOIN doctor_profiles dp ON dp.user_id = u.id
  JOIN doctor_verifications dv ON dv.doctor_id = u.id
`

export const publicDoctorRepository = {
  async findSearchVocabulary() {
    const result = await getPool().query(
      `SELECT
         sp.id AS specialization_id,
         sp.name,
         COALESCE(
           array_agg(sst.term ORDER BY sst.term) FILTER (WHERE sst.term IS NOT NULL),
           ARRAY[]::varchar[]
         ) AS terms
       FROM specializations sp
       LEFT JOIN specialization_search_terms sst ON sst.specialization_id = sp.id
       GROUP BY sp.id, sp.name
       ORDER BY sp.name`,
    )

    return result.rows
  },

  async search(filters) {
    const database = getPool()
    const { whereSql, values, searchRankSql } = buildSearchConditions(filters)

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
       ORDER BY ${searchRankSql ? `${searchRankSql}, ` : ''}next_available_at ASC NULLS LAST, u.full_name ASC, u.id ASC
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
         AND NOT EXISTS (
           SELECT 1
           FROM appointments a
           WHERE a.slot_id = s.id
             AND a.status = 'booked'
         )
         AND (s.start_at AT TIME ZONE 'Asia/Kolkata')::date = $2::date
       ORDER BY s.start_at ASC`,
      [doctorId, date],
    )

    return result.rows
  },
}
