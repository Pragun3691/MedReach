import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  SESSION_SECRET: z.string().min(32).optional(),
})

const result = envSchema.safeParse(process.env)

if (!result.success) {
  throw new Error(`Invalid server environment: ${result.error.message}`)
}

export const env = Object.freeze(result.data)
