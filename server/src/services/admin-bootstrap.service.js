import { z } from 'zod'
import { getPool } from '../db/pool.js'
import { hashPassword } from '../security/password.js'

const adminInput = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  password: z.string().min(12).max(128),
}).strict()

export async function bootstrapAdmin(input, databaseProvider = getPool) {
  const value = adminInput.parse(input)
  const passwordHash = await hashPassword(value.password)
  // Insert only. Never promote or overwrite an existing account.
  await databaseProvider().query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')`,
    [value.fullName, value.email, passwordHash],
  )
}
