import { z } from 'zod'
import { calendarDateSchema } from './public-doctor.schemas.js'

function minutesSinceMidnight(value) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

const halfHourTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):(?:00|30)$/, 'Time must use HH:mm on a 30-minute boundary')

export const createAvailabilitySchema = z.object({
  date: calendarDateSchema,
  startTime: halfHourTimeSchema,
  endTime: halfHourTimeSchema,
  fee: z.number().finite().nonnegative().max(99999999.99).optional(),
}).strict().superRefine((input, context) => {
  if (!halfHourTimeSchema.safeParse(input.startTime).success
    || !halfHourTimeSchema.safeParse(input.endTime).success) return

  const startMinutes = minutesSinceMidnight(input.startTime)
  const endMinutes = minutesSinceMidnight(input.endTime)

  if (endMinutes <= startMinutes) {
    context.addIssue({
      code: 'custom',
      path: ['endTime'],
      message: 'End time must be after start time',
    })
    return
  }

  if ((endMinutes - startMinutes) % 30 !== 0) {
    context.addIssue({
      code: 'custom',
      path: ['endTime'],
      message: 'Duration must be divisible by 30 minutes',
    })
  }
})

export const createRecurringAvailabilitySchema = z.object({
  weekdays: z.array(z.number().int().min(1).max(7)).min(1),
  startTime: halfHourTimeSchema,
  endTime: halfHourTimeSchema,
  startsOn: calendarDateSchema,
  endsOn: calendarDateSchema.nullable().optional(),
  fee: z.number().finite().nonnegative().max(99999999.99).optional(),
}).strict().superRefine((input, context) => {
  if (halfHourTimeSchema.safeParse(input.startTime).success
    && halfHourTimeSchema.safeParse(input.endTime).success
    && minutesSinceMidnight(input.endTime) <= minutesSinceMidnight(input.startTime)) {
    context.addIssue({
      code: 'custom',
      path: ['endTime'],
      message: 'End time must be after start time',
    })
  }

  if (input.endsOn != null
    && calendarDateSchema.safeParse(input.startsOn).success
    && calendarDateSchema.safeParse(input.endsOn).success
    && input.endsOn < input.startsOn) {
    context.addIssue({
      code: 'custom',
      path: ['endsOn'],
      message: 'End date must not be before start date',
    })
  }
})

export const createAvailabilityExceptionSchema = z.object({
  date: calendarDateSchema.optional(),
  startDate: calendarDateSchema.optional(),
  endDate: calendarDateSchema.optional(),
  allDay: z.boolean(),
  startTime: halfHourTimeSchema.optional(),
  endTime: halfHourTimeSchema.optional(),
}).strict().superRefine((input, context) => {
  const isRange = input.startDate !== undefined || input.endDate !== undefined

  if (isRange) {
    if (input.startDate === undefined) {
      context.addIssue({ code: 'custom', path: ['startDate'], message: 'Start date is required' })
    }
    if (input.endDate === undefined) {
      context.addIssue({ code: 'custom', path: ['endDate'], message: 'End date is required' })
    }
    if (!input.allDay) {
      context.addIssue({ code: 'custom', path: ['allDay'], message: 'Date ranges must be all day' })
    }
    for (const field of ['date', 'startTime', 'endTime']) {
      if (input[field] !== undefined) {
        context.addIssue({ code: 'custom', path: [field], message: `${field} is not allowed for a date range` })
      }
    }
    if (input.startDate !== undefined && input.endDate !== undefined) {
      const start = new Date(`${input.startDate}T00:00:00.000Z`)
      const end = new Date(`${input.endDate}T00:00:00.000Z`)
      const inclusiveDays = Math.floor((end - start) / 86400000) + 1

      if (inclusiveDays < 2) {
        context.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be after start date' })
      } else if (inclusiveDays > 31) {
        context.addIssue({ code: 'custom', path: ['endDate'], message: 'Time off range cannot exceed 31 calendar days' })
      }
    }
    return
  }

  if (input.date === undefined) {
    context.addIssue({ code: 'custom', path: ['date'], message: 'Date is required' })
  }
  if (input.allDay) {
    if (input.startTime !== undefined || input.endTime !== undefined) {
      context.addIssue({ code: 'custom', path: [], message: 'All-day time off cannot include times' })
    }
    return
  }
  if (input.startTime === undefined) {
    context.addIssue({ code: 'custom', path: ['startTime'], message: 'Start time is required' })
  }
  if (input.endTime === undefined) {
    context.addIssue({ code: 'custom', path: ['endTime'], message: 'End time is required' })
  }
  if (input.startTime !== undefined
    && input.endTime !== undefined
    && minutesSinceMidnight(input.endTime) <= minutesSinceMidnight(input.startTime)) {
    context.addIssue({ code: 'custom', path: ['endTime'], message: 'End time must be after start time' })
  }
})

export const availabilityBlockIdSchema = z.coerce.number().int().positive()
export const recurringAvailabilityRuleIdSchema = z.coerce.number().int().positive()
export const availabilityExceptionIdSchema = z.coerce.number().int().positive()
export const availabilityExceptionRangeIdSchema = z.string().uuid()
