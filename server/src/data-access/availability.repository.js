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

async function lockDoctorForAvailability(client, doctorId) {
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
}

const indiaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
})

const indiaDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
})

function calendarDate(value) {
  if (typeof value === 'string') return value.slice(0, 10)
  return indiaDate(value)
}

function clockTime(value) {
  return String(value).slice(0, 5)
}

function indiaDate(value) {
  const parts = Object.fromEntries(
    indiaDateFormatter.formatToParts(value).map(part => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

function indiaDateTime(value) {
  const parts = Object.fromEntries(
    indiaDateTimeFormatter.formatToParts(value).map(part => [part.type, part.value]),
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  }
}

function addDays(date, days) {
  const instant = new Date(`${date}T00:00:00.000Z`)
  instant.setUTCDate(instant.getUTCDate() + days)
  return instant.toISOString().slice(0, 10)
}

function isoWeekday(date) {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay()
  return weekday === 0 ? 7 : weekday
}

function indiaInstant(date, time) {
  return new Date(`${date}T${clockTime(time)}:00+05:30`)
}

function canonicalWeekdays(weekdays) {
  return [...new Set(weekdays.map(Number))].sort((left, right) => left - right)
}

function earlierDate(left, right) {
  if (left === null) return right
  if (right === null) return left
  return left < right ? left : right
}

function laterDate(left, right) {
  return left > right ? left : right
}

function ruleWindow(rule, now) {
  const today = indiaDate(now)
  const horizon = addDays(today, 90)
  return {
    materializedThrough: earlierDate(rule.endsOn, horizon),
    today,
  }
}

function occurrencesForRule(rule, now) {
  const { materializedThrough, today } = ruleWindow(rule, now)
  const firstDate = laterDate(rule.startsOn, today)
  const occurrences = []

  for (let date = firstDate; date <= materializedThrough; date = addDays(date, 1)) {
    if (!rule.weekdays.includes(isoWeekday(date))) continue
    const startAt = indiaInstant(date, rule.startTime)
    if (startAt <= now) continue
    occurrences.push({
      date,
      startAt,
      endAt: indiaInstant(date, rule.endTime),
    })
  }

  return { materializedThrough, occurrences }
}

function hasFutureOccurrence(rule, now) {
  const today = indiaDate(now)
  const firstDate = laterDate(rule.startsOn, today)
  const lastDate = earlierDate(rule.endsOn, addDays(firstDate, 7))

  for (let date = firstDate; date <= lastDate; date = addDays(date, 1)) {
    if (rule.weekdays.includes(isoWeekday(date)) && indiaInstant(date, rule.startTime) > now) {
      return true
    }
  }
  return false
}

async function assertNoActiveRuleOverlap(client, rule, excludeRuleId = null) {
  const result = await client.query(
    `WITH candidates AS (
       SELECT
         recurring_rule.*,
         GREATEST(recurring_rule.starts_on, $2::date) AS overlap_start,
         LEAST(
           COALESCE(recurring_rule.ends_on, DATE '9999-12-31'),
           COALESCE($3::date, DATE '9999-12-31')
         ) AS overlap_end
       FROM recurring_availability_rules recurring_rule
       WHERE recurring_rule.doctor_id = $1
         AND recurring_rule.status = 'active'
         AND ($7::bigint IS NULL OR recurring_rule.id <> $7)
         AND recurring_rule.start_time < $5::time
         AND recurring_rule.end_time > $4::time
         AND recurring_rule.weekdays && $6::smallint[]
     )
     SELECT 1
     FROM candidates candidate
     WHERE candidate.overlap_start <= candidate.overlap_end
       AND EXISTS (
         SELECT 1
         FROM generate_series(
           candidate.overlap_start::timestamp,
           LEAST(candidate.overlap_end, candidate.overlap_start + 6)::timestamp,
           interval '1 day'
         ) occurrence_date
         WHERE EXTRACT(ISODOW FROM occurrence_date)::smallint = ANY(candidate.weekdays)
           AND EXTRACT(ISODOW FROM occurrence_date)::smallint = ANY($6::smallint[])
       )
     LIMIT 1`,
    [
      rule.doctorId,
      rule.startsOn,
      rule.endsOn,
      rule.startTime,
      rule.endTime,
      rule.weekdays,
      excludeRuleId,
    ],
  )

  if (result.rowCount > 0) throw new AvailabilityDataError('AVAILABILITY_OVERLAP')
}

async function assertNoSlotOverlap(client, doctorId, occurrence, excludeRuleId = null) {
  const result = await client.query(
    `SELECT 1
     FROM slots slot
     JOIN availability_blocks block ON block.id = slot.availability_block_id
     WHERE block.doctor_id = $1
       AND slot.start_at < $3
       AND slot.end_at > $2
       AND ($4::bigint IS NULL OR block.recurring_rule_id IS DISTINCT FROM $4)
       AND (
         slot.is_active = TRUE
         OR EXISTS (
           SELECT 1
           FROM appointments appointment
           WHERE appointment.slot_id = slot.id
             AND appointment.status = 'booked'
         )
       )
     LIMIT 1`,
    [doctorId, occurrence.startAt, occurrence.endAt, excludeRuleId],
  )

  if (result.rowCount > 0) throw new AvailabilityDataError('AVAILABILITY_OVERLAP')
}

function recurringRuleFromRow(row) {
  return {
    id: Number(row.id),
    doctorId: Number(row.doctor_id),
    weekdays: row.weekdays.map(Number),
    startTime: clockTime(row.start_time),
    endTime: clockTime(row.end_time),
    startsOn: calendarDate(row.starts_on),
    endsOn: row.ends_on === null ? null : calendarDate(row.ends_on),
    fee: row.effective_fee === null ? null : Number(row.effective_fee),
    status: row.status,
    materializedThrough: row.materialized_through === null
      ? null
      : calendarDate(row.materialized_through),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function materializeRule(client, rule, now) {
  const { materializedThrough, occurrences } = occurrencesForRule(rule, now)
  await assertNoActiveRuleOverlap(client, rule, rule.id)

  for (const occurrence of occurrences) {
    await assertNoSlotOverlap(client, rule.doctorId, occurrence, rule.id)
  }

  const materialized = []
  for (const occurrence of occurrences) {
    const blockResult = await client.query(
      `INSERT INTO availability_blocks (
         doctor_id, start_at, end_at, effective_fee, recurring_rule_id
       ) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (recurring_rule_id, start_at)
         WHERE recurring_rule_id IS NOT NULL
         DO NOTHING
       RETURNING id, doctor_id, start_at, end_at, effective_fee, recurring_rule_id,
         created_at, updated_at`,
      [rule.doctorId, occurrence.startAt, occurrence.endAt, rule.fee, rule.id],
    )
    const block = blockResult.rows[0]
    if (!block) continue

    const slotsResult = await client.query(
      `INSERT INTO slots (availability_block_id, start_at, end_at)
       SELECT $1, slot_start, slot_start + interval '30 minutes'
       FROM generate_series(
         $2::timestamptz,
         $3::timestamptz - interval '30 minutes',
         interval '30 minutes'
       ) AS slot_start
       RETURNING id, availability_block_id, start_at, end_at, is_active, created_at`,
      [block.id, occurrence.startAt, occurrence.endAt],
    )
    materialized.push({ block, slots: slotsResult.rows })
  }

  const updateResult = await client.query(
    `UPDATE recurring_availability_rules
     SET materialized_through = GREATEST(
           COALESCE(materialized_through, $3::date),
           $3::date
         ),
         updated_at = current_timestamp
     WHERE id = $1
       AND doctor_id = $2
     RETURNING id, doctor_id, weekdays, start_time, end_time, starts_on, ends_on,
       effective_fee, status, materialized_through, created_at, updated_at`,
    [rule.id, rule.doctorId, materializedThrough],
  )

  return {
    rule: recurringRuleFromRow(updateResult.rows[0]),
    materialized,
  }
}

export function createAvailabilityRepository(databaseProvider = getPool) {
  return {
    async listForDoctor(doctorId, now) {
      const result = await databaseProvider().query(
        `SELECT
           u.is_enabled,
           verification.status AS verification_status,
           block.id AS block_id,
           block.start_at AS block_start_at,
           block.end_at AS block_end_at,
           COALESCE(block.effective_fee, profile.default_fee) AS effective_fee,
           slot.id AS slot_id,
           slot.start_at AS slot_start_at,
           slot.end_at AS slot_end_at,
           slot.is_active AS slot_is_active,
           EXISTS (
             SELECT 1
             FROM appointments appointment
             WHERE appointment.slot_id = slot.id
               AND appointment.status = 'booked'
           ) AS slot_is_booked,
           EXISTS (
             SELECT 1
             FROM appointments appointment_history
             WHERE appointment_history.slot_id = slot.id
           ) AS slot_has_appointment_history
         FROM users u
         JOIN doctor_profiles profile ON profile.user_id = u.id
         LEFT JOIN doctor_verifications verification ON verification.doctor_id = u.id
         LEFT JOIN availability_blocks block
           ON block.doctor_id = u.id
          AND block.end_at > $2
         LEFT JOIN slots slot ON slot.availability_block_id = block.id
         WHERE u.id = $1
           AND u.role = 'doctor'
         ORDER BY block.start_at ASC, block.id ASC, slot.start_at ASC, slot.id ASC`,
        [doctorId, now],
      )

      const doctor = result.rows[0]
      if (doctor && !doctor.is_enabled) {
        throw new AvailabilityDataError('ACCOUNT_DISABLED')
      }
      if (!doctor || doctor.verification_status !== 'approved') {
        throw new AvailabilityDataError('DOCTOR_NOT_APPROVED')
      }

      return result.rows.filter(row => row.block_id !== null)
    },

    async create({ doctorId, startAt, endAt, fee }) {
      return withTransaction(databaseProvider, async client => {
        await lockDoctorForAvailability(client, doctorId)

        const localStart = indiaDateTime(startAt)
        const localEnd = indiaDateTime(endAt)
        await assertNoActiveRuleOverlap(client, {
          doctorId,
          weekdays: [isoWeekday(localStart.date)],
          startTime: localStart.time,
          endTime: localEnd.time,
          startsOn: localStart.date,
          endsOn: localStart.date,
        })

        await assertNoSlotOverlap(client, doctorId, { startAt, endAt })

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

    async createRecurring(input, now = new Date()) {
      return withTransaction(databaseProvider, async client => {
        await lockDoctorForAvailability(client, input.doctorId)
        const rule = {
          doctorId: input.doctorId,
          weekdays: canonicalWeekdays(input.weekdays),
          startTime: clockTime(input.startTime),
          endTime: clockTime(input.endTime),
          startsOn: calendarDate(input.startsOn),
          endsOn: input.endsOn == null ? null : calendarDate(input.endsOn),
          fee: input.fee ?? null,
        }

        if (!hasFutureOccurrence(rule, now)) {
          throw new AvailabilityDataError('RECURRING_AVAILABILITY_IN_PAST')
        }

        await assertNoActiveRuleOverlap(client, rule)
        const { occurrences } = occurrencesForRule(rule, now)
        for (const occurrence of occurrences) {
          await assertNoSlotOverlap(client, rule.doctorId, occurrence)
        }

        const ruleResult = await client.query(
          `INSERT INTO recurring_availability_rules (
             doctor_id, weekdays, start_time, end_time, starts_on, ends_on, effective_fee
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, doctor_id, weekdays, start_time, end_time, starts_on, ends_on,
             effective_fee, status, materialized_through, created_at, updated_at`,
          [
            rule.doctorId,
            rule.weekdays,
            rule.startTime,
            rule.endTime,
            rule.startsOn,
            rule.endsOn,
            rule.fee,
          ],
        )

        return materializeRule(client, recurringRuleFromRow(ruleResult.rows[0]), now)
      })
    },

    async materializeRecurring({ doctorId, ruleId }, now = new Date()) {
      return withTransaction(databaseProvider, async client => {
        await lockDoctorForAvailability(client, doctorId)
        const ruleResult = await client.query(
          `SELECT id, doctor_id, weekdays, start_time, end_time, starts_on, ends_on,
             effective_fee, status, materialized_through, created_at, updated_at
           FROM recurring_availability_rules
           WHERE id = $1
             AND doctor_id = $2
             AND status = 'active'
           FOR UPDATE`,
          [ruleId, doctorId],
        )
        if (!ruleResult.rows[0]) {
          throw new AvailabilityDataError('RECURRING_AVAILABILITY_RULE_NOT_FOUND')
        }

        return materializeRule(client, recurringRuleFromRow(ruleResult.rows[0]), now)
      })
    },

    async remove({ doctorId, blockId, now }) {
      return withTransaction(databaseProvider, async client => {
        await lockDoctorForAvailability(client, doctorId)

        await client.query(
          `SELECT slot.id
           FROM slots slot
           JOIN availability_blocks block ON block.id = slot.availability_block_id
           WHERE block.id = $1
             AND block.doctor_id = $2
           ORDER BY slot.id
           FOR UPDATE OF slot`,
          [blockId, doctorId],
        )

        const blockResult = await client.query(
          `SELECT id, start_at
           FROM availability_blocks
           WHERE id = $1
             AND doctor_id = $2
           FOR UPDATE`,
          [blockId, doctorId],
        )
        const block = blockResult.rows[0]

        if (!block) {
          throw new AvailabilityDataError('AVAILABILITY_BLOCK_NOT_FOUND')
        }

        if (new Date(block.start_at) <= now) {
          throw new AvailabilityDataError('AVAILABILITY_BLOCK_NOT_DELETABLE')
        }

        const appointmentResult = await client.query(
          `SELECT 1
           FROM appointments appointment
           JOIN slots slot ON slot.id = appointment.slot_id
           WHERE slot.availability_block_id = $1
           LIMIT 1`,
          [blockId],
        )

        if (appointmentResult.rowCount > 0) {
          throw new AvailabilityDataError('AVAILABILITY_BLOCK_PROTECTED')
        }

        await client.query('DELETE FROM slots WHERE availability_block_id = $1', [blockId])
        await client.query(
          'DELETE FROM availability_blocks WHERE id = $1 AND doctor_id = $2',
          [blockId, doctorId],
        )
      })
    },
  }
}

export const availabilityRepository = createAvailabilityRepository()
