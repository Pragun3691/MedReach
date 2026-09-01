import { Router } from 'express'
import { createSpecializationController } from '../controllers/specialization.controller.js'

export function createSpecializationRouter(service) {
  const router = Router()
  const controller = createSpecializationController(service)

  router.get('/', controller.list)

  return router
}
