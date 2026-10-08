import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { runner } from 'node-pg-migrate'
import { createDatabaseConfig, DatabaseConfigurationError } from '../config/database.js'
import { parseEnvironment } from '../config/env.js'

const migrationsDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url))

export async function runMigrationCommand({
  environment = process.env,
  direction = 'up',
  production = false,
  directory = migrationsDirectory,
  migrationRunner = runner,
  logger = console,
} = {}) {
  try {
    const configuration = parseEnvironment(production ? { ...environment, NODE_ENV: 'production' } : environment)
    if (!['up', 'down'].includes(direction) || (configuration.NODE_ENV === 'production' && direction !== 'up')) {
      throw new DatabaseConfigurationError('Production migrations only support up; local migrations support up or down')
    }
    const databaseUrl = createDatabaseConfig(configuration)
    const files = await readdir(directory, { withFileTypes: true })
    if (!files.some(file => file.isFile() && /^\d+_.+\.(?:js|sql)$/.test(file.name))) {
      throw new DatabaseConfigurationError('No migration files found; refusing to skip database migrations')
    }

    logger.info('Checking database migrations...')
    // The upstream logger can print SQL and connection errors. Emit only safe summaries.
    const quietLogger = { debug() {}, info() {}, warn() {}, error() {} }
    const applied = await migrationRunner({
      databaseUrl,
      dir: directory,
      schema: 'public',
      migrationsTable: 'pgmigrations',
      direction,
      checkOrder: true,
      singleTransaction: true,
      noLock: false,
      fake: false,
      dryRun: false,
      verbose: false,
      logger: quietLogger,
    })
    logger.info(`Database migrations complete: ${applied.length} applied${applied.length === 0 ? ' (already current)' : ''}.`)
    return 0
  } catch (error) {
    logger.error(error instanceof DatabaseConfigurationError
      ? error.message
      : 'Database migration failed. Check server environment, connectivity, certificates, migration order and schema permissions; connection details are withheld.')
    return 1
  }
}
