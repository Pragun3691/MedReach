import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PublicFooter } from '../components/PublicFooter.jsx'
import { PublicHeader } from '../components/PublicHeader.jsx'
import { formatNotificationTime } from '../lib/appointment-format.js'
import { listNotifications, markNotificationRead } from '../lib/api.js'
import { safeInternalReturnTo } from '../lib/navigation.js'

const pageSize = 20
const notificationDetails = {
  appointment_booked: { label: 'Booking', title: 'Appointment confirmed', icon: 'check' },
  appointment_rescheduled: { label: 'Reschedule', title: 'Appointment rescheduled', icon: 'arrow' },
  appointment_cancelled: { label: 'Cancellation', title: 'Appointment cancelled', icon: 'cancel' },
}
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
})

function isToday(value) {
  return dayFormatter.format(new Date(value)) === dayFormatter.format(new Date())
}

function NotificationIcon({ type }) {
  const kind = notificationDetails[type]?.icon ?? 'check'

  if (kind === 'arrow') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10l-2.5-2.5M17 17H7l2.5 2.5" /><path d="M17 7l2 2-2 2M7 17l-2-2 2-2" /></svg>
  }
  if (kind === 'cancel') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4v3M18 4v3M4 9h16M5 6h14v14H5z" /><path d="m9 12 6 5m0-5-6 5" /></svg>
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4v3M18 4v3M4 9h16M5 6h14v14H5z" /><path d="m9 14 2 2 4-5" /></svg>
}

function NotificationRow({ notification, markingRead, onMarkRead }) {
  const details = notificationDetails[notification.type] ?? { label: 'Update', title: 'Appointment update' }
  const actionPath = safeInternalReturnTo(notification.actionPath, null)

  return (
    <li className="notification-row" data-unread={!notification.isRead}>
      <article aria-label={`${notification.isRead ? 'Read' : 'Unread'} notification: ${details.title}`}>
        <div className="notification-row__marker" aria-hidden="true">
          {!notification.isRead && <span />}
        </div>
        <div className="notification-row__icon"><NotificationIcon type={notification.type} /></div>
        <div className="notification-row__body">
          <div className="notification-row__meta">
            <span>{details.label}</span>
            <time dateTime={notification.createdAt}>{formatNotificationTime(notification.createdAt)}</time>
          </div>
          <h3>{details.title}</h3>
          <p>{notification.message}</p>
          <div className="notification-row__actions">
            {actionPath && <Link to={actionPath}>View appointment <span aria-hidden="true">→</span></Link>}
            {!notification.isRead && (
              <button disabled={markingRead} onClick={() => onMarkRead(notification.id)} type="button">
                {markingRead ? 'Marking…' : 'Mark as read'}
              </button>
            )}
          </div>
        </div>
      </article>
    </li>
  )
}

export function NotificationsPage() {
  const [requestVersion, setRequestVersion] = useState(0)
  const [state, setState] = useState({ key: null, data: null, error: null })
  const [markingReadIds, setMarkingReadIds] = useState(() => new Set())
  const retry = useCallback(() => setRequestVersion(version => version + 1), [])
  const requestKey = String(requestVersion)

  useEffect(() => {
    const controller = new AbortController()
    const currentKey = requestKey
    listNotifications({ limit: pageSize, offset: 0, signal: controller.signal })
      .then(data => setState({ key: currentKey, data, error: null }))
      .catch(error => {
        if (error.name !== 'AbortError') setState({ key: currentKey, data: null, error })
      })
    return () => controller.abort()
  }, [requestKey])

  async function markRead(notificationId) {
    setMarkingReadIds(current => new Set(current).add(notificationId))
    try {
      const { notification } = await markNotificationRead(notificationId)
      setState(current => ({
        ...current,
        data: {
          ...current.data,
          unreadCount: Math.max(0, current.data.unreadCount - (current.data.items.find(item => item.id === notificationId)?.isRead ? 0 : 1)),
          items: current.data.items.map(item => item.id === notificationId ? notification : item),
        },
      }))
      window.dispatchEvent(new Event('medreach:notifications-changed'))
    } catch (error) {
      setState(current => ({ ...current, error }))
    } finally {
      setMarkingReadIds(current => {
        const next = new Set(current)
        next.delete(notificationId)
        return next
      })
    }
  }

  const loading = state.key !== requestKey
  const groups = !loading && state.data
    ? [
        { label: 'Today', items: state.data.items.filter(item => isToday(item.createdAt)) },
        { label: 'Earlier', items: state.data.items.filter(item => !isToday(item.createdAt)) },
      ].filter(group => group.items.length > 0)
    : []

  return (
    <div className="notifications-page min-h-screen">
      <PublicHeader editorial />
      <main className="notifications-main">
        <header className="notifications-intro">
          <div>
            <p>Care updates</p>
            <h1>Notifications</h1>
            <span>Important updates about your appointments and care.</span>
          </div>
          {!loading && state.data && (
            <strong aria-label={`${state.data.unreadCount} unread notifications`}>{state.data.unreadCount} unread</strong>
          )}
        </header>

        {loading && <div className="notification-loading" aria-label="Loading notifications">{[1, 2, 3].map(item => <div key={item} />)}</div>}
        {!loading && state.error && (
          <div className="notifications-message" role="alert">
            <h2>We couldn’t load notifications</h2>
            <p>{state.error.message}</p>
            <button onClick={retry} type="button">Try again</button>
          </div>
        )}
        {!loading && state.data?.items.length === 0 && (
          <div className="notifications-empty">
            <h2>No updates yet</h2>
            <p>Important appointment and account updates will appear here.</p>
          </div>
        )}
        {!loading && state.data?.items.length > 0 && (
          <div className="notification-feed">
            {groups.map(group => (
              <section aria-labelledby={`notification-group-${group.label.toLowerCase()}`} key={group.label}>
                <h2 id={`notification-group-${group.label.toLowerCase()}`}>{group.label}</h2>
                <ul>
                  {group.items.map(notification => (
                    <NotificationRow
                      key={notification.id}
                      markingRead={markingReadIds.has(notification.id)}
                      notification={notification}
                      onMarkRead={markRead}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        {!loading && state.data?.total > pageSize && <p className="notifications-page-count">Showing the newest {pageSize} of {state.data.total} notifications.</p>}
      </main>
      <PublicFooter />
    </div>
  )
}
