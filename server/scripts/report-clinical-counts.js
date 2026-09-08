import { closePool, getPool } from '../src/db/pool.js'

try {
  const database = getPool()
  const schema = await database.query(
    `SELECT
       to_regclass('public.consultation_prescription_items') IS NOT NULL AS has_prescriptions,
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'consultations' AND column_name = 'follow_up_interval'
       ) AS has_follow_ups`,
  )
  const hasClinicalSchema = schema.rows[0].has_prescriptions && schema.rows[0].has_follow_ups
  const result = await database.query(
    `SELECT
       (SELECT COUNT(*)::int FROM appointments) AS appointments,
       (SELECT COUNT(*)::int FROM consultations) AS consultations,
       (SELECT md5(COALESCE(string_agg(row_to_json(appointment_row)::text, '|' ORDER BY appointment_row.id), ''))
        FROM appointments appointment_row) AS appointment_fingerprint`,
  )
  const clinicalCounts = hasClinicalSchema
    ? (await database.query(
      `SELECT
         (SELECT COUNT(*)::int FROM consultation_prescription_items) AS prescription_items,
         (SELECT COUNT(*)::int FROM consultations WHERE follow_up_interval IS NOT NULL) AS follow_ups`,
    )).rows[0]
    : { prescription_items: null, follow_ups: null }
  const statuses = await database.query(
    `SELECT status, COUNT(*)::int AS count
     FROM appointments
     GROUP BY status
     ORDER BY status`,
  )
  console.log(JSON.stringify({ ...result.rows[0], ...clinicalCounts, statuses: statuses.rows }, null, 2))
} finally {
  await closePool()
}
