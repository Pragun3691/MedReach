import pg from 'pg'
import { env } from '../config/env.js'

const { Pool } = pg
let pool

export function getPool() {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for database operations')
  }

  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    })
  }

  return pool
}

export async function closePool() {
  if (pool) {
    await pool.end()
    pool = undefined
  }
}
