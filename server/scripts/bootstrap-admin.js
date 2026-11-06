import { bootstrapAdmin } from '../src/services/admin-bootstrap.service.js'
import { closePool, getPool } from '../src/db/pool.js'
import { pathToFileURL } from 'node:url'
import { ZodError } from 'zod'

const validationFields = new Set(['fullName', 'email', 'password'])
const validationRules = new Set(['invalid_type', 'too_small', 'too_big', 'invalid_format', 'unrecognized_keys'])

export async function runAdminBootstrap({ args = process.argv.slice(2), input = process.stdin, logger = console } = {}) {
  if (args.length === 1 && args[0] === '--help') {
    logger.log('Explicit Admin creation: inject the intended DATABASE_URL, then pipe a JSON object with fullName, email and password to node scripts/bootstrap-admin.js --confirm-create-admin. Never put passwords in command arguments or files. Existing accounts are never promoted. See docs/doctor-verification.md.')
    return 0
  }
  if (args.length !== 1 || args[0] !== '--confirm-create-admin' || input.isTTY) {
    logger.error('Refusing Admin creation. Use --help for the explicit, piped-input procedure.')
    return 1
  }

  let stage = 'unexpected_failure'
  let exitCode = 0
  let text = ''
  try {
    input.setEncoding('utf8')
    for await (const chunk of input) {
      text += chunk
      if (Buffer.byteLength(text) > 16384) {
        stage = 'input_too_large'
        throw new Error('Input too large')
      }
    }
    stage = 'invalid_json'
    const value = JSON.parse(text)
    text = ''
    // The service validates and hashes before requesting its database provider.
    stage = 'password_hashing_failed'
    await bootstrapAdmin(value, () => {
      stage = 'database_failed'
      return getPool()
    })
    logger.log('Admin account created. No credentials are printed.')
  } catch (error) {
    const report = { error: stage }
    if (stage === 'password_hashing_failed' && error instanceof ZodError) {
      report.error = 'validation_failed'
      report.issues = error.issues.map(issue => ({
        field: issue.path.length === 1 && validationFields.has(issue.path[0]) ? issue.path[0] : 'input',
        rule: validationRules.has(issue.code) ? issue.code : 'invalid_value',
      }))
    }
    logger.error(JSON.stringify(report))
    exitCode = 1
  } finally {
    text = ''
    try {
      await closePool()
    } catch {
      logger.error(JSON.stringify({ error: 'database_cleanup_failed' }))
      exitCode = 1
    }
  }
  return exitCode
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runAdminBootstrap()
}
