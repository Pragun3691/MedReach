import {
  AvailabilityDataError,
  availabilityRepository,
} from '../data-access/availability.repository.js'
import { AppError } from '../errors/app-error.js'

function indiaInstant(date, time) {
  return new Date(`${date}T${time}:00+05:30`)
}

function optionalNumber(value) {
  return value === null || value === undefined ? null : Number(value)
}

const indiaCalendarDateFormatter = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
})

function calendarDateString(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  const parts = Object.fromEntries(
    indiaCalendarDateFormatter.formatToParts(date).map(part => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

function translateDataError(error) {
  if (!(error instanceof AvailabilityDataError)) throw error

  if (error.code === 'AVAILABILITY_OVERLAP') {
    throw new AppError(409, 'AVAILABILITY_OVERLAP', 'Availability overlaps existing availability')
  }

  if (error.code === 'DOCTOR_NOT_APPROVED') {
    throw new AppError(403, 'DOCTOR_NOT_APPROVED', 'Only approved Doctors can manage availability')
  }

  if (error.code === 'ACCOUNT_DISABLED') {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is disabled')
  }

  if (error.code === 'RECURRING_AVAILABILITY_IN_PAST') {
    throw new AppError(400, 'RECURRING_AVAILABILITY_IN_PAST', 'Recurring availability must include a future occurrence')
  }

  if (error.code === 'RECURRING_AVAILABILITY_RULE_NOT_FOUND') {
    throw new AppError(404, 'RECURRING_AVAILABILITY_RULE_NOT_FOUND', 'Recurring availability rule not found')
  }

  if (error.code === 'AVAILABILITY_BLOCK_NOT_FOUND') {
    throw new AppError(404, 'AVAILABILITY_BLOCK_NOT_FOUND', 'Availability block not found')
  }

  if (error.code === 'AVAILABILITY_BLOCK_NOT_DELETABLE') {
    throw new AppError(409, 'AVAILABILITY_BLOCK_NOT_DELETABLE', 'Only future availability can be deleted')
  }

  if (error.code === 'AVAILABILITY_BLOCK_PROTECTED') {
    throw new AppError(409, 'AVAILABILITY_BLOCK_PROTECTED', 'Availability with appointment history cannot be deleted')
  }

  throw error
}

export function createAvailabilityService(repository = availabilityRepository, clock = () => new Date()) {
  function recurringRule(rule, materializedOccurrenceCount) {
    return {
      id: Number(rule.id ?? rule.rule_id),
      weekdays: (rule.weekdays ?? []).map(Number),
      startTime: rule.startTime ?? String(rule.start_time).slice(0, 5),
      endTime: rule.endTime ?? String(rule.end_time).slice(0, 5),
      startsOn: calendarDateString(rule.startsOn ?? rule.starts_on),
      endsOn: (rule.endsOn ?? rule.ends_on) == null
        ? null
        : calendarDateString(rule.endsOn ?? rule.ends_on),
      effectiveFee: optionalNumber(rule.fee ?? rule.effective_fee),
      status: rule.status,
      materializedThrough: (rule.materializedThrough ?? rule.materialized_through) == null
        ? null
        : calendarDateString(rule.materializedThrough ?? rule.materialized_through),
      materializedOccurrenceCount: Number(materializedOccurrenceCount),
    }
  }

  return {
    async listForDoctor(doctorId) {
      const now = clock()
      let rows

      try {
        rows = await repository.listForDoctor(doctorId, now)
      } catch (error) {
        translateDataError(error)
      }
      const blocksById = new Map()

      for (const row of rows) {
        const blockId = Number(row.block_id)
        let block = blocksById.get(blockId)

        if (!block) {
          block = {
            id: blockId,
            startAt: row.block_start_at,
            endAt: row.block_end_at,
            recurringRuleId: row.recurring_rule_id === null || row.recurring_rule_id === undefined
              ? null
              : Number(row.recurring_rule_id),
            effectiveFee: optionalNumber(row.effective_fee),
            slots: [],
            isProtected: false,
            canDelete: new Date(row.block_start_at) > now,
          }
          blocksById.set(blockId, block)
        }

        if (row.slot_id !== null && row.slot_id !== undefined) {
          const hasAppointmentHistory = Boolean(row.slot_has_appointment_history)
          block.slots.push({
            id: Number(row.slot_id),
            startAt: row.slot_start_at,
            endAt: row.slot_end_at,
            isActive: Boolean(row.slot_is_active),
            isBooked: Boolean(row.slot_is_booked),
            hasAppointmentHistory,
          })
          block.isProtected ||= hasAppointmentHistory
        }
      }

      for (const block of blocksById.values()) {
        block.canDelete &&= !block.isProtected
      }

      return { items: [...blocksById.values()] }
    },

    async create(doctorId, input) {
      const startAt = indiaInstant(input.date, input.startTime)
      const endAt = indiaInstant(input.date, input.endTime)

      if (startAt <= clock()) {
        throw new AppError(400, 'AVAILABILITY_IN_PAST', 'Availability must start in the future')
      }

      try {
        const result = await repository.create({
          doctorId,
          startAt,
          endAt,
          fee: input.fee ?? null,
        })

        return {
          id: Number(result.block.id),
          doctorId: Number(result.block.doctor_id),
          date: input.date,
          startAt: result.block.start_at,
          endAt: result.block.end_at,
          fee: optionalNumber(result.block.effective_fee),
          slots: result.slots.map(slot => ({
            id: Number(slot.id),
            startAt: slot.start_at,
            endAt: slot.end_at,
          })),
          createdAt: result.block.created_at,
          updatedAt: result.block.updated_at,
        }
      } catch (error) {
        translateDataError(error)
      }
    },

    async listRecurringForDoctor(doctorId) {
      try {
        const rows = await repository.listRecurringForDoctor(doctorId)
        return {
          items: rows.map(row => recurringRule(
            row,
            row.materializedOccurrenceCount ?? row.materialized_occurrence_count,
          )),
        }
      } catch (error) {
        translateDataError(error)
      }
    },

    async createRecurring(doctorId, input) {
      try {
        const result = await repository.createRecurring({
          doctorId,
          weekdays: input.weekdays,
          startTime: input.startTime,
          endTime: input.endTime,
          startsOn: input.startsOn,
          endsOn: input.endsOn ?? null,
          fee: input.fee ?? null,
        }, clock())

        return recurringRule(result.rule, result.materialized.length)
      } catch (error) {
        translateDataError(error)
      }
    },

    async stopRecurring(doctorId, ruleId) {
      try {
        await repository.stopRecurring({ doctorId, ruleId, now: clock() })
      } catch (error) {
        translateDataError(error)
      }
    },

    async remove(doctorId, blockId) {
      try {
        await repository.remove({ doctorId, blockId, now: clock() })
      } catch (error) {
        translateDataError(error)
      }
    },
  }
}

export const availabilityService = createAvailabilityService()
