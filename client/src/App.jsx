import { Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute.jsx'
import { AppointmentDetailPage } from './pages/AppointmentDetailPage.jsx'
import { AppointmentsPage } from './pages/AppointmentsPage.jsx'
import { DoctorAppointmentsPage } from './pages/DoctorAppointmentsPage.jsx'
import { DoctorProfilePage } from './pages/DoctorProfilePage.jsx'
import { DoctorResultsPage } from './pages/DoctorResultsPage.jsx'
import { HomePage } from './pages/HomePage.jsx'
import { LoginPage } from './pages/LoginPage.jsx'
import { NotificationsPage } from './pages/NotificationsPage.jsx'
import { RegisterPage } from './pages/RegisterPage.jsx'
import { useLanguage } from './hooks/useLanguage.js'

function NotFoundPage() {
  const { t } = useLanguage()
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6 text-center">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-700">MedReach</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{t('notFound.title')}</h1>
        <p className="mt-3 text-slate-600">{t('notFound.copy')}</p>
        <a
          className="mt-7 inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"
          href="/"
        >
          {t('notFound.back')}
        </a>
      </div>
    </main>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/doctors" element={<DoctorResultsPage />} />
      <Route path="/doctors/:doctorId" element={<DoctorProfilePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/appointments"
        element={<ProtectedRoute allowedRoles={['patient']}><AppointmentsPage /></ProtectedRoute>}
      />
      <Route
        path="/appointments/:appointmentId"
        element={<ProtectedRoute allowedRoles={['patient', 'doctor']}><AppointmentDetailPage /></ProtectedRoute>}
      />
      <Route
        path="/doctor/appointments"
        element={<ProtectedRoute allowedRoles={['doctor']}><DoctorAppointmentsPage /></ProtectedRoute>}
      />
      <Route
        path="/notifications"
        element={<ProtectedRoute allowedRoles={['patient', 'doctor', 'admin']}><NotificationsPage /></ProtectedRoute>}
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
