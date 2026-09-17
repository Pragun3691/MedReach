import { describe, expect, it, vi } from 'vitest'
import { AvailabilityDataError } from '../src/data-access/availability.repository.js'
import {
  RECURRING_AVAILABILITY_EXTENSION_INTERVAL_MS,
  startRecurringAvailabilityExtender,
} from '../src/jobs/recurring-availability-extender.job.js'
import { createRecurringAvailabilityExtenderService } from '../src/services/recurring-availability-extender.service.js'

const now = new Date('2026-09-18T00:00:00.000Z')

describe('recurring availability extender service', () => {
  it('extends eligible rules sequentially and skips rules already evaluated through their target', async () => {
    const calls = []
    let active = 0
    let maximumActive = 0
    const repository = {
      async listRecurringRulesForExtension(currentTime) {
        expect(currentTime).toBe(now)
        return [
          { rule_id: '1', doctor_id: '10', needs_extension: true },
          { rule_id: '2', doctor_id: '10', needs_extension: false },
          { rule_id: '3', doctor_id: '20', needs_extension: true },
        ]
      },
      async materializeRecurring(input, currentTime) {
        active += 1
        maximumActive = Math.max(maximumActive, active)
        calls.push({ input, currentTime })
        await Promise.resolve()
        active -= 1
      },
    }
    const service = createRecurringAvailabilityExtenderService({ repository, clock: () => now })

    await expect(service.extend()).resolves.toEqual({ scanned: 3, extended: 2, skipped: 1, failed: 0 })
    expect(calls).toEqual([
      { input: { doctorId: 10, ruleId: 1 }, currentTime: now },
      { input: { doctorId: 20, ruleId: 3 }, currentTime: now },
    ])
    expect(maximumActive).toBe(1)
  })

  it('isolates a broken rule and continues extending later rules', async () => {
    const logger = { error: vi.fn() }
    const materialized = []
    const repository = {
      async listRecurringRulesForExtension() {
        return [
          { rule_id: '1', doctor_id: '10', needs_extension: true },
          { rule_id: '2', doctor_id: '20', needs_extension: true },
        ]
      },
      async materializeRecurring({ ruleId }) {
        if (ruleId === 1) throw new Error('simulated broken rule')
        materialized.push(ruleId)
      },
    }
    const service = createRecurringAvailabilityExtenderService({ repository, clock: () => now, logger })

    await expect(service.extend()).resolves.toEqual({ scanned: 2, extended: 1, skipped: 0, failed: 1 })
    expect(materialized).toEqual([2])
    expect(logger.error).toHaveBeenCalledWith(
      'Recurring availability extension failed',
      expect.objectContaining({ doctorId: 10, ruleId: 1, error: expect.any(Error) }),
    )
  })

  it('treats a rule stopped after scanning as a safe skip', async () => {
    const logger = { error: vi.fn() }
    const repository = {
      async listRecurringRulesForExtension() {
        return [{ rule_id: '1', doctor_id: '10', needs_extension: true }]
      },
      async materializeRecurring() {
        throw new AvailabilityDataError('RECURRING_AVAILABILITY_RULE_NOT_FOUND')
      },
    }
    const service = createRecurringAvailabilityExtenderService({ repository, clock: () => now, logger })

    await expect(service.extend()).resolves.toEqual({ scanned: 1, extended: 0, skipped: 1, failed: 0 })
    expect(logger.error).not.toHaveBeenCalled()
  })
})

describe('recurring availability extender scheduler', () => {
  it('runs at startup and daily using an unrefed, cleanable timer', async () => {
    const extender = { extend: vi.fn().mockResolvedValue({ scanned: 0, extended: 0, skipped: 0, failed: 0 }) }
    const logger = { log: vi.fn(), error: vi.fn() }
    const timer = { unref: vi.fn() }
    const clearIntervalFn = vi.fn()
    let scheduledCallback
    const setIntervalFn = vi.fn((callback, intervalMs) => {
      scheduledCallback = callback
      expect(intervalMs).toBe(RECURRING_AVAILABILITY_EXTENSION_INTERVAL_MS)
      return timer
    })

    const job = startRecurringAvailabilityExtender({
      extender,
      logger,
      setIntervalFn,
      clearIntervalFn,
    })
    await job.initialRun
    await scheduledCallback()
    job.stop()

    expect(extender.extend).toHaveBeenCalledTimes(2)
    expect(timer.unref).toHaveBeenCalledOnce()
    expect(clearIntervalFn).toHaveBeenCalledWith(timer)
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('logs failures without crashing and prevents overlapping runs', async () => {
    let releaseFirstRun
    const firstRun = new Promise(resolve => {
      releaseFirstRun = resolve
    })
    const extender = {
      extend: vi.fn()
        .mockReturnValueOnce(firstRun)
        .mockRejectedValueOnce(new Error('scheduled failure')),
    }
    const logger = { log: vi.fn(), error: vi.fn() }
    let scheduledCallback
    const job = startRecurringAvailabilityExtender({
      extender,
      logger,
      setIntervalFn(callback) {
        scheduledCallback = callback
        return { unref() {} }
      },
      clearIntervalFn() {},
    })

    await expect(scheduledCallback()).resolves.toBeNull()
    expect(extender.extend).toHaveBeenCalledOnce()
    releaseFirstRun({ scanned: 0, extended: 0, skipped: 0, failed: 0 })
    await job.initialRun
    await expect(scheduledCallback()).resolves.toBeNull()

    expect(extender.extend).toHaveBeenCalledTimes(2)
    expect(logger.error).toHaveBeenCalledWith('Recurring availability extension run failed', expect.any(Error))
    job.stop()
  })

  it('keeps startup idempotent until stopped and permits a clean restart', async () => {
    const extender = { extend: vi.fn().mockResolvedValue({ scanned: 0, extended: 0, skipped: 0, failed: 0 }) }
    const logger = { log: vi.fn(), error: vi.fn() }
    const firstTimer = { unref: vi.fn() }
    const secondTimer = { unref: vi.fn() }
    const timers = [firstTimer, secondTimer]
    const setIntervalFn = vi.fn(() => timers.shift())
    const clearIntervalFn = vi.fn()
    const options = { extender, logger, setIntervalFn, clearIntervalFn }

    const firstJob = startRecurringAvailabilityExtender(options)
    const duplicateStart = startRecurringAvailabilityExtender(options)

    expect(duplicateStart).toBe(firstJob)
    expect(setIntervalFn).toHaveBeenCalledTimes(1)
    expect(firstTimer.unref).toHaveBeenCalledOnce()
    await firstJob.initialRun

    firstJob.stop()
    firstJob.stop()
    expect(clearIntervalFn).toHaveBeenCalledTimes(1)
    expect(clearIntervalFn).toHaveBeenCalledWith(firstTimer)

    const restartedJob = startRecurringAvailabilityExtender(options)
    expect(restartedJob).not.toBe(firstJob)
    expect(setIntervalFn).toHaveBeenCalledTimes(2)
    expect(secondTimer.unref).toHaveBeenCalledOnce()
    await restartedJob.initialRun

    restartedJob.stop()
    expect(clearIntervalFn).toHaveBeenCalledTimes(2)
    expect(clearIntervalFn).toHaveBeenLastCalledWith(secondTimer)
  })
})
