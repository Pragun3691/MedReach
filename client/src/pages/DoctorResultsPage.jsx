import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { DiscoverySearch } from '../components/DiscoverySearch.jsx'
import { DoctorFilters } from '../components/DoctorFilters.jsx'
import { DoctorResultCard } from '../components/DoctorResultCard.jsx'
import { PublicFooter } from '../components/PublicFooter.jsx'
import { PublicHeader } from '../components/PublicHeader.jsx'
import { listSpecializations, searchDoctors } from '../lib/api.js'
import { todayInIndia } from '../lib/date.js'
import { useLanguage } from '../hooks/useLanguage.js'

const pageSize = 10
const filterKeys = ['specialization', 'date', 'maxFee', 'minExperience']
const apiKeys = ['q', 'name', 'specialization', 'problem', ...filterKeys.slice(1)]

function currentSearch(searchParams) {
  for (const type of ['q', 'problem', 'specialization', 'name']) {
    const value = searchParams.get(type)
    if (value) return { type, value }
  }
  return { type: 'problem', value: '' }
}

function ResultsSkeleton({ t }) {
  return (
    <div className="doctor-results-list" aria-label={t('results.finding')}>
      {[1, 2, 3].map(item => (
        <div className="doctor-result doctor-result--skeleton animate-pulse" key={item}>
          <div className="doctor-result__portrait bg-[#DCE8E2]" />
          <div className="doctor-result__content space-y-3">
            <div className="h-6 w-48 rounded-sm bg-[#D8DCD8]" />
            <div className="h-4 w-36 rounded-sm bg-[#D5E7DE]" />
            <div className="mt-5 h-4 w-4/5 rounded-sm bg-[#E3E1DB]" />
            <div className="h-3 w-full rounded-sm bg-[#E9E6DF]" />
            <div className="h-3 w-4/5 rounded-sm bg-[#E9E6DF]" />
          </div>
          <div className="doctor-result__decision space-y-3">
            <div className="h-3 w-24 rounded-sm bg-[#DCE8E2]" />
            <div className="h-4 w-32 rounded-sm bg-[#D8DCD8]" />
            <div className="mt-auto h-11 w-full rounded-sm bg-[#D8DCD8]" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function DoctorResultsPage() {
  const { locale, t } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()
  const [requestVersion, setRequestVersion] = useState(0)
  const [resultState, setResultState] = useState({ key: null, data: null, error: null })
  const [specializationState, setSpecializationState] = useState({ items: [], error: null })

  const offset = Math.max(0, Number.parseInt(searchParams.get('offset') ?? '0', 10) || 0)
  const apiParams = useMemo(() => {
    const params = new URLSearchParams()
    for (const key of apiKeys) {
      const value = searchParams.get(key)
      if (value) params.set(key, value)
    }
    params.set('limit', String(pageSize))
    params.set('offset', String(offset))
    return params
  }, [searchParams, offset])
  const requestKey = `${apiParams.toString()}:${requestVersion}`

  const filters = {
    specialization: searchParams.get('specialization') ?? '',
    date: searchParams.get('date') ?? '',
    maxFee: searchParams.get('maxFee') ?? '',
    minExperience: searchParams.get('minExperience') ?? '',
  }
  const searchIntent = currentSearch(searchParams)

  useEffect(() => {
    const controller = new AbortController()
    const currentRequestKey = requestKey

    searchDoctors(apiParams, controller.signal)
      .then(data => setResultState({ key: currentRequestKey, data, error: null }))
      .catch(error => {
        if (error.name !== 'AbortError') setResultState({ key: currentRequestKey, data: null, error: error.message })
      })

    return () => controller.abort()
  }, [apiParams, requestKey])

  useEffect(() => {
    const controller = new AbortController()
    listSpecializations(controller.signal)
      .then(data => setSpecializationState({ items: data.items, error: null }))
      .catch(error => {
        if (error.name !== 'AbortError') setSpecializationState({ items: [], error: error.message })
      })
    return () => controller.abort()
  }, [])

  function setFilter(key, value) {
    const nextParams = new URLSearchParams(searchParams)
    if (value) nextParams.set(key, value)
    else nextParams.delete(key)
    nextParams.delete('offset')
    setSearchParams(nextParams, { replace: true })
  }

  function applyFilters(values) {
    const nextParams = new URLSearchParams(searchParams)
    for (const key of filterKeys) {
      if (values[key]) nextParams.set(key, values[key])
      else nextParams.delete(key)
    }
    nextParams.delete('offset')
    setSearchParams(nextParams, { replace: true })
  }

  function clearFilters() {
    const nextParams = new URLSearchParams(searchParams)
    for (const key of filterKeys) nextParams.delete(key)
    nextParams.delete('offset')
    setSearchParams(nextParams, { replace: true })
  }

  function changePage(nextOffset) {
    const nextParams = new URLSearchParams(searchParams)
    if (nextOffset > 0) nextParams.set('offset', String(nextOffset))
    else nextParams.delete('offset')
    setSearchParams(nextParams, { replace: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const loading = resultState.key !== requestKey
  const results = loading ? null : resultState.data
  const error = loading ? null : resultState.error
  const total = results?.total ?? 0
  const pageNumber = Math.floor(offset / pageSize) + 1
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="min-h-screen overflow-x-clip bg-[#F8F6F1] text-[#1D2A35]">
      <PublicHeader editorial />

      <main>
        <section className="doctor-discovery-intro">
          <div className="doctor-discovery-intro__inner mx-auto max-w-7xl px-5 py-9 sm:px-8 sm:py-12 lg:px-10 lg:py-14">
            <nav className="doctor-discovery-breadcrumb text-sm" aria-label={t('results.breadcrumb')}>
              <Link className="rounded-sm transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A8E6CF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B223B]" to="/">{t('common.home')}</Link>
              <span className="mx-2.5" aria-hidden="true">/</span>
              <span>{t('navigation.findDoctors')}</span>
            </nav>

            <div className="mt-5 max-w-3xl">
              <p className="editorial-eyebrow">{t('results.findCare')}</p>
              <h1 className="mt-4 text-[2.75rem] font-medium leading-[1.02] tracking-[-0.05em] text-[#F9F7F1] sm:text-[3.8rem]">{t('results.title')}</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/65 sm:text-lg">
                {t('results.copy')}
              </p>
            </div>

            <div className="max-w-5xl sm:mt-1">
              <DiscoverySearch className="mt-7" initialQuery={searchIntent.value} key={`${searchIntent.type}:${searchIntent.value}`} />
            </div>
          </div>
        </section>

        <section className="doctor-filter-rail">
          <div className="doctor-filter-rail__inner mx-auto max-w-7xl px-5 py-4 sm:px-8 lg:px-10">
            <DoctorFilters filters={filters} minDate={todayInIndia()} onApply={applyFilters} onChange={setFilter} onClear={clearFilters} specializations={specializationState.items} />
            {specializationState.error && <p className="mt-3 text-sm text-[#80612D]">{t('results.specializationError')}</p>}
          </div>
        </section>

        <section className="doctor-results-section mx-auto max-w-7xl px-5 pb-16 pt-7 sm:px-8 sm:pb-20 lg:px-10 lg:pb-24 lg:pt-9" aria-live="polite">
          <div className="results-heading-row">
            <div>
              <p className="results-count">
                {loading ? t('results.finding') : t(total === 1 ? 'results.oneFound' : 'results.manyFound', { count: new Intl.NumberFormat(locale).format(total) })}
              </p>
              {!loading && searchIntent.value && <p className="results-query">{t('results.forQuery')} <strong>“{searchIntent.value}”</strong></p>}
            </div>
            {!loading && total > 0 && (
              <div className="sort-note">
                <span>{t('results.sort')}</span>
                <strong>{t('results.earliest')}</strong>
              </div>
            )}
          </div>

          {loading && <ResultsSkeleton t={t} />}

          {!loading && error && (
            <div className="results-state" role="alert">
              <span className="results-state__mark" aria-hidden="true">!</span>
              <h2>{t('results.loadError')}</h2>
              <p>{error}</p>
              <button onClick={() => setRequestVersion(version => version + 1)} type="button">{t('common.tryAgain')} <span aria-hidden="true">→</span></button>
            </div>
          )}

          {!loading && !error && results.items.length === 0 && (
            <div className="results-state">
              <svg className="mx-auto size-8 text-[#2C7A68]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
              <h2>{t('results.noMatch')}</h2>
              <p>{t('results.noMatchCopy')}</p>
              <button onClick={clearFilters} type="button">{t('results.clearFilters')} <span aria-hidden="true">→</span></button>
            </div>
          )}

          {!loading && !error && results.items.length > 0 && (
            <div className="doctor-results-list">
              {results.items.map(doctor => <DoctorResultCard doctor={doctor} key={doctor.id} selectedDate={filters.date} />)}
            </div>
          )}

          {!loading && !error && pageCount > 1 && (
            <nav className="mt-9 flex items-center justify-center gap-4" aria-label={t('results.pagination')}>
              <button className="pagination-button" disabled={offset === 0} onClick={() => changePage(Math.max(0, offset - pageSize))} type="button">{t('common.previous')}</button>
              <span className="text-sm text-[#61716B]">{t('results.page', { page: new Intl.NumberFormat(locale).format(pageNumber), pages: new Intl.NumberFormat(locale).format(pageCount) })}</span>
              <button className="pagination-button" disabled={offset + pageSize >= total} onClick={() => changePage(offset + pageSize)} type="button">{t('common.next')}</button>
            </nav>
          )}
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}
