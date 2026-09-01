import connectPgSimple from 'connect-pg-simple'
import session from 'express-session'
import { env } from '../config/env.js'
import { getPool } from '../db/pool.js'

export const sessionCookieName = 'medreach.sid'
export const sessionMaxAge = 24 * 60 * 60 * 1000

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    maxAge: sessionMaxAge,
    path: '/',
  }
}

function createPostgresSessionStore() {
  const PgSessionStore = connectPgSimple(session)

  return new PgSessionStore({
    pool: getPool(),
    tableName: 'user_sessions',
    createTableIfMissing: false,
  })
}

export function createSessionMiddleware({ store, secret } = {}) {
  const resolvedSecret = secret
    ?? env.SESSION_SECRET
    ?? (env.NODE_ENV === 'test' ? 'medreach-test-session-secret-not-for-production' : undefined)

  if (!resolvedSecret) {
    throw new Error('SESSION_SECRET is required outside the test environment')
  }

  const resolvedStore = store
    ?? (env.NODE_ENV === 'test' && !env.DATABASE_URL ? undefined : createPostgresSessionStore())

  return session({
    name: sessionCookieName,
    secret: resolvedSecret,
    store: resolvedStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: sessionCookieOptions(),
  })
}
