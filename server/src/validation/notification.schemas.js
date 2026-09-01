import { z } from 'zod'

export const notificationIdSchema = z.coerce.number().int().positive()

export const notificationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})
