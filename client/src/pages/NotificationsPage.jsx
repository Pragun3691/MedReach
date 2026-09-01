import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PublicFooter } from '../components/PublicFooter.jsx'
import { PublicHeader } from '../components/PublicHeader.jsx'
import { formatNotificationTime } from '../lib/appointment-format.js'
import { listNotifications, markNotificationRead } from '../lib/api.js'
import { safeInternalReturnTo } from '../lib/navigation.js'

const pageSize = 20

export function NotificationsPage() {
  const [requestVersion, setRequestVersion] = useState(0)
  const [state, setState] = useState({ key: null, data: null, error: null })
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
    }
  }

  const loading = state.key !== requestKey

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 lg:py-14">
        <div className="mb-8">
          <p className="text-sm font-semibold text-blue-700">Updates</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-3xl font-bold tracking-[-0.035em] sm:text-4xl">Notifications</h1>
            {!loading && state.data && <span className="text-sm text-slate-500">{state.data.unreadCount} unread</span>}
          </div>
          <p className="mt-3 leading-7 text-slate-600">Booking, cancellation and rescheduling updates for your account.</p>
        </div>

        {loading && <div className="space-y-3" aria-label="Loading notifications">{[1, 2, 3].map(item => <div className="h-28 animate-pulse rounded-xl bg-white" key={item} />)}</div>}
        {!loading && state.error && (
          <div className="rounded-2xl border border-amber-200 bg-white p-8 text-center">
            <h2 className="text-xl font-semibold">We couldn’t load notifications</h2>
            <p className="mt-2 text-slate-600">{state.error.message}</p>
            <button className="mt-5 min-h-11 rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white" onClick={retry} type="button">Try again</button>
          </div>
        )}
        {!loading && state.data?.items.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-blue-50 text-blue-700" aria-hidden="true">✓</div>
            <h2 className="mt-4 text-xl font-semibold">You’re all caught up</h2>
            <p className="mt-2 text-slate-600">New appointment updates will appear here.</p>
          </div>
        )}
        {!loading && state.data?.items.length > 0 && (
          <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {state.data.items.map(notification => {
              const actionPath = safeInternalReturnTo(notification.actionPath, null)
              return (
                <li className={`border-b border-slate-100 p-5 last:border-b-0 sm:p-6 ${notification.isRead ? 'bg-white' : 'bg-blue-50/55'}`} key={notification.id}>
                  <div className="flex gap-4">
                    <span className={`mt-1 size-2.5 shrink-0 rounded-full ${notification.isRead ? 'bg-slate-200' : 'bg-blue-600'}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="leading-7 text-slate-800">{notification.message}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatNotificationTime(notification.createdAt)}</p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
                        {actionPath && <Link className="text-blue-700 hover:text-blue-800" to={actionPath}>View appointment</Link>}
                        {!notification.isRead && <button className="text-slate-600 hover:text-blue-700" onClick={() => markRead(notification.id)} type="button">Mark as read</button>}
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {!loading && state.data?.total > pageSize && <p className="mt-5 text-center text-sm text-slate-500">Showing the newest {pageSize} of {state.data.total} notifications.</p>}
      </main>
      <PublicFooter />
    </div>
  )
}
