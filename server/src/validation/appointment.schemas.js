import { z } from 'zod'

export const appointmentIdSchema = z.coerce.number().int().positive()

export const bookingSchema = z.object({
  slotId: z.number().int().positive(),
}).strict()

export const cancellationSchema = z.object({
  reason: z.string().trim().min(1).max(1000).optional(),
}).strict()

export const rescheduleSchema = bookingSchema

const prescriptionItemSchema = z.object({
  medicineName: z.string().trim().min(1).max(200),
  dosage: z.string().trim().min(1).max(120),
  frequency: z.string().trim().min(1).max(120),
  duration: z.string().trim().min(1).max(120),
  instructions: z.string().trim().max(1000).optional().default(''),
}).strict()

const followUpSchema = z.object({
  interval: z.number().int().min(1).max(365),
  unit: z.enum(['days', 'weeks']),
}).strict().nullable()

export const clinicalDraftSchema = z.object({
  notes: z.string().max(20000),
  prescriptionItems: z.array(prescriptionItemSchema).max(30),
  followUp: followUpSchema,
}).strict()
