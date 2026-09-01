import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { safeInternalReturnTo } from '../lib/navigation.js'
import { PublicHeader } from './PublicHeader.jsx'

export function ProtectedRoute({ allowedRoles, children }) {
  const { status, currentUser, sessionError, refresh } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-5" aria-live="polite">
        <div className="text-center">
          <span className="mx-auto block size-10 animate-pulse rounded-full bg-blue-100" />
          <p className="mt-4 font-medium text-slate-700">Checking your MedReach session…</p>
        </div>
      </main>
    )
  }

  if (status === 'anonymous' && !sessionError) {
    const returnTo = safeInternalReturnTo(`${location.pathname}${location.search}`, '/')
    return <Navigate replace to={`/login?${new URLSearchParams({ returnTo }).toString()}`} />
  }

  if (sessionError) {
    return (
      <div className="min-h-screen bg-slate-50">
        <PublicHeader />
        <main className="mx-auto max-w-xl px-5 py-20 text-center">
          <h1 className="text-2xl font-semibold text-slate-950">We couldn’t confirm your session</h1>
          <p className="mt-3 leading-7 text-slate-600">The MedReach server may be temporarily unavailable. Try again before continuing.</p>
          <button className="mt-6 min-h-11 rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800" onClick={refresh} type="button">Try again</button>
        </main>
      </div>
    )
  }

  if (!currentUser || !allowedRoles.includes(currentUser.role)) {
    const destination = currentUser?.role === 'doctor' ? '/doctor/appointments' : currentUser?.role === 'patient' ? '/appointments' : '/doctors'
    return (
      <div className="min-h-screen bg-slate-50">
        <PublicHeader />
        <main className="mx-auto max-w-xl px-5 py-20 text-center">
          <p className="text-sm font-semibold text-blue-700">Role-protected area</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">This page isn’t available for your account</h1>
          <p className="mt-3 leading-7 text-slate-600">MedReach keeps Patient and Doctor appointment tools separate.</p>
          <a className="mt-7 inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white" href={destination}>Go to your appointments</a>
        </main>
      </div>
    )
  }

  return children
}
