import { Route, Routes } from 'react-router-dom'
import { DoctorProfilePage } from './pages/DoctorProfilePage.jsx'
import { DoctorResultsPage } from './pages/DoctorResultsPage.jsx'
import { HomePage } from './pages/HomePage.jsx'
import { LoginPage } from './pages/LoginPage.jsx'
import { RegisterPage } from './pages/RegisterPage.jsx'

function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6 text-center">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-700">MedReach</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">This page is not ready yet</h1>
        <p className="mt-3 text-slate-600">Return home while we finish the next part of doctor discovery.</p>
        <a
          className="mt-7 inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"
          href="/"
        >
          Back to home
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
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
