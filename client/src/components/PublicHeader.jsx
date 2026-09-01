import { Link, NavLink } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { Brand } from './Brand.jsx'

function firstName(fullName) {
  return fullName.replace(/^Dr\.\s*/i, '').trim().split(/\s+/)[0]
}

export function PublicHeader() {
  const { status, currentUser, logout } = useAuth()
  const [logoutPending, setLogoutPending] = useState(false)
  const [logoutError, setLogoutError] = useState(false)

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
      <div className="mx-auto flex min-h-18 max-w-7xl items-center justify-between gap-5 px-5 sm:px-8 lg:px-10">
        <Brand />

        <nav className="flex items-center gap-2 sm:gap-6" aria-label="Public navigation">
          <NavLink
            className={({ isActive }) => `hidden text-sm font-semibold hover:text-blue-700 sm:block ${isActive ? 'text-blue-700' : 'text-slate-700'}`}
            to="/doctors"
          >
            Find Doctors
          </NavLink>
          {status === 'loading' && <span className="h-10 w-32 animate-pulse rounded-lg bg-slate-100" aria-label="Checking sign-in status" />}
          {status === 'anonymous' && (
            <>
              <Link className="text-sm font-semibold text-slate-700 hover:text-blue-700" to="/login">
                Login
              </Link>
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-700 px-3.5 text-sm font-semibold text-blue-700 hover:bg-blue-50 sm:px-4"
                to="/register"
              >
                Register
              </Link>
            </>
          )}
          {status === 'authenticated' && currentUser && (
            <>
              <span className="max-w-28 truncate text-sm font-medium text-slate-600 sm:max-w-40">
                Hi, <strong className="font-semibold text-slate-900">{firstName(currentUser.fullName)}</strong>
              </span>
              <button
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 px-3.5 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60 sm:px-4"
                disabled={logoutPending}
                onClick={handleLogout}
                type="button"
              >
                {logoutPending ? 'Logging out…' : 'Logout'}
              </button>
              {logoutError && <span className="sr-only" role="alert">Logout failed. Please try again.</span>}
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
