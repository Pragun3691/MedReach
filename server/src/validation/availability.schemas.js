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
