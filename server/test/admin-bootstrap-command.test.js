import { Readable } from 'node:stream'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ hashPassword: vi.fn(), getPool: vi.fn(), query: vi.fn(), closePool: vi.fn() }))
vi.mock('../src/security/password.js', () => ({ hashPassword: mocks.hashPassword }))
vi.mock('../src/db/pool.js', () => ({ getPool: mocks.getPool, closePool: mocks.closePool }))

import { runAdminBootstrap } from '../scripts/bootstrap-admin.js'

const fixture = { fullName: 'Bootstrap Test Identity', email: 'bootstrap@example.test', password: 'test-only-password-sentinel' }
const hash = 'test-only-hash-sentinel'
const connection = 'postgresql://private-user:private-password@private.invalid/private-database'
const sensitiveError = `${fixture.fullName} ${fixture.email} ${fixture.password} ${hash} ${connection}`

beforeEach(() => {
  vi.resetAllMocks()
  mocks.hashPassword.mockResolvedValue(hash)
  mocks.getPool.mockReturnValue({ query: mocks.query })
  mocks.query.mockResolvedValue({ rowCount: 1 })
  mocks.closePool.mockResolvedValue(undefined)
})

function context(text = JSON.stringify(fixture)) {
  return { args: ['--confirm-create-admin'], input: Readable.from([text]), logger: { log: vi.fn(), error: vi.fn() } }
}

function reports(options) {
  return options.logger.error.mock.calls.map(([message]) => JSON.parse(message))
}

function expectNoLeaks(options) {
  const output = JSON.stringify([...options.logger.log.mock.calls, ...options.logger.error.mock.calls])
  for (const secret of [fixture.fullName, fixture.email, fixture.password, hash, connection, 'private-password']) {
    expect(output).not.toContain(secret)
  }
}

describe('Admin bootstrap command (mock hashing and database, no account creation)', () => {
  it.each([
    ['short name', { fullName: ' ' }, 'fullName', 'too_small'],
    ['long name', { fullName: 'x'.repeat(121) }, 'fullName', 'too_big'],
    ['invalid email', { email: 'invalid-email' }, 'email', 'invalid_format'],
    ['short password', { password: 'short' }, 'password', 'too_small'],
    ['long password', { password: 'x'.repeat(129) }, 'password', 'too_big'],
    ['wrong password type', { password: {} }, 'password', 'invalid_type'],
  ])('reports only field and rule for %s', async (_label, changes, field, rule) => {
    const options = context(JSON.stringify({ ...fixture, ...changes }))
    expect(await runAdminBootstrap(options)).toBe(1)
    expect(reports(options)).toEqual([{ error: 'validation_failed', issues: [{ field, rule }] }])
    expect(mocks.hashPassword).not.toHaveBeenCalled()
    expect(mocks.getPool).not.toHaveBeenCalled()
    expect(mocks.closePool).toHaveBeenCalledOnce()
    expectNoLeaks(options)
  })

  it.each(['null', '[]', '42', '{}'])('rejects invalid input shape %s before hashing or querying', async text => {
    const options = context(text)
    expect(await runAdminBootstrap(options)).toBe(1)
    expect(reports(options)[0].error).toBe('validation_failed')
    expect(mocks.hashPassword).not.toHaveBeenCalled()
    expect(mocks.query).not.toHaveBeenCalled()
    expectNoLeaks(options)
  })

  it('does not disclose unexpected object keys, even if they contain secrets', async () => {
    const options = context(JSON.stringify({ ...fixture, [sensitiveError]: 'unexpected value' }))
    expect(await runAdminBootstrap(options)).toBe(1)
    expect(reports(options)).toEqual([{ error: 'validation_failed', issues: [{ field: 'input', rule: 'unrecognized_keys' }] }])
    expect(mocks.query).not.toHaveBeenCalled()
    expectNoLeaks(options)
  })

  it.each(['', '{', `{"password":"${fixture.password}" trailing`, `"${connection}" trailing`])('suppresses invalid JSON contents', async text => {
    const options = context(text)
    expect(await runAdminBootstrap(options)).toBe(1)
    expect(reports(options)).toEqual([{ error: 'invalid_json' }])
    expect(mocks.hashPassword).not.toHaveBeenCalled()
    expect(mocks.query).not.toHaveBeenCalled()
    expectNoLeaks(options)
  })

  it('retains the byte limit before parsing or hashing', async () => {
    const options = context('é'.repeat(8193))
    expect(await runAdminBootstrap(options)).toBe(1)
    expect(reports(options)).toEqual([{ error: 'input_too_large' }])
    expect(mocks.hashPassword).not.toHaveBeenCalled()
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('sanitizes unexpected input stream failures and still closes the pool', async () => {
    const options = context()
    options.input = new Readable({ read() { this.destroy(new Error(sensitiveError)) } })
    expect(await runAdminBootstrap(options)).toBe(1)
    expect(reports(options)).toEqual([{ error: 'unexpected_failure' }])
    expect(mocks.query).not.toHaveBeenCalled()
    expect(mocks.closePool).toHaveBeenCalledOnce()
    expectNoLeaks(options)
  })

  it('distinguishes hashing failures without exposing their messages', async () => {
    mocks.hashPassword.mockRejectedValue(new Error(sensitiveError))
    const options = context()
    expect(await runAdminBootstrap(options)).toBe(1)
    expect(reports(options)).toEqual([{ error: 'password_hashing_failed' }])
    expect(mocks.getPool).not.toHaveBeenCalled()
    expectNoLeaks(options)
  })

  it('distinguishes database-provider failures without exposing their messages', async () => {
    mocks.getPool.mockImplementation(() => { throw new Error(sensitiveError) })
    const options = context()
    expect(await runAdminBootstrap(options)).toBe(1)
    expect(reports(options)).toEqual([{ error: 'database_failed' }])
    expect(mocks.query).not.toHaveBeenCalled()
    expectNoLeaks(options)
  })

  it.each([
    Object.assign(new Error(sensitiveError), { code: '23505', detail: sensitiveError, constraint: sensitiveError }),
    new SyntaxError(sensitiveError),
    sensitiveError,
    null,
  ])('sanitizes database rejections, including non-Error values', async error => {
    mocks.query.mockRejectedValue(error)
    const options = context()
    expect(await runAdminBootstrap(options)).toBe(1)
    expect(reports(options)).toEqual([{ error: 'database_failed' }])
    expect(mocks.query).toHaveBeenCalledOnce()
    expect(mocks.closePool).toHaveBeenCalledOnce()
    expectNoLeaks(options)
  })

  it('sanitizes cleanup failures instead of allowing an unhandled rejection', async () => {
    mocks.query.mockRejectedValue(new Error(sensitiveError))
    mocks.closePool.mockRejectedValue(new Error(sensitiveError))
    const options = context()
    expect(await runAdminBootstrap(options)).toBe(1)
    expect(reports(options)).toEqual([{ error: 'database_failed' }, { error: 'database_cleanup_failed' }])
    expectNoLeaks(options)
  })

  it.each([[], ['--confirm-create-admin', '--extra'], ['--other']])('retains explicit confirmation requirement for %j', async args => {
    const options = { ...context(), args }
    expect(await runAdminBootstrap(options)).toBe(1)
    expect(options.logger.error).toHaveBeenCalledWith('Refusing Admin creation. Use --help for the explicit, piped-input procedure.')
    expect(mocks.hashPassword).not.toHaveBeenCalled()
    expect(mocks.getPool).not.toHaveBeenCalled()
    expectNoLeaks(options)
  })

  it('still refuses interactive echoed input', async () => {
    const options = context()
    options.input.isTTY = true
    expect(await runAdminBootstrap(options)).toBe(1)
    expect(mocks.hashPassword).not.toHaveBeenCalled()
    expect(mocks.getPool).not.toHaveBeenCalled()
  })

  it('provides help without reading input, hashing or connecting', async () => {
    const options = { ...context(), args: ['--help'] }
    expect(await runAdminBootstrap(options)).toBe(0)
    expect(options.logger.log).toHaveBeenCalledOnce()
    expect(mocks.hashPassword).not.toHaveBeenCalled()
    expect(mocks.getPool).not.toHaveBeenCalled()
    expect(mocks.closePool).not.toHaveBeenCalled()
  })

  it('preserves validation, normalization, hashing and the single fixed-role INSERT', async () => {
    const options = context(JSON.stringify({ ...fixture, fullName: ` ${fixture.fullName} `, email: ` ${fixture.email.toUpperCase()} ` }))
    expect(await runAdminBootstrap(options)).toBe(0)
    expect(mocks.hashPassword).toHaveBeenCalledExactlyOnceWith(fixture.password)
    expect(mocks.query).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("VALUES ($1, $2, $3, 'admin')"), [fixture.fullName, fixture.email, hash])
    expect(mocks.closePool).toHaveBeenCalledOnce()
    expect(options.logger.error).not.toHaveBeenCalled()
    expect(options.logger.log).toHaveBeenCalledWith('Admin account created. No credentials are printed.')
    expectNoLeaks(options)
  })
})

describe('Admin bootstrap CLI entry point (invalid input only, no database)', () => {
  it.each([
    [`{"password":"${fixture.password}" trailing`, { error: 'invalid_json' }],
    [JSON.stringify({ ...fixture, password: 'short' }), { error: 'validation_failed', issues: [{ field: 'password', rule: 'too_small' }] }],
  ])('returns a sanitized diagnostic and nonzero exit status', async (input, expected) => {
    const script = fileURLToPath(new URL('../scripts/bootstrap-admin.js', import.meta.url))
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script, '--confirm-create-admin'], {
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_ENV: 'test' },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      let stdout = '', stderr = ''
      child.stdout.on('data', chunk => { stdout += chunk })
      child.stderr.on('data', chunk => { stderr += chunk })
      child.on('error', reject)
      child.on('close', code => resolve({ code, stdout, stderr }))
      child.stdin.end(input)
    })
    expect(result.code).toBe(1)
    expect(result.stdout).toBe('')
    expect(JSON.parse(result.stderr)).toEqual(expected)
    for (const secret of [fixture.fullName, fixture.email, fixture.password]) expect(result.stderr).not.toContain(secret)
  })
})
