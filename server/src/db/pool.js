import pg from 'pg'
import { env } from '../config/env.js'
import { createDatabaseConfig } from '../config/database.js'

const { Pool } = pg
let pool

export function getPool() {
  if (!pool) {
    pool = new Pool(createDatabaseConfig(env))
  }

  return pool
}

export async function closePool() {
  if (pool) {
    await pool.end()
    pool = undefined
  }
}
