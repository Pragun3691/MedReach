import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { DoctorAvailability } from '../components/DoctorAvailability.jsx'
import { PublicFooter } from '../components/PublicFooter.jsx'
import { PublicHeader } from '../components/PublicHeader.jsx'
import { getDoctor } from '../lib/api.js'
import { isCalendarDate, isoToIndiaDate, todayInIndia } from '../lib/date.js'

function initials(name) {
  return name
    .replace(/^Dr\.\s*/i, '')
    .split(' ')
    .slice(0, 2)
    .map(part => part[0])
    .join('')
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse px-5 py-10 sm:px-8 lg:px-10">
      <div className="h-4 w-48 rounded bg-slate-200" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_410px]">
        <div className="h-[520px] rounded-2xl bg-white" />
        <div className="h-[560px] rounded-2xl bg-white" />
      </div>
    </div>
  )
}

function ProfileError({ notFound, onRetry }) {
  return (
    <main className="grid min-h-[70vh] place-items-center bg-slate-50 px-5 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-blue-50 text-blue-700" aria-hidden="true">+</div>
        <h1 className="mt-4 text-2xl font-semibold text-slate-950">{notFound ? 'Doctor profile not found' : 'We couldn’t load this profile'}</h1>
        <p className="mt-2 leading-7 text-slate-600">
          {notFound ? 'This doctor is unavailable or the profile is no longer public.' : 'Check that the MedReach API is running and try again.'}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {!notFound && <button className="min-h-11 rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white" onClick={onRetry} type="button">Try again</button>}
          <Link className="inline-flex min-h-11 items-center rounded-lg border border-blue-700 px-5 text-sm font-semibold text-blue-700" to="/doctors">Find doctors</Link>
        </div>
      </div>
    </main>
  )
}

export function DoctorProfilePage() {
  const { doctorId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [requestVersion, setRequestVersion] = useState(0)
  const [profileState, setProfileState] = useState({ key: null, doctor: null, error: null })
  const requestKey = `${doctorId}:${requestVersion}`

  useEffect(() => {
    const controller = new AbortController()
    const currentRequestKey = requestKey

    getDoctor(doctorId, controller.signal)
      .then(doctor => setProfileState({ key: currentRequestKey, doctor, error: null }))
      .catch(error => {
        if (error.name !== 'AbortError') setProfileState({ key: currentRequestKey, doctor: null, error })
      })

    return () => controller.abort()
  }, [doctorId, requestKey])

  const loading = profileState.key !== requestKey
  const doctor = loading ? null : profileState.doctor
  const error = loading ? null : profileState.error
  const requestedDate = searchParams.get('date')
  const requestedSlotValue = Number(searchParams.get('slot'))
  const requestedSlotId = Number.isInteger(requestedSlotValue) && requestedSlotValue > 0
    ? requestedSlotValue
    : null
  const selectedDate = useMemo(() => {
    if (!doctor) return null
    if (isCalendarDate(requestedDate) && requestedDate >= todayInIndia()) return requestedDate
    return isoToIndiaDate(doctor.nextAvailableAt) ?? todayInIndia()
  }, [doctor, requestedDate])

  useEffect(() => {
    if (!selectedDate || requestedDate === selectedDate) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('date', selectedDate)
    setSearchParams(nextParams, { replace: true })
  }, [requestedDate, searchParams, selectedDate, setSearchParams])

  function changeDate(date) {
    if (!isCalendarDate(date)) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('date', date)
    nextParams.delete('slot')
    setSearchParams(nextParams)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <PublicHeader />
        <ProfileSkeleton />
      </div>
    )
  }

  if (error || !doctor) {
    return (
      <div className="min-h-screen bg-slate-50">
        <PublicHeader />
        <ProfileError notFound={error?.status === 404} onRetry={() => setRequestVersion(version => version + 1)} />
        <PublicFooter />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <PublicHeader />

      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        <nav className="text-sm text-slate-500" aria-label="Breadcrumb">
          <Link className="hover:text-blue-700" to="/">Home</Link>
          <span className="mx-2" aria-hidden="true">/</span>
          <Link className="hover:text-blue-700" to="/doctors">Doctors</Link>
          <span className="mx-2" aria-hidden="true">/</span>
          <span className="text-slate-700">{doctor.fullName}</span>
        </nav>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_410px]">
          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <section className="border-b border-slate-200 p-6 sm:p-8">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <div className="grid size-22 shrink-0 place-items-center rounded-full bg-blue-50 text-2xl font-bold text-blue-700" aria-hidden="true">
                  {initials(doctor.fullName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <h1 className="text-3xl font-bold tracking-[-0.035em] text-slate-950">{doctor.fullName}</h1>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                      <span className="grid size-4 place-items-center rounded-full bg-blue-700 text-[10px] text-white" aria-hidden="true">✓</span>
                      Verified doctor
                    </span>
                  </div>
                  <p className="mt-2 text-lg font-semibold text-blue-700">
                    {doctor.specializations.map(item => item.name).join(' · ')}
                  </p>
                  <p className="mt-2 text-slate-600">{doctor.qualification}</p>

                  <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-t border-slate-100 pt-5 text-sm">
                    <p><strong className="font-semibold text-slate-950">{doctor.experienceYears} years</strong><span className="ml-1 text-slate-600">experience</span></p>
                    <p><strong className="font-semibold text-slate-950">{doctor.defaultFee === null ? 'Fee shown with slots' : `₹${doctor.defaultFee}`}</strong><span className="ml-1 text-slate-600">consultation fee</span></p>
                    <p className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                      <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                      Remote consultation
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="border-b border-slate-200 p-6 sm:p-8" aria-labelledby="about-doctor-heading">
              <p className="text-sm font-semibold text-blue-700">About</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950" id="about-doctor-heading">About {doctor.fullName}</h2>
              <p className="mt-4 max-w-3xl leading-8 text-slate-600">{doctor.bio}</p>
            </section>

            <section className="p-6 sm:p-8" aria-labelledby="professional-info-heading">
              <p className="text-sm font-semibold text-blue-700">Professional information</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950" id="professional-info-heading">Credentials and practice</h2>

              <dl className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2">
                <div className="border-t border-slate-200 pt-4">
                  <dt className="text-sm font-semibold text-slate-500">Qualification</dt>
                  <dd className="mt-1 font-medium leading-6 text-slate-900">{doctor.qualification}</dd>
                </div>
                <div className="border-t border-slate-200 pt-4">
                  <dt className="text-sm font-semibold text-slate-500">Experience</dt>
                  <dd className="mt-1 font-medium text-slate-900">{doctor.experienceYears} years</dd>
                </div>
                <div className="border-t border-slate-200 pt-4">
                  <dt className="text-sm font-semibold text-slate-500">Clinic</dt>
                  <dd className="mt-1 font-medium text-slate-900">{doctor.clinic.name ?? 'Independent practice'}</dd>
                </div>
                <div className="border-t border-slate-200 pt-4">
                  <dt className="text-sm font-semibold text-slate-500">Clinic location</dt>
                  <dd className="mt-1 font-medium text-slate-900">{[doctor.clinic.district, doctor.clinic.city].filter(Boolean).filter((item, index, values) => values.indexOf(item) === index).join(', ') || 'Not listed'}</dd>
                </div>
              </dl>

              <div className="mt-7 rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-950">
                <strong>Verification:</strong> MedReach reviewed this doctor’s submitted registration details before making the profile public.
              </div>
            </section>
          </article>

          <div className="lg:sticky lg:top-6">
            <DoctorAvailability
              doctor={doctor}
              onDateChange={changeDate}
              requestedSlotId={requestedSlotId}
              selectedDate={selectedDate}
            />
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}
