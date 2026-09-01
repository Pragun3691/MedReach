import { z } from 'zod'

export const appointmentIdSchema = z.coerce.number().int().positive()

export const bookingSchema = z.object({
  slotId: z.number().int().positive(),
}).strict()

export const cancellationSchema = z.object({
  reason: z.string().trim().min(1).max(1000).optional(),
}).strict()

export const rescheduleSchema = bookingSchema
