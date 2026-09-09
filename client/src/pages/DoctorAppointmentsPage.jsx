import { useCallback, useEffect, useState } from 'react'
import { AppointmentSections } from '../components/AppointmentSections.jsx'
import { PublicFooter } from '../components/PublicFooter.jsx'
import { PublicHeader } from '../components/PublicHeader.jsx'
import { listDoctorAppointments } from '../lib/api.js'

export function DoctorAppointmentsPage() {
  const [requestVersion, setRequestVersion] = useState(0)
  const [state, setState] = useState({ key: null, data: null, error: null })
  const retry = useCallback(() => setRequestVersion(version => version + 1), [])
  const requestKey = String(requestVersion)

  useEffect(() => {
    const controller = new AbortController()
    const currentKey = requestKey
    listDoctorAppointments(controller.signal)
      .then(data => setState({ key: currentKey, data, error: null }))
      .catch(error => {
        if (error.name !== 'AbortError') setState({ key: currentKey, data: null, error })
      })
    return () => controller.abort()
  }, [requestKey])

  const loading = state.key !== requestKey

  return (
    <div className="doctor-appointments-page min-h-screen">
      <PublicHeader editorial />
      <main className="doctor-appointments-shell">
        <div className="doctor-appointments__intro">
          <p>Consultation schedule</p>
          <h1>Appointments</h1>
          <span>Manage your scheduled patient consultations and consultation status.</span>
        </div>

        {loading && <div className="doctor-appointments__loading animate-pulse" aria-label="Loading appointments">{[1, 2, 3, 4].map(item => <div key={item} />)}</div>}
        {!loading && state.error && (
          <div className="doctor-appointments__error">
            <h2>We couldn’t load your appointments</h2>
            <p>{state.error.message}</p>
            <button onClick={retry} type="button">Try again</button>
          </div>
        )}
        {!loading && state.data && <AppointmentSections appointments={state.data} />}
      </main>
      <PublicFooter />
    </div>
  )
}
