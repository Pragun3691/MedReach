import { Router } from 'express'
import { authorizeRoles } from '../middleware/authorize-roles.js'
import { requireCsrf } from '../middleware/csrf.js'
import {
  verificationIdSchema, verificationListSchema, verificationRejectionSchema,
  verificationReviewSchema, verificationSubmissionSchema,
} from '../validation/verification.schemas.js'

function privateResponses(_request, response, next) {
  response.set('Cache-Control', 'no-store')
  next()
}

export function createAdminVerificationRouter(service, authenticate) {
  const router = Router()
  router.use(privateResponses, authenticate, authorizeRoles('admin'))
  router.get('/', async (request, response) => {
    response.json(await service.list(verificationListSchema.parse(request.query)))
  })
  router.get('/:verificationId', async (request, response) => {
    response.json({ verification: await service.get(verificationIdSchema.parse(request.params.verificationId)) })
  })
  router.post('/:verificationId/approve', requireCsrf, async (request, response) => {
    response.json({ verification: await service.approve(
      verificationIdSchema.parse(request.params.verificationId), request.authUser.id,
      verificationReviewSchema.parse(request.body),
    ) })
  })
  router.post('/:verificationId/reject', requireCsrf, async (request, response) => {
    response.json({ verification: await service.reject(
      verificationIdSchema.parse(request.params.verificationId), request.authUser.id,
      verificationRejectionSchema.parse(request.body),
    ) })
  })
  return router
}

export function createDoctorVerificationRouter(service, authenticate) {
  const router = Router()
  router.use(privateResponses, authenticate, authorizeRoles('doctor'))
  router.get('/', async (request, response) => {
    response.json({ verification: await service.getMine(request.authUser.id) })
  })
  router.post('/', requireCsrf, async (request, response) => {
    response.json({ verification: await service.submit(request.authUser.id, verificationSubmissionSchema.parse(request.body)) })
  })
  return router
}
