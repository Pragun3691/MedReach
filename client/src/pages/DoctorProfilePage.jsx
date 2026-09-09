import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { DoctorAvailability } from '../components/DoctorAvailability.jsx'
import { PublicFooter } from '../components/PublicFooter.jsx'
import { PublicHeader } from '../components/PublicHeader.jsx'
import { getDoctor } from '../lib/api.js'
import { isCalendarDate, isoToIndiaDate, todayInIndia } from '../lib/date.js'
import { resolveDoctorPortrait } from '../lib/doctor-portraits.js'
import { useLanguage } from '../hooks/useLanguage.js'
import { specializationDisplayName } from '../i18n/messages.js'

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

function ProfileError({ notFound, onRetry, t }) {
  return (
    <main className="grid min-h-[70vh] place-items-center bg-slate-50 px-5 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-blue-50 text-blue-700" aria-hidden="true">+</div>
        <h1 className="mt-4 text-2xl font-semibold text-slate-950">{notFound ? t('profile.notFound') : t('profile.loadError')}</h1>
        <p className="mt-2 leading-7 text-slate-600">
          {notFound ? t('profile.unavailable') : t('profile.apiError')}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {!notFound && <button className="min-h-11 rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white" onClick={onRetry} type="button">{t('common.tryAgain')}</button>}
          <Link className="inline-flex min-h-11 items-center rounded-lg border border-blue-700 px-5 text-sm font-semibold text-blue-700" to="/doctors">{t('navigation.findDoctors')}</Link>
        </div>
      </div>
    </main>
  )
}

export function DoctorProfilePage() {
  const { language, locale, t } = useLanguage()
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
  const rescheduleValue = Number(searchParams.get('rescheduleFrom'))
  const rescheduleFrom = Number.isInteger(rescheduleValue) && rescheduleValue > 0
    ? rescheduleValue
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
    setSearchParams(nextParams, { replace: true })
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
        <ProfileError notFound={error?.status === 404} onRetry={() => setRequestVersion(version => version + 1)} t={t} />
        <PublicFooter />
      </div>
    )
  }

  const portraitUrl = resolveDoctorPortrait(doctor)

  return (
    <div className="doctor-profile-page min-h-screen">
      <PublicHeader />

      <main className="doctor-profile-shell">
        <nav className="doctor-profile-breadcrumb" aria-label={t('profile.breadcrumb')}>
          <Link to="/">{t('common.home')}</Link>
          <span aria-hidden="true">/</span>
          <Link to="/doctors">{t('common.doctors')}</Link>
          <span aria-hidden="true">/</span>
          <span>{doctor.fullName}</span>
        </nav>

        <div className="doctor-profile-layout">
          <section className="doctor-profile-identity" aria-labelledby="doctor-profile-name">
            <div className="doctor-profile-portrait">
              {portraitUrl
                ? <img alt={t('doctorCard.portrait', { name: doctor.fullName })} src={portraitUrl} />
                : <span aria-hidden="true">{initials(doctor.fullName)}</span>}
            </div>
            <div className="doctor-profile-identity__copy">
              <div className="doctor-profile-name-row">
                <h1 id="doctor-profile-name">{doctor.fullName}</h1>
                <span className="profile-verified">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M10 2.5 16 5v4.4c0 3.7-2.4 6.5-6 8.1-3.6-1.6-6-4.4-6-8.1V5l6-2.5Z" strokeLinejoin="round" />
                    <path d="m7 10 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {t('profile.verified')}
                </span>
              </div>
              <p className="doctor-profile-specialization">{doctor.specializations.map(item => specializationDisplayName(language, item.name)).join(' · ')}</p>
              <div className="doctor-profile-summary">
                {doctor.qualification && <span>{doctor.qualification}</span>}
                <span>{t('profile.yearsExperience', { years: new Intl.NumberFormat(locale).format(doctor.experienceYears) })}</span>
              </div>
              <p className="doctor-profile-practice">{doctor.clinic.name ?? t('profile.independent')}</p>
              <p className="doctor-profile-remote"><span aria-hidden="true" />{t('profile.remote')}</p>
            </div>
          </section>

          <div className="doctor-profile-booking">
            <DoctorAvailability
              doctor={doctor}
              onDateChange={changeDate}
              requestedSlotId={requestedSlotId}
              rescheduleFrom={rescheduleFrom}
              selectedDate={selectedDate}
            />
          </div>

          <section className="doctor-profile-section doctor-profile-about" aria-labelledby="about-doctor-heading">
            <p className="profile-eyebrow">{t('profile.about')}</p>
            <h2 id="about-doctor-heading">{t('profile.aboutDoctor', { name: doctor.fullName })}</h2>
            <p className="doctor-profile-about__body">{doctor.bio}</p>
          </section>

          <section className="doctor-profile-section doctor-profile-details" aria-labelledby="professional-info-heading">
            <p className="profile-eyebrow">{t('profile.details')}</p>
            <h2 id="professional-info-heading">{t('profile.credentials')}</h2>

            <dl className="doctor-profile-details__grid">
              <div>
                <dt>{t('profile.qualification')}</dt>
                <dd>{doctor.qualification}</dd>
              </div>
              <div>
                <dt>{t('profile.experience')}</dt>
                <dd>{t('profile.years', { years: new Intl.NumberFormat(locale).format(doctor.experienceYears) })}</dd>
              </div>
              <div>
                <dt>{t('profile.practice')}</dt>
                <dd>{doctor.clinic.name ?? t('profile.independent')}</dd>
              </div>
              <div>
                <dt>{t('profile.location')}</dt>
                <dd>{[doctor.clinic.district, doctor.clinic.city].filter(Boolean).filter((item, index, values) => values.indexOf(item) === index).join(', ') || t('profile.notListed')}</dd>
              </div>
            </dl>
          </section>

          <section className="doctor-profile-verification" aria-labelledby="profile-verification-heading">
            <div className="doctor-profile-verification__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M12 3 19 6v5.1c0 4.3-2.8 7.6-7 9.4-4.2-1.8-7-5.1-7-9.4V6l7-3Z" strokeLinejoin="round" />
                <path d="m8.7 11.8 2.1 2.1 4.6-4.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h2 id="profile-verification-heading">{t('profile.verifiedBy')}</h2>
              <p>{t('profile.verifiedCopy')}</p>
            </div>
          </section>
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}
