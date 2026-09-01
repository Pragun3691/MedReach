import { z } from 'zod'

function isValidCalendarDate(value) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))

  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  )
}

export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD')
  .refine(isValidCalendarDate, 'Date must be a valid calendar date')

export const doctorIdSchema = z.coerce.number().int().positive()

export const doctorSearchQuerySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  specialization: z.string().trim().min(1).max(100).optional(),
  problem: z.string().trim().min(1).max(100).optional(),
  date: calendarDateSchema.optional(),
  maxFee: z.coerce.number().min(0).max(100000).optional(),
  minExperience: z.coerce.number().int().min(0).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0),
})

export const doctorSlotsQuerySchema = z.object({
  date: calendarDateSchema,
})
