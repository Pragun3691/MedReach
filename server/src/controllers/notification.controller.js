import {
  notificationIdSchema,
  notificationQuerySchema,
} from '../validation/notification.schemas.js'

export function createNotificationController(service) {
  return {
    async list(request, response) {
      const pagination = notificationQuerySchema.parse(request.query)
      const notifications = await service.list(request.authUser.id, pagination)
      response.status(200).json(notifications)
    },

    async markRead(request, response) {
      const notificationId = notificationIdSchema.parse(request.params.notificationId)
      const notification = await service.markRead(request.authUser.id, notificationId)
      response.status(200).json({ notification })
    },
  }
}
