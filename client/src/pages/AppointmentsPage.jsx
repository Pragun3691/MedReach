import { useCallback, useEffect, useState } from 'react'
import { PatientAppointmentSections } from '../components/PatientAppointmentSections.jsx'
import { PublicFooter } from '../components/PublicFooter.jsx'
import { PublicHeader } from '../components/PublicHeader.jsx'
import { listPatientAppointments } from '../lib/api.js'
import { useLanguage } from '../hooks/useLanguage.js'

export function AppointmentsPage() {
  const { t } = useLanguage()
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
    <div className="patient-appointments-page min-h-screen">
      <PublicHeader editorial />
      <main className="patient-appointments-shell">
        <div className="patient-appointments__intro">
          <p>{t('appointments.eyebrow')}</p>
          <h1>{t('appointments.title')}</h1>
          <span>{t('appointments.copy')}</span>
        </div>

        {loading && <div className="patient-appointments__loading animate-pulse" aria-label={t('appointments.loading')}><div /><div /><div /></div>}
        {!loading && state.error && (
          <div className="patient-appointments__error">
            <h2>{t('appointments.loadError')}</h2>
            <p>{state.error.message}</p>
            <button onClick={retry} type="button">{t('common.tryAgain')}</button>
          </div>
        )}
        {!loading && state.data && <PatientAppointmentSections appointments={state.data} />}
      </main>
      <PublicFooter />
    </div>
  )
}
