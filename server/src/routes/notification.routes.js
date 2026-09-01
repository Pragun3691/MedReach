import { Router } from 'express'
import { createNotificationController } from '../controllers/notification.controller.js'

export function createNotificationRouter(service, authenticate) {
  const router = Router()
  const controller = createNotificationController(service)

  router.get('/', authenticate, controller.list)
  router.patch('/:notificationId/read', authenticate, controller.markRead)

  return router
}
