import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ pool: vi.fn(), end: vi.fn(), store: vi.fn(), session: vi.fn() }))
vi.mock('pg', () => ({
  default: { Pool: class {
    constructor(configuration) { mocks.pool(configuration) }
    end() { return mocks.end() }
  } },
}))
vi.mock('connect-pg-simple', () => ({ default: () => class {
  constructor(configuration) { mocks.store(configuration) }
} }))
vi.mock('express-session', () => ({ default: configuration => mocks.session(configuration) }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  vi.resetModules()
})

describe('shared database Pool and PostgreSQL session connection', () => {
  it('uses one verified Pool for application queries and session storage', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DATABASE_URL', 'postgresql://fixture:fixture@db.example.com/medreach_fixture')
    vi.stubEnv('DATABASE_SSL', 'true')
    const { getPool, closePool } = await import('../src/db/pool.js')
    const { createSessionMiddleware } = await import('../src/session/session.js')
    const pool = getPool()
    createSessionMiddleware({ secret: 'fixture-session-secret-at-least-32-characters' })
    expect(getPool()).toBe(pool)
    expect(mocks.pool).toHaveBeenCalledExactlyOnceWith({
      connectionString: 'postgresql://fixture:fixture@db.example.com/medreach_fixture',
      ssl: { rejectUnauthorized: true },
    })
    expect(mocks.store).toHaveBeenCalledExactlyOnceWith({ pool, tableName: 'user_sessions', createTableIfMissing: false })
    expect(mocks.session.mock.calls[0][0].cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax' })
    await closePool()
    expect(mocks.end).toHaveBeenCalledOnce()
  })

  it('fails without DATABASE_URL before constructing a Pool', async () => {
    vi.stubEnv('DATABASE_URL', undefined)
    const { getPool } = await import('../src/db/pool.js')
    expect(() => getPool()).toThrow('DATABASE_URL is required')
    expect(mocks.pool).not.toHaveBeenCalled()
  })
})
