import { useCallback, useEffect, useState } from 'react'
import { AppointmentSections } from '../components/AppointmentSections.jsx'
import { PublicFooter } from '../components/PublicFooter.jsx'
import { PublicHeader } from '../components/PublicHeader.jsx'
import { listPatientAppointments } from '../lib/api.js'

export function AppointmentsPage() {
  const [requestVersion, setRequestVersion] = useState(0)
  const [state, setState] = useState({ key: null, data: null, error: null })
  const retry = useCallback(() => setRequestVersion(version => version + 1), [])
  const requestKey = String(requestVersion)

  useEffect(() => {
    const controller = new AbortController()
    const currentKey = requestKey
    listPatientAppointments(controller.signal)
      .then(data => setState({ key: currentKey, data, error: null }))
      .catch(error => {
        if (error.name !== 'AbortError') setState({ key: currentKey, data: null, error })
      })
    return () => controller.abort()
  }, [requestKey])

  const loading = state.key !== requestKey

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
        <div className="mb-9 max-w-2xl">
          <p className="text-sm font-semibold text-blue-700">Your care schedule</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-slate-950 sm:text-4xl">My Appointments</h1>
          <p className="mt-3 leading-7 text-slate-600">Review confirmed consultations and keep track of cancellations or rescheduled bookings.</p>
        </div>

        {loading && <div className="grid gap-4 lg:grid-cols-2" aria-label="Loading appointments">{[1, 2].map(item => <div className="h-56 animate-pulse rounded-2xl bg-white" key={item} />)}</div>}
        {!loading && state.error && (
          <div className="rounded-2xl border border-amber-200 bg-white p-8 text-center">
            <h2 className="text-xl font-semibold">We couldn’t load your appointments</h2>
            <p className="mt-2 text-slate-600">{state.error.message}</p>
            <button className="mt-5 min-h-11 rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white" onClick={retry} type="button">Try again</button>
          </div>
        )}
        {!loading && state.data && <AppointmentSections appointments={state.data} audience="patient" />}
      </main>
      <PublicFooter />
    </div>
  )
}
