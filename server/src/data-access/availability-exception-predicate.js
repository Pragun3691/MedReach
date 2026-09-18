const sqlReferencePattern = /^(?:[a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*$|^\$[1-9][0-9]*$/i

function safeSqlReference(value, label) {
  if (!sqlReferencePattern.test(value)) {
    throw new TypeError(`${label} must be a column reference or PostgreSQL parameter placeholder`)
  }
  return value
}

/**
 * Builds an EXISTS predicate for an active India-local availability exception.
 * Inputs are restricted to column references or PostgreSQL placeholders so callers
 * can safely compose this fragment while keeping all runtime values parameterized.
 */
export function activeAvailabilityExceptionExistsSql({
  doctorId,
  startAt,
  endAt,
  exceptionAlias = 'availability_exception',
}) {
  const alias = safeSqlReference(exceptionAlias, 'exceptionAlias')
  const doctor = safeSqlReference(doctorId, 'doctorId')
  const start = safeSqlReference(startAt, 'startAt')
  const end = safeSqlReference(endAt, 'endAt')

  return `EXISTS (
    SELECT 1
    FROM availability_exceptions ${alias}
    WHERE ${alias}.doctor_id = ${doctor}
      AND ${alias}.removed_at IS NULL
      AND ${alias}.exception_date = (${start} AT TIME ZONE 'Asia/Kolkata')::date
      AND (
        ${alias}.all_day = TRUE
        OR (
          ${alias}.exception_date + ${alias}.start_time
            < (${end} AT TIME ZONE 'Asia/Kolkata')
          AND ${alias}.exception_date + ${alias}.end_time
            > (${start} AT TIME ZONE 'Asia/Kolkata')
        )
      )
  )`
}
