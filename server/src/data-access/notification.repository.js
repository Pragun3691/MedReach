import { getPool } from '../db/pool.js'

export const notificationRepository = {
  async listForUser(userId, { limit, offset }) {
    const database = getPool()
    const [itemsResult, countResult] = await Promise.all([
      database.query(
        `SELECT id, type, message, is_read, action_path, created_at
         FROM notifications
         WHERE recipient_user_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      ),
      database.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE is_read = FALSE)::int AS unread_count
         FROM notifications
         WHERE recipient_user_id = $1`,
        [userId],
      ),
    ])

    return {
      rows: itemsResult.rows,
      total: countResult.rows[0].total,
      unreadCount: countResult.rows[0].unread_count,
    }
  },

  async markRead(userId, notificationId) {
    const result = await getPool().query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE id = $1 AND recipient_user_id = $2
       RETURNING id, type, message, is_read, action_path, created_at`,
      [notificationId, userId],
    )
    return result.rows[0] ?? null
  },
}
