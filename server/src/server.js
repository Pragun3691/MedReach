import { createApp } from './app.js'
import { env } from './config/env.js'

const app = createApp()
const server = app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`MedReach API listening on port ${env.PORT}`)
})

function shutdown(signal) {
  console.log(`${signal} received. Closing MedReach API.`)
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
