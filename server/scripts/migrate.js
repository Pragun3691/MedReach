import { runMigrationCommand } from '../src/db/migrate.js'

const args = process.argv.slice(2)
if (args.length === 1 && args[0] === '--help') {
  console.log('Usage: node scripts/migrate.js up|down|production. Production applies all pending upward migrations using injected environment variables.')
} else if (args.length !== 1 || !['up', 'down', 'production'].includes(args[0])) {
  console.error('Expected one migration action: up, down or production')
  process.exitCode = 1
} else {
  process.exitCode = await runMigrationCommand({
    direction: args[0] === 'down' ? 'down' : 'up',
    production: args[0] === 'production',
  })
}
