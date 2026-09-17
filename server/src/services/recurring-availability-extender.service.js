import { AvailabilityDataError, availabilityRepository } from '../data-access/availability.repository.js'

export function createRecurringAvailabilityExtenderService({
  repository = availabilityRepository,
  clock = () => new Date(),
  logger = console,
} = {}) {
  return {
    async extend() {
      const now = clock()
      const rules = await repository.listRecurringRulesForExtension(now)
      const summary = {
        scanned: rules.length,
        extended: 0,
        skipped: 0,
        failed: 0,
      }

      for (const rule of rules) {
        if (!rule.needs_extension) {
          summary.skipped += 1
          continue
        }

        try {
          await repository.materializeRecurring({
            doctorId: Number(rule.doctor_id),
            ruleId: Number(rule.rule_id),
          }, now)
          summary.extended += 1
        } catch (error) {
          if (error instanceof AvailabilityDataError
            && error.code === 'RECURRING_AVAILABILITY_RULE_NOT_FOUND') {
            summary.skipped += 1
            continue
          }

          summary.failed += 1
          logger.error('Recurring availability extension failed', {
            doctorId: Number(rule.doctor_id),
            ruleId: Number(rule.rule_id),
            error,
          })
        }
      }

      return summary
    },
  }
}

export const recurringAvailabilityExtenderService = createRecurringAvailabilityExtenderService()
