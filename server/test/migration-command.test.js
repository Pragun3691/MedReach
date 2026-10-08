import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createDatabaseConfig } from '../src/config/database.js'
import { runMigrationCommand } from '../src/db/migrate.js'

const execute = promisify(execFile)
const script = fileURLToPath(new URL('../scripts/migrate.js', import.meta.url))
const environment = {
  DATABASE_URL: 'postgresql://fixture:fixture-password@postgres.railway.internal/medreach_fixture',
  DATABASE_SSL: 'false',
}
let fixture
let emptyDirectory

beforeAll(async () => {
  fixture = await mkdtemp(join(tmpdir(), 'medreach-migration-command-'))
  emptyDirectory = join(fixture, 'empty')
  await mkdir(emptyDirectory)
  await writeFile(join(fixture, '.env'), 'DATABASE_URL=postgresql://dotenv-user:dotenv-password@never-connect.invalid/fixture\n')
})
afterAll(async () => { if (fixture) await rm(fixture, { recursive: true, force: true }) })

function context() {
  return { environment, production: true, migrationRunner: vi.fn().mockResolvedValue([{ name: 'fixture-migration' }]), logger: { info: vi.fn(), error: vi.fn() } }
}

describe('production migration command (mock runner, no database)', () => {
  it('runs every pending upward migration with shared settings, locking and transactions', async () => {
    const options = context()
    expect(await runMigrationCommand(options)).toBe(0)
    expect(options.migrationRunner).toHaveBeenCalledOnce()
    const invocation = options.migrationRunner.mock.calls[0][0]
    expect(invocation).toMatchObject({
      databaseUrl: createDatabaseConfig({ ...environment, NODE_ENV: 'production' }),
      schema: 'public', migrationsTable: 'pgmigrations', direction: 'up',
      checkOrder: true, singleTransaction: true, noLock: false, fake: false, dryRun: false,
    })
    expect(invocation.dir.replaceAll('\\', '/')).toMatch(/\/server\/migrations\/$/)
    expect(invocation.count).toBeUndefined()
    expect(options.logger.info).toHaveBeenLastCalledWith('Database migrations complete: 1 applied.')
  })

  it('passes the same verified external TLS settings used by the application', async () => {
    const options = context()
    options.environment = { DATABASE_URL: 'postgresql://fixture:fixture-password@db.example.com/fixture', DATABASE_SSL: 'true' }
    expect(await runMigrationCommand(options)).toBe(0)
    expect(options.migrationRunner.mock.calls[0][0].databaseUrl)
      .toEqual(createDatabaseConfig({ ...options.environment, NODE_ENV: 'production' }))
  })

  it('fails on missing DATABASE_URL without calling the runner', async () => {
    const options = { ...context(), environment: {} }
    expect(await runMigrationCommand(options)).toBe(1)
    expect(options.migrationRunner).not.toHaveBeenCalled()
    expect(options.logger.error).toHaveBeenCalledWith('DATABASE_URL is required for database operations')
  })

  it.each([
    { DATABASE_URL: 'not-a-url-containing-secret' },
    { DATABASE_URL: environment.DATABASE_URL, DATABASE_SSL: 'no-verify' },
    { DATABASE_URL: 'postgresql://fixture:secret@db.example.com/fixture', DATABASE_SSL: 'false' },
  ])('fails closed on invalid or insecure injected settings', async invalidEnvironment => {
    const options = { ...context(), environment: invalidEnvironment }
    expect(await runMigrationCommand(options)).toBe(1)
    expect(options.migrationRunner).not.toHaveBeenCalled()
    expect(JSON.stringify(options.logger.error.mock.calls)).not.toContain('secret')
  })

  it.each(['down', 'redo', 'seed', 'reset'])('refuses production action %s before calling the runner', async direction => {
    const options = { ...context(), direction }
    expect(await runMigrationCommand(options)).toBe(1)
    expect(options.migrationRunner).not.toHaveBeenCalled()
  })

  it('preserves local downward migration support', async () => {
    const options = { ...context(), environment: { DATABASE_URL: 'postgresql://fixture:fixture@localhost/fixture' }, production: false, direction: 'down' }
    expect(await runMigrationCommand(options)).toBe(0)
    expect(options.migrationRunner.mock.calls[0][0].direction).toBe('down')
  })

  it.each(['empty', 'missing'])('fails instead of skipping migrations when the directory is %s', async kind => {
    const options = { ...context(), directory: kind === 'empty' ? emptyDirectory : join(fixture, 'missing') }
    expect(await runMigrationCommand(options)).toBe(1)
    expect(options.migrationRunner).not.toHaveBeenCalled()
  })

  it('reports an already-current schema explicitly', async () => {
    const options = context()
    options.migrationRunner.mockResolvedValue([])
    expect(await runMigrationCommand(options)).toBe(0)
    expect(options.logger.info).toHaveBeenLastCalledWith('Database migrations complete: 0 applied (already current).')
  })

  it('returns failure and suppresses SQL and credentials from runner errors', async () => {
    const options = context()
    options.migrationRunner.mockImplementation(async invocation => {
      invocation.logger.error(`Connection failed for ${environment.DATABASE_URL}`)
      invocation.logger.warn('SQL containing fixture-password')
      throw new Error(`Migration failed for ${environment.DATABASE_URL}`)
    })
    expect(await runMigrationCommand(options)).toBe(1)
    expect(options.logger.error).toHaveBeenCalledOnce()
    expect(JSON.stringify(options.logger.error.mock.calls)).not.toContain('fixture-password')
    expect(JSON.stringify(options.logger.error.mock.calls)).not.toContain(environment.DATABASE_URL)
  })

  it('loads the packaged runner for --help without connecting', async () => {
    const result = await execute(process.execPath, [script, '--help'], { cwd: fixture, env: { PATH: process.env.PATH } })
    expect(result.stdout).toContain('up|down|production')
  })

  it('exits nonzero without injected DATABASE_URL and ignores a physical .env', async () => {
    const result = await execute(process.execPath, [script, 'production'], { cwd: fixture, env: { PATH: process.env.PATH } })
      .then(value => ({ ...value, code: 0 }), error => ({ code: error.code, stdout: error.stdout, stderr: error.stderr }))
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('DATABASE_URL is required')
    expect(result.stdout).not.toContain('complete')
    expect(result.stderr).not.toContain('dotenv-password')
  })

  it('exits nonzero for unsupported CLI options without connecting', async () => {
    const result = await execute(process.execPath, [script, 'production', '--fake'], { env: { PATH: process.env.PATH } })
      .then(() => ({ code: 0 }), error => ({ code: error.code, stderr: error.stderr }))
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('Expected one migration action')
  })
})
