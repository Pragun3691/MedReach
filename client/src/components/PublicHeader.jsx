import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useLanguage } from '../hooks/useLanguage.js'
import { translateMessage } from '../i18n/messages.js'
import { listNotifications } from '../lib/api.js'
import { Brand } from './Brand.jsx'

function firstName(fullName) {
  return fullName.replace(/^Dr\.\s*/i, '').trim().split(/\s+/)[0]
}

function navigationClass({ isActive }, inverse = false, editorial = false) {
  if (inverse) {
    return `header-link text-sm font-medium hover:text-white ${isActive ? 'text-[#A8E6CF]' : 'text-white/80'}`
  }

  if (editorial) {
    return `header-link text-sm font-medium hover:text-[#173960] ${isActive ? 'text-[#173960]' : 'text-[#43545F]'}`
  }

  return `header-link text-sm font-medium hover:text-[#173960] ${isActive ? 'text-[#173960]' : 'text-slate-700'}`
}

function LanguageControl({ className = '', inverse = false }) {
  const { language, setLanguage, t } = useLanguage()
  const selectedClass = inverse ? 'bg-white text-[#0F2747]' : 'bg-[#0F2747] text-white'
  return (
    <div aria-label={t('language.label')} className={`inline-flex shrink-0 items-center rounded-full border p-0.5 text-xs font-semibold ${inverse ? 'border-white/45 bg-[#07182C]/30 text-white' : 'border-[#0F2747]/25 text-[#0F2747]'} ${className}`} role="group">
      <button aria-pressed={language === 'en'} className={`rounded-full px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2C7A68] ${language === 'en' ? selectedClass : ''}`} lang="en" onClick={() => setLanguage('en')} type="button">{t('language.english')}</button>
      <span aria-hidden="true" className="opacity-35">|</span>
      <button aria-pressed={language === 'hi'} className={`rounded-full px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2C7A68] ${language === 'hi' ? selectedClass : ''}`} lang="hi" onClick={() => setLanguage('hi')} type="button">{t('language.hindi')}</button>
    </div>
  )
}

function NotificationEntry({ userId, inverse = false, editorial = false, t }) {
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
    <NavLink className={`relative inline-flex min-h-10 items-center gap-2 px-2 text-sm font-semibold transition-colors duration-250 ${editorial ? 'rounded-md' : 'rounded-lg'} ${inverse ? 'text-white/80 hover:bg-white/10 hover:text-white' : editorial ? 'text-[#43545F] hover:bg-[#E4EFE9] hover:text-[#174E43]' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`} to="/notifications" aria-label={t('navigation.notificationCount', { count: unreadCount })}>
      <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 21h4" strokeLinecap="round" />
      </svg>
      <span className="hidden xl:inline">{t('navigation.notifications')}</span>
      {unreadCount > 0 && <span className={`absolute right-0 top-0 grid min-w-4.5 place-items-center rounded-full px-1 text-[10px] font-bold leading-[18px] text-white ${editorial ? 'bg-[#2C7A68]' : 'bg-blue-700'}`}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </NavLink>
  )
}

export function PublicHeader({ overlay = false, editorial = false, forceEnglish = false }) {
  const { status, currentUser, logout } = useAuth()
  const languageState = useLanguage()
  const [logoutPending, setLogoutPending] = useState(false)
  const [logoutError, setLogoutError] = useState(false)
  const [hasScrolled, setHasScrolled] = useState(false)
  const appointmentPath = currentUser?.role === 'doctor' ? '/doctor/appointments' : '/appointments'
  const patientFacing = !forceEnglish && (status !== 'authenticated' || currentUser?.role === 'patient')
  const t = patientFacing ? languageState.t : (key, values) => translateMessage('en', key, values)
  const appointmentLabel = currentUser?.role === 'doctor' ? t('navigation.appointments') : t('navigation.myAppointments')
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
    <header className={`${overlay ? 'fixed inset-x-0 top-0 z-50' : 'sticky top-0 z-50'} border-b transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300 ${inverse ? 'border-white/15 bg-transparent' : overlay ? 'border-slate-200/90 bg-[#F8F6F1]/95 shadow-[0_10px_30px_-24px_rgba(15,39,71,0.7)] backdrop-blur-md' : editorial ? 'border-[#D9D1C5] bg-[#F3EFE6] shadow-[0_10px_30px_-25px_rgba(15,39,71,0.55)] backdrop-blur-md' : 'border-[#D9D1C5] bg-[#F3EFE6] shadow-[0_10px_30px_-24px_rgba(15,39,71,0.7)] backdrop-blur-md'}`}>
      <div className={`mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 transition-[min-height] duration-300 sm:px-8 lg:px-10 ${hasScrolled ? 'min-h-16' : 'min-h-[4.75rem]'}`}>
        <Brand inverse={inverse} label={t('common.medreachHome')} />

        <nav className="public-header-nav flex items-center gap-3 sm:gap-5 lg:gap-8" aria-label={t('navigation.primary')}>
          <NavLink className={({ isActive }) => `hidden md:block ${navigationClass({ isActive }, inverse, editorial)}`} to="/doctors">{t('navigation.findDoctors')}</NavLink>
          {status === 'authenticated' && currentUser && <NavLink className={({ isActive }) => `hidden md:block ${navigationClass({ isActive }, inverse, editorial)}`} to={appointmentPath}>{appointmentLabel}</NavLink>}
          {patientFacing && <LanguageControl className={status === 'authenticated' ? 'patient-header-language--desktop hidden md:inline-flex' : ''} inverse={inverse} />}
          {status === 'loading' && <span className={`h-10 w-28 animate-pulse rounded-lg ${inverse ? 'bg-white/15' : 'bg-slate-100'}`} aria-label={t('navigation.checkingSession')} />}
          {status === 'anonymous' && (
            <>
              <Link className={`public-header-login header-link text-sm font-medium ${inverse ? 'text-white/80 hover:text-white' : editorial ? 'text-[#43545F] hover:text-[#173960]' : 'text-slate-700 hover:text-[#173960]'}`} to="/login">{t('navigation.login')}</Link>
              <Link className={`public-header-register header-cta inline-flex min-h-10 items-center justify-center rounded-full border px-4 text-sm font-medium tracking-[-0.01em] sm:px-5 ${inverse ? 'border-white/45 text-white hover:border-white hover:bg-white hover:text-[#0F2747]' : 'border-[#173960]/55 text-[#173960] hover:border-[#173960] hover:bg-[#173960] hover:text-white'}`} to="/register">{t('navigation.register')}</Link>
            </>
          )}
          {status === 'authenticated' && currentUser && (
            <>
              <NotificationEntry editorial={editorial} inverse={inverse} t={t} userId={currentUser.id} />
              <span className={`hidden max-w-32 truncate text-sm font-medium lg:block ${inverse ? 'text-white/70' : 'text-slate-600'}`}>
                {t('navigation.greeting')} <strong className={`font-semibold ${inverse ? 'text-white' : editorial ? 'text-[#0F2747]' : 'text-slate-900'}`}>{firstName(currentUser.fullName)}</strong>
              </span>
              <button className={`public-header-logout inline-flex min-h-10 items-center justify-center border px-2.5 text-sm font-semibold transition-colors duration-250 disabled:cursor-wait disabled:opacity-60 sm:px-4 ${editorial ? 'rounded-md' : 'rounded-lg'} ${inverse ? 'border-white/45 text-white hover:bg-white hover:text-[#0F2747]' : editorial ? 'border-[#0F2747]/25 text-[#43545F] hover:border-[#0F2747]/55 hover:bg-[#EAE7E0] hover:text-[#0F2747]' : 'border-slate-300 text-slate-700 hover:border-[#173960] hover:bg-[#173960] hover:text-white'}`} disabled={logoutPending} onClick={handleLogout} type="button">
                {logoutPending ? t('navigation.wait') : t('navigation.logout')}
              </button>
              {logoutError && <span className="sr-only" role="alert">{t('navigation.logoutFailed')}</span>}
            </>
          )}
        </nav>
      </div>

      {status === 'authenticated' && currentUser && (
        <nav className={`mx-auto flex max-w-7xl items-center gap-4 overflow-x-auto border-t px-5 py-2.5 md:hidden ${inverse ? 'border-white/15' : 'border-slate-100'}`} aria-label={t('navigation.account')}>
          {currentUser.role === 'patient' && <LanguageControl inverse={inverse} />}
          <NavLink className={({ isActive }) => navigationClass({ isActive }, inverse, editorial)} to="/doctors">{t('navigation.findDoctors')}</NavLink>
          <NavLink className={({ isActive }) => navigationClass({ isActive }, inverse, editorial)} to={appointmentPath}>{appointmentLabel}</NavLink>
          <span className={`ml-auto truncate text-xs ${inverse ? 'text-white/60' : 'text-slate-500'}`}>{t('navigation.greeting')} {firstName(currentUser.fullName)}</span>
        </nav>
      )}
    </header>
  )
}
