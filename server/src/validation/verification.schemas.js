import { z } from 'zod'

const credential = maximum => z.string().trim().min(2).max(maximum)
  .refine(value => !/\p{Cc}/u.test(value), 'Control characters are not allowed')

export const credentialFields = {
  registrationNumber: credential(100),
  issuingAuthority: credential(160),
}
export const verificationSubmissionSchema = z.object({
  ...credentialFields,
  version: z.number().int().min(0).max(2147483646),
}).strict()
export const verificationReviewSchema = z.object({
  version: z.number().int().positive().max(2147483646),
}).strict()
export const verificationRejectionSchema = verificationReviewSchema.extend({
  reason: z.string().trim().min(1).max(2000)
    .refine(value => [...value].every(character => !/\p{Cc}/u.test(character)
      || ['\n', '\r', '\t'].includes(character)), 'Unsupported control characters are not allowed'),
}).strict()
export const verificationIdSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER)
export const verificationListSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'missing_credentials']).default('pending'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
}).strict()
