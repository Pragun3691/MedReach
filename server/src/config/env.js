import { z } from 'zod'
import { createDatabaseConfig } from './database.js'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  DATABASE_SSL_CA: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  JAAS_APP_ID: z.string().optional(),
  JAAS_API_KEY_ID: z.string().optional(),
  JAAS_PRIVATE_KEY_BASE64: z.string().optional(),
  JAAS_TOKEN_TTL_SECONDS: z.string().optional(),
})

export function parseEnvironment(values) {
  const result = envSchema.safeParse(values)
  if (!result.success) {
    const fields = result.error.issues.map(issue => issue.path.join('.')).join(', ')
    throw new Error(`Invalid server environment fields: ${fields}`)
  }
  if (result.data.DATABASE_URL) createDatabaseConfig(result.data)
  return Object.freeze(result.data)
}

export const env = parseEnvironment(process.env)
