import { closePool, getPool } from '../src/db/pool.js'

const requiredTables = [
  'users',
  'doctor_profiles',
  'specializations',
  'doctor_specializations',
  'specialization_search_terms',
  'doctor_verifications',
  'availability_blocks',
  'slots',
  'patient_profiles',
  'user_sessions',
]

try {
  const database = getPool()
  const tableResult = await database.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    [requiredTables],
  )
  const existingTables = tableResult.rows.map(row => row.table_name)
  const missingTables = requiredTables.filter(table => !existingTables.includes(table))

  if (missingTables.length > 0) {
    throw new Error(`Missing required tables: ${missingTables.join(', ')}`)
  }

  const countResult = await database.query(
    `SELECT
       (SELECT COUNT(*)::int FROM users) AS users,
       (SELECT COUNT(*)::int FROM specializations) AS specializations,
       (SELECT COUNT(*)::int FROM doctor_profiles) AS doctor_profiles,
       (SELECT COUNT(*)::int FROM slots) AS slots,
       (SELECT COUNT(*)::int FROM doctor_verifications WHERE status = 'approved') AS approved_doctors,
       (SELECT COUNT(*)::int FROM users WHERE password_hash LIKE '$argon2id$%') AS argon2_formatted_hashes`,
  )

  console.log(JSON.stringify({ tables: existingTables, counts: countResult.rows[0] }, null, 2))
} finally {
  await closePool()
}
