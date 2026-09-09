import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PublicFooter } from '../components/PublicFooter.jsx'
import { PublicHeader } from '../components/PublicHeader.jsx'
import { formatNotificationTime } from '../lib/appointment-format.js'
import { listNotifications, markNotificationRead } from '../lib/api.js'
import { safeInternalReturnTo } from '../lib/navigation.js'
import { useAuth } from '../hooks/useAuth.js'
import { useLanguage } from '../hooks/useLanguage.js'
import { translateMessage } from '../i18n/messages.js'

const pageSize = 20
const notificationDetails = {
  appointment_booked: { label: 'booking', title: 'confirmed', icon: 'check' },
  appointment_rescheduled: { label: 'reschedule', title: 'rescheduled', icon: 'arrow' },
  appointment_cancelled: { label: 'cancellation', title: 'cancelled', icon: 'cancel' },
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

function NotificationRow({ notification, markingRead, onMarkRead, locale, t }) {
  const details = notificationDetails[notification.type] ?? { label: 'update', title: 'appointmentUpdate' }
  const label = t(`notifications.${details.label}`)
  const title = t(`notifications.${details.title}`)
  const actionPath = safeInternalReturnTo(notification.actionPath, null)

  return (
    <li className="notification-row" data-unread={!notification.isRead}>
      <article aria-label={t('notifications.notification', { state: t(notification.isRead ? 'notifications.read' : 'notifications.unread'), title })}>
        <div className="notification-row__marker" aria-hidden="true">
          {!notification.isRead && <span />}
        </div>
        <div className="notification-row__icon"><NotificationIcon type={notification.type} /></div>
        <div className="notification-row__body">
          <div className="notification-row__meta">
            <span>{label}</span>
            <time dateTime={notification.createdAt}>{formatNotificationTime(notification.createdAt, locale)}</time>
          </div>
          <h3>{title}</h3>
          <p>{notification.message}</p>
          <div className="notification-row__actions">
            {actionPath && <Link to={actionPath}>{t('notifications.view')} <span aria-hidden="true">→</span></Link>}
            {!notification.isRead && (
              <button disabled={markingRead} onClick={() => onMarkRead(notification.id)} type="button">
                {markingRead ? t('notifications.marking') : t('notifications.markRead')}
              </button>
            )}
          </div>
        </div>
      </article>
    </li>
  )
}

export function NotificationsPage() {
  const languageState = useLanguage()
  const { currentUser } = useAuth()
  const patientFacing = currentUser?.role === 'patient'
  const t = patientFacing ? languageState.t : (key, values) => translateMessage('en', key, values)
  const locale = patientFacing ? languageState.locale : 'en-IN'
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
        { key: 'today', label: t('notifications.today'), items: state.data.items.filter(item => isToday(item.createdAt)) },
        { key: 'earlier', label: t('notifications.earlier'), items: state.data.items.filter(item => !isToday(item.createdAt)) },
      ].filter(group => group.items.length > 0)
    : []

  return (
    <div className="notifications-page min-h-screen">
      <PublicHeader editorial />
      <main className="notifications-main">
        <header className="notifications-intro">
          <div>
            <p>{t('notifications.eyebrow')}</p>
            <h1>{t('notifications.title')}</h1>
            <span>{t('notifications.copy')}</span>
          </div>
          {!loading && state.data && (
            <strong aria-label={t('navigation.notificationCount', { count: state.data.unreadCount })}>{t('notifications.unreadCount', { count: new Intl.NumberFormat(locale).format(state.data.unreadCount) })}</strong>
          )}
        </header>

        {loading && <div className="notification-loading" aria-label={t('notifications.loading')}>{[1, 2, 3].map(item => <div key={item} />)}</div>}
        {!loading && state.error && (
          <div className="notifications-message" role="alert">
            <h2>{t('notifications.loadError')}</h2>
            <p>{state.error.message}</p>
            <button onClick={retry} type="button">{t('common.tryAgain')}</button>
          </div>
        )}
        {!loading && state.data?.items.length === 0 && (
          <div className="notifications-empty">
            <h2>{t('notifications.empty')}</h2>
            <p>{t('notifications.emptyCopy')}</p>
          </div>
        )}
        {!loading && state.data?.items.length > 0 && (
          <div className="notification-feed">
            {groups.map(group => (
              <section aria-labelledby={`notification-group-${group.key}`} key={group.key}>
                <h2 id={`notification-group-${group.key}`}>{group.label}</h2>
                <ul>
                  {group.items.map(notification => (
                    <NotificationRow
                      key={notification.id}
                      markingRead={markingReadIds.has(notification.id)}
                      notification={notification}
                      onMarkRead={markRead}
                      locale={locale}
                      t={t}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        {!loading && state.data?.total > pageSize && <p className="notifications-page-count">{t('notifications.showing', { pageSize: new Intl.NumberFormat(locale).format(pageSize), total: new Intl.NumberFormat(locale).format(state.data.total) })}</p>}
      </main>
      <PublicFooter />
    </div>
  )
}
