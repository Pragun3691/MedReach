import { createApp } from './app.js'
import { env } from './config/env.js'
import { startRecurringAvailabilityExtender } from './jobs/recurring-availability-extender.job.js'

const app = createApp()
let recurringAvailabilityExtender
const server = app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`MedReach API listening on port ${env.PORT}`)
  recurringAvailabilityExtender = startRecurringAvailabilityExtender()
})

function shutdown(signal) {
  console.log(`${signal} received. Closing MedReach API.`)
  recurringAvailabilityExtender?.stop()
  server.close((error) => {
    if (error) {
      console.error(error)
      process.exit(1)
    }

    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
