import { notificationRepository } from '../data-access/notification.repository.js'
import { AppError } from '../errors/app-error.js'

function mapNotification(row) {
  return {
    id: Number(row.id),
    type: row.type,
    message: row.message,
    isRead: row.is_read,
    actionPath: row.action_path,
    createdAt: row.created_at,
  }
}

export function createNotificationService(repository = notificationRepository) {
  return {
    async list(userId, pagination) {
      const result = await repository.listForUser(userId, pagination)
      return {
        items: result.rows.map(mapNotification),
        limit: pagination.limit,
        offset: pagination.offset,
        total: Number(result.total),
        unreadCount: Number(result.unreadCount),
      }
    },

    async markRead(userId, notificationId) {
      const row = await repository.markRead(userId, notificationId)
      if (!row) throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found')
      return mapNotification(row)
    },
  }
}

export const notificationService = createNotificationService()
