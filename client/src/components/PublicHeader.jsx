import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { listNotifications } from '../lib/api.js'
import { Brand } from './Brand.jsx'

function firstName(fullName) {
  return fullName.replace(/^Dr\.\s*/i, '').trim().split(/\s+/)[0]
}

function navigationClass({ isActive }, inverse = false) {
  if (inverse) {
    return `text-sm font-medium transition-colors duration-250 hover:text-white ${isActive ? 'text-[#A8E6CF]' : 'text-white/80'}`
  }

  return `text-sm font-medium transition-colors duration-250 hover:text-[#173960] ${isActive ? 'text-[#173960]' : 'text-slate-700'}`
}

function NotificationEntry({ userId, inverse = false }) {
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
    <NavLink className={`relative inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold transition-colors duration-250 ${inverse ? 'text-white/80 hover:bg-white/10 hover:text-white' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`} to="/notifications" aria-label={`Notifications, ${unreadCount} unread`}>
      <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 21h4" strokeLinecap="round" />
      </svg>
      <span className="hidden xl:inline">Notifications</span>
      {unreadCount > 0 && <span className="absolute right-0 top-0 grid min-w-4.5 place-items-center rounded-full bg-blue-700 px-1 text-[10px] font-bold leading-[18px] text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </NavLink>
  )
}

export function PublicHeader({ overlay = false }) {
  const { status, currentUser, logout } = useAuth()
  const [logoutPending, setLogoutPending] = useState(false)
  const [logoutError, setLogoutError] = useState(false)
  const [hasScrolled, setHasScrolled] = useState(false)
  const appointmentPath = currentUser?.role === 'doctor' ? '/doctor/appointments' : '/appointments'
  const appointmentLabel = currentUser?.role === 'doctor' ? 'Appointments' : 'My Appointments'
  const inverse = overlay && !hasScrolled

  useEffect(() => {
    if (!overlay) return undefined

    function updateHeader() {
      setHasScrolled(window.scrollY > 24)
    }

    updateHeader()
    window.addEventListener('scroll', updateHeader, { passive: true })
    return () => window.removeEventListener('scroll', updateHeader)
  }, [overlay])

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
    <header className={`${overlay ? 'fixed inset-x-0 top-0 z-50' : 'relative'} border-b transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300 ${inverse ? 'border-white/15 bg-transparent' : 'border-slate-200/90 bg-[#F8F6F1]/95 shadow-[0_10px_30px_-24px_rgba(15,39,71,0.7)] backdrop-blur-md'}`}>
      <div className={`mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 transition-[min-height] duration-300 sm:px-8 lg:px-10 ${hasScrolled ? 'min-h-16' : 'min-h-20'}`}>
        <Brand inverse={inverse} />

        <nav className="flex items-center gap-2 sm:gap-5 lg:gap-7" aria-label="Primary navigation">
          <NavLink className={({ isActive }) => `hidden md:block ${navigationClass({ isActive }, inverse)}`} to="/doctors">Find Doctors</NavLink>
          {status === 'authenticated' && currentUser && <NavLink className={({ isActive }) => `hidden md:block ${navigationClass({ isActive }, inverse)}`} to={appointmentPath}>{appointmentLabel}</NavLink>}
          {status === 'loading' && <span className={`h-10 w-28 animate-pulse rounded-lg ${inverse ? 'bg-white/15' : 'bg-slate-100'}`} aria-label="Checking sign-in status" />}
          {status === 'anonymous' && (
            <>
              <Link className={`text-sm font-medium transition-colors duration-250 ${inverse ? 'text-white/80 hover:text-white' : 'text-slate-700 hover:text-[#173960]'}`} to="/login">Login</Link>
              <Link className={`inline-flex min-h-10 items-center justify-center rounded-full border px-4 text-sm font-medium tracking-[-0.01em] transition-[background-color,color,transform,border-color] duration-250 hover:-translate-y-0.5 sm:px-5 ${inverse ? 'border-white/45 text-white hover:border-white hover:bg-white hover:text-[#0F2747]' : 'border-[#173960]/70 text-[#173960] hover:border-[#173960] hover:bg-[#173960] hover:text-white'}`} to="/register">Register</Link>
            </>
          )}
          {status === 'authenticated' && currentUser && (
            <>
              <NotificationEntry inverse={inverse} userId={currentUser.id} />
              <span className={`hidden max-w-32 truncate text-sm font-medium lg:block ${inverse ? 'text-white/70' : 'text-slate-600'}`}>
                Hi, <strong className={`font-semibold ${inverse ? 'text-white' : 'text-slate-900'}`}>{firstName(currentUser.fullName)}</strong>
              </span>
              <button className={`inline-flex min-h-10 items-center justify-center rounded-lg border px-2.5 text-sm font-semibold transition-colors duration-250 disabled:cursor-wait disabled:opacity-60 sm:px-4 ${inverse ? 'border-white/45 text-white hover:bg-white hover:text-[#0F2747]' : 'border-slate-300 text-slate-700 hover:border-[#173960] hover:bg-[#173960] hover:text-white'}`} disabled={logoutPending} onClick={handleLogout} type="button">
                {logoutPending ? 'Wait…' : 'Logout'}
              </button>
              {logoutError && <span className="sr-only" role="alert">Logout failed. Please try again.</span>}
            </>
          )}
        </nav>
      </div>

      {status === 'authenticated' && currentUser && (
        <nav className={`mx-auto flex max-w-7xl gap-5 border-t px-5 py-2.5 md:hidden ${inverse ? 'border-white/15' : 'border-slate-100'}`} aria-label="Account navigation">
          <NavLink className={({ isActive }) => navigationClass({ isActive }, inverse)} to="/doctors">Find Doctors</NavLink>
          <NavLink className={({ isActive }) => navigationClass({ isActive }, inverse)} to={appointmentPath}>{appointmentLabel}</NavLink>
          <span className={`ml-auto truncate text-xs ${inverse ? 'text-white/60' : 'text-slate-500'}`}>Hi, {firstName(currentUser.fullName)}</span>
        </nav>
      )}
    </header>
  )
}
