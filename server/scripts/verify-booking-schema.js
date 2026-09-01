import { closePool, getPool } from '../src/db/pool.js'

const requiredTables = ['appointments', 'notifications']
const requiredConstraints = [
  'appointments_pkey',
  'appointments_status_valid',
  'appointments_fee_nonnegative',
  'appointments_cancellation_metadata_valid',
  'appointments_not_self_rescheduled',
  'appointments_patient_id_fkey',
  'appointments_slot_id_fkey',
  'appointments_rescheduled_from_appointment_id_fkey',
  'appointments_cancelled_by_user_id_fkey',
  'notifications_type_valid',
  'notifications_message_valid',
  'notifications_action_path_internal',
]
const requiredIndexes = [
  'appointments_patient_status_idx',
  'appointments_slot_status_idx',
  'appointments_booked_slot_unique',
  'appointments_reschedule_replacement_unique',
  'notifications_recipient_read_created_idx',
]

function missing(required, actual) {
  return required.filter(item => !actual.includes(item))
}

try {
  const database = getPool()
  const [tableResult, constraintResult, indexResult, countResult] = await Promise.all([
    database.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [requiredTables],
    ),
    database.query(
      `SELECT constraint_name
       FROM information_schema.table_constraints
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
       ORDER BY constraint_name`,
      [requiredTables],
    ),
    database.query(
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename IN ('appointments', 'notifications')
       ORDER BY indexname`,
    ),
    database.query(
      `SELECT
         (SELECT COUNT(*)::int FROM users WHERE role = 'doctor') AS doctors,
         (SELECT COUNT(*)::int FROM specializations) AS specializations,
         (SELECT COUNT(*)::int FROM slots) AS slots,
         (SELECT COUNT(*)::int FROM appointments) AS appointments,
         (SELECT COUNT(*)::int FROM notifications) AS notifications`,
    ),
  ])

  const tables = tableResult.rows.map(row => row.table_name)
  const constraints = constraintResult.rows.map(row => row.constraint_name)
  const indexes = indexResult.rows.map(row => row.indexname)
  const missingItems = [
    ...missing(requiredTables, tables),
    ...missing(requiredConstraints, constraints),
    ...missing(requiredIndexes, indexes),
  ]

  const bookedIndex = indexResult.rows.find(row => row.indexname === 'appointments_booked_slot_unique')
  const replacementIndex = indexResult.rows.find(row => row.indexname === 'appointments_reschedule_replacement_unique')
  if (
    !bookedIndex?.indexdef.includes('UNIQUE')
    || !bookedIndex.indexdef.includes('WHERE')
    || !bookedIndex.indexdef.includes("'booked'")
  ) {
    missingItems.push('valid appointments_booked_slot_unique definition')
  }
  if (!replacementIndex?.indexdef.includes('UNIQUE') || !replacementIndex.indexdef.includes('rescheduled_from_appointment_id IS NOT NULL')) {
    missingItems.push('valid appointments_reschedule_replacement_unique definition')
  }

  if (missingItems.length > 0) {
    throw new Error(`Missing booking schema requirements: ${missingItems.join(', ')}`)
  }

  console.log(JSON.stringify({ tables, constraints, indexes, preservedCounts: countResult.rows[0] }, null, 2))
} finally {
  await closePool()
}
