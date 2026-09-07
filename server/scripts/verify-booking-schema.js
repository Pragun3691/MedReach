import { closePool, getPool } from '../src/db/pool.js'

const requiredTables = ['appointments', 'consultations', 'notifications']
const requiredColumns = [
  'appointments.ready_at',
  'appointments.room_opened_at',
  'appointments.no_show_marked_at',
  'consultations.appointment_id',
  'consultations.started_at',
  'consultations.finished_at',
  'consultations.created_at',
  'consultations.updated_at',
]
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
  'consultations_pkey',
  'consultations_appointment_id_fkey',
  'consultations_one_per_appointment',
  'consultations_finish_after_start',
]
const requiredIndexes = [
  'appointments_patient_status_idx',
  'appointments_slot_status_idx',
  'appointments_booked_slot_unique',
  'appointments_reschedule_replacement_unique',
  'notifications_recipient_read_created_idx',
  'consultations_one_per_appointment',
]

function missing(required, actual) {
  return required.filter(item => !actual.includes(item))
}

try {
  const database = getPool()
  const [tableResult, columnResult, constraintResult, constraintDefinitionResult, indexResult, countResult, statusResult] = await Promise.all([
    database.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [requiredTables],
    ),
    database.query(
      `SELECT table_name || '.' || column_name AS qualified_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
       ORDER BY table_name, ordinal_position`,
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
      `SELECT conname, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conname = ANY($1::text[])
       ORDER BY conname`,
      [['appointments_status_valid', 'consultations_appointment_id_fkey', 'consultations_one_per_appointment']],
    ),
    database.query(
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename IN ('appointments', 'consultations', 'notifications')
       ORDER BY indexname`,
    ),
    database.query(
      `SELECT
         (SELECT COUNT(*)::int FROM users WHERE role = 'doctor') AS doctors,
         (SELECT COUNT(*)::int FROM specializations) AS specializations,
         (SELECT COUNT(*)::int FROM slots) AS slots,
         (SELECT COUNT(*)::int FROM appointments) AS appointments,
         (SELECT COUNT(*)::int FROM consultations) AS consultations,
         (SELECT COUNT(*)::int FROM notifications) AS notifications,
         (SELECT md5(COALESCE(string_agg(row_to_json(appointment_row)::text, '|' ORDER BY appointment_row.id), ''))
          FROM appointments appointment_row) AS appointment_row_fingerprint`,
    ),
    database.query(
      `SELECT status, COUNT(*)::int AS count
       FROM appointments
       GROUP BY status
       ORDER BY status`,
    ),
  ])

  const tables = tableResult.rows.map(row => row.table_name)
  const columns = columnResult.rows.map(row => row.qualified_name)
  const constraints = constraintResult.rows.map(row => row.constraint_name)
  const constraintDefinitions = Object.fromEntries(
    constraintDefinitionResult.rows.map(row => [row.conname, row.definition]),
  )
  const indexes = indexResult.rows.map(row => row.indexname)
  const missingItems = [
    ...missing(requiredTables, tables),
    ...missing(requiredColumns, columns),
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

  const statusValues = [...(constraintDefinitions.appointments_status_valid ?? '').matchAll(/'([^']+)'/g)]
    .map(match => match[1])
    .filter(value => !value.includes('::'))
  const expectedStatuses = ['booked', 'cancelled', 'completed', 'no_show', 'rescheduled']
  if (JSON.stringify([...new Set(statusValues)].sort()) !== JSON.stringify(expectedStatuses)) {
    missingItems.push('exact five-value appointments_status_valid definition')
  }
  if (!constraintDefinitions.consultations_appointment_id_fkey?.includes('REFERENCES appointments(id) ON DELETE RESTRICT')) {
    missingItems.push('valid consultations appointment foreign key definition')
  }
  if (!constraintDefinitions.consultations_one_per_appointment?.includes('UNIQUE (appointment_id)')) {
    missingItems.push('valid one-consultation-per-appointment definition')
  }

  if (missingItems.length > 0) {
    throw new Error(`Missing booking schema requirements: ${missingItems.join(', ')}`)
  }

  console.log(JSON.stringify({
    tables,
    columns,
    constraints,
    constraintDefinitions,
    indexes,
    preservedCounts: countResult.rows[0],
    appointmentStatuses: statusResult.rows,
  }, null, 2))
} finally {
  await closePool()
}
