import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { listNotifications } from '../lib/api.js'
import { Brand } from './Brand.jsx'

function firstName(fullName) {
  return fullName.replace(/^Dr\.\s*/i, '').trim().split(/\s+/)[0]
}

function navigationClass({ isActive }) {
  return `text-sm font-semibold hover:text-blue-700 ${isActive ? 'text-blue-700' : 'text-slate-700'}`
}

function NotificationEntry({ userId }) {
  const [unreadCount, setUnreadCount] = useState(0)

  const refresh = useCallback(() => {
    const controller = new AbortController()
    listNotifications({ limit: 1, offset: 0, signal: controller.signal })
      .then(data => setUnreadCount(data.unreadCount))
      .catch(() => {})
    return () => controller.abort()
  }, [])

  useEffect(() => refresh(), [refresh, userId])
  useEffect(() => {
    function handleChange() {
      refresh()
    }
    window.addEventListener('medreach:notifications-changed', handleChange)
    return () => window.removeEventListener('medreach:notifications-changed', handleChange)
  }, [refresh])

  return (
    <NavLink className="relative inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700" to="/notifications" aria-label={`Notifications, ${unreadCount} unread`}>
      <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 21h4" strokeLinecap="round" />
      </svg>
      <span className="hidden xl:inline">Notifications</span>
      {unreadCount > 0 && <span className="absolute right-0 top-0 grid min-w-4.5 place-items-center rounded-full bg-blue-700 px-1 text-[10px] font-bold leading-[18px] text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </NavLink>
  )
}

export function PublicHeader() {
  const { status, currentUser, logout } = useAuth()
  const [logoutPending, setLogoutPending] = useState(false)
  const [logoutError, setLogoutError] = useState(false)
  const appointmentPath = currentUser?.role === 'doctor' ? '/doctor/appointments' : '/appointments'
  const appointmentLabel = currentUser?.role === 'doctor' ? 'Appointments' : 'My Appointments'

  async function handleLogout() {
    setLogoutPending(true)
    setLogoutError(false)

    try {
      await logout()
    } catch {
      setLogoutError(true)
    } finally {
      setLogoutPending(false)
    }
  }

  return (
    <header className="border-b border-slate-200/90 bg-white">
      <div className="mx-auto flex min-h-18 max-w-7xl items-center justify-between gap-3 px-5 sm:px-8 lg:px-10">
        <Brand />

        <nav className="flex items-center gap-1 sm:gap-3 lg:gap-5" aria-label="Primary navigation">
          <NavLink className={({ isActive }) => `hidden md:block ${navigationClass({ isActive })}`} to="/doctors">Find Doctors</NavLink>
          {status === 'authenticated' && currentUser && <NavLink className={({ isActive }) => `hidden md:block ${navigationClass({ isActive })}`} to={appointmentPath}>{appointmentLabel}</NavLink>}
          {status === 'loading' && <span className="h-10 w-28 animate-pulse rounded-lg bg-slate-100" aria-label="Checking sign-in status" />}
          {status === 'anonymous' && (
            <>
              <Link className="text-sm font-semibold text-slate-700 hover:text-blue-700" to="/login">Login</Link>
              <Link className="inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-700 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 sm:px-4" to="/register">Register</Link>
            </>
          )}
          {status === 'authenticated' && currentUser && (
            <>
              <NotificationEntry userId={currentUser.id} />
              <span className="hidden max-w-32 truncate text-sm font-medium text-slate-600 lg:block">
                Hi, <strong className="font-semibold text-slate-900">{firstName(currentUser.fullName)}</strong>
              </span>
              <button className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 px-2.5 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60 sm:px-4" disabled={logoutPending} onClick={handleLogout} type="button">
                {logoutPending ? 'Wait…' : 'Logout'}
              </button>
              {logoutError && <span className="sr-only" role="alert">Logout failed. Please try again.</span>}
            </>
          )}
        </nav>
      </div>

      {status === 'authenticated' && currentUser && (
        <nav className="mx-auto flex max-w-7xl gap-5 border-t border-slate-100 px-5 py-2.5 md:hidden" aria-label="Account navigation">
          <NavLink className={navigationClass} to="/doctors">Find Doctors</NavLink>
          <NavLink className={navigationClass} to={appointmentPath}>{appointmentLabel}</NavLink>
          <span className="ml-auto truncate text-xs text-slate-500">Hi, {firstName(currentUser.fullName)}</span>
        </nav>
      )}
    </header>
  )
}
