import { recurringAvailabilityExtenderService } from '../services/recurring-availability-extender.service.js'

export const RECURRING_AVAILABILITY_EXTENSION_INTERVAL_MS = 24 * 60 * 60 * 1000

let activeJob = null

export function startRecurringAvailabilityExtender({
  extender = recurringAvailabilityExtenderService,
  intervalMs = RECURRING_AVAILABILITY_EXTENSION_INTERVAL_MS,
  logger = console,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  if (activeJob) return activeJob

  let running = false
  let stopped = false

  async function runSafely() {
    if (stopped || running) return null
    running = true
    try {
      const summary = await extender.extend()
      logger.log('Recurring availability extension completed', summary)
      return summary
    } catch (error) {
      logger.error('Recurring availability extension run failed', error)
      return null
    } finally {
      running = false
    }
  }

  const initialRun = runSafely()
  const timer = setIntervalFn(runSafely, intervalMs)
  timer.unref?.()

  const job = {
    initialRun,
    runNow: runSafely,
    stop() {
      if (stopped) return
      stopped = true
      clearIntervalFn(timer)
      if (activeJob === job) activeJob = null
    },
    timer,
  }

  activeJob = job
  return job
}
