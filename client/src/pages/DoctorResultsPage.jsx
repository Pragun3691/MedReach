import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { DiscoverySearch } from '../components/DiscoverySearch.jsx'
import { DoctorFilters } from '../components/DoctorFilters.jsx'
import { DoctorResultCard } from '../components/DoctorResultCard.jsx'
import { PublicFooter } from '../components/PublicFooter.jsx'
import { PublicHeader } from '../components/PublicHeader.jsx'
import { listSpecializations, searchDoctors } from '../lib/api.js'
import { todayInIndia } from '../lib/date.js'

const pageSize = 10
const filterKeys = ['specialization', 'date', 'maxFee', 'minExperience']
const apiKeys = ['name', 'specialization', 'problem', ...filterKeys.slice(1)]

function currentSearch(searchParams) {
  for (const type of ['problem', 'specialization', 'name']) {
    const value = searchParams.get(type)
    if (value) return { type, value }
  }
  return { type: 'problem', value: '' }
}

function pageHeading(searchParams) {
  if (searchParams.get('problem')) return `Doctors for “${searchParams.get('problem')}”`
  if (searchParams.get('specialization')) return `${searchParams.get('specialization')} doctors`
  if (searchParams.get('name')) return `Results for “${searchParams.get('name')}”`
  return 'Find a doctor'
}

function ResultsSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading doctors">
      {[1, 2, 3].map(item => (
        <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-6" key={item}>
          <div className="flex gap-4">
            <div className="size-16 shrink-0 rounded-full bg-slate-200" />
            <div className="flex-1 space-y-3 pt-1">
              <div className="h-5 w-48 rounded bg-slate-200" />
              <div className="h-4 w-36 rounded bg-blue-100" />
              <div className="h-3 w-3/4 rounded bg-slate-100" />
              <div className="h-3 w-full rounded bg-slate-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function DoctorResultsPage() {
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
    setSearchParams(nextParams)
  }

  function applyFilters(values) {
    const nextParams = new URLSearchParams(searchParams)
    for (const key of filterKeys) {
      if (values[key]) nextParams.set(key, values[key])
      else nextParams.delete(key)
    }
    nextParams.delete('offset')
    setSearchParams(nextParams)
  }

  function clearFilters() {
    const nextParams = new URLSearchParams(searchParams)
    for (const key of filterKeys) nextParams.delete(key)
    nextParams.delete('offset')
    setSearchParams(nextParams)
  }

  function changePage(nextOffset) {
    const nextParams = new URLSearchParams(searchParams)
    if (nextOffset > 0) nextParams.set('offset', String(nextOffset))
    else nextParams.delete('offset')
    setSearchParams(nextParams)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const loading = resultState.key !== requestKey
  const results = loading ? null : resultState.data
  const error = loading ? null : resultState.error
  const total = results?.total ?? 0
  const pageNumber = Math.floor(offset / pageSize) + 1
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <PublicHeader />

      <main>
        <section className="border-b border-blue-100 bg-[#f4f8fd]">
          <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:px-10 lg:py-12">
            <nav className="text-sm text-slate-500" aria-label="Breadcrumb">
              <Link className="hover:text-blue-700" to="/">Home</Link>
              <span className="mx-2" aria-hidden="true">/</span>
              <span className="text-slate-700">Find doctors</span>
            </nav>

            <div className="mt-5 max-w-3xl">
              <h1 className="text-3xl font-bold tracking-[-0.035em] text-slate-950 sm:text-4xl">{pageHeading(searchParams)}</h1>
              <p className="mt-3 leading-7 text-slate-600">
                Compare verified professional details, consultation fees and real upcoming availability.
              </p>
            </div>

            <div className="max-w-4xl">
              <DiscoverySearch
                className="mt-7"
                initialQuery={searchIntent.value}
                initialType={searchIntent.type}
                key={`${searchIntent.type}:${searchIntent.value}`}
              />
            </div>
          </div>
        </section>

        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-5 py-5 sm:px-8 lg:px-10">
            <DoctorFilters
              filters={filters}
              minDate={todayInIndia()}
              onApply={applyFilters}
              onChange={setFilter}
              onClear={clearFilters}
              specializations={specializationState.items}
            />
            {specializationState.error && <p className="mt-3 text-sm text-amber-700">Specialization options are temporarily unavailable.</p>}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:px-10 lg:py-12" aria-live="polite">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-semibold text-slate-900">
              {loading ? 'Finding doctors…' : `${total} ${total === 1 ? 'doctor' : 'doctors'} found`}
            </p>
            {!loading && total > 0 && <p className="text-sm text-slate-500">Earliest availability first</p>}
          </div>

          {loading && <ResultsSkeleton />}

          {!loading && error && (
            <div className="rounded-2xl border border-amber-200 bg-white px-6 py-12 text-center">
              <h2 className="text-xl font-semibold text-slate-950">We couldn’t load doctors</h2>
              <p className="mt-2 text-slate-600">{error}</p>
              <button className="mt-6 min-h-11 rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800" onClick={() => setRequestVersion(version => version + 1)} type="button">
                Try again
              </button>
            </div>
          )}

          {!loading && !error && results.items.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-blue-50 text-blue-700" aria-hidden="true">
                <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" strokeLinecap="round" />
                </svg>
              </div>
              <h2 className="mt-4 text-xl font-semibold text-slate-950">No doctors match these filters</h2>
              <p className="mx-auto mt-2 max-w-md text-slate-600">Try another health concern, choose a different date, or clear the filters.</p>
              <button className="mt-6 min-h-11 rounded-lg border border-blue-700 px-5 text-sm font-semibold text-blue-700 hover:bg-blue-50" onClick={clearFilters} type="button">
                Clear filters
              </button>
            </div>
          )}

          {!loading && !error && results.items.length > 0 && (
            <div className="space-y-4">
              {results.items.map(doctor => <DoctorResultCard doctor={doctor} key={doctor.id} selectedDate={filters.date} />)}
            </div>
          )}

          {!loading && !error && pageCount > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-4" aria-label="Doctor results pagination">
              <button
                className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={offset === 0}
                onClick={() => changePage(Math.max(0, offset - pageSize))}
                type="button"
              >
                Previous
              </button>
              <span className="text-sm text-slate-600">Page {pageNumber} of {pageCount}</span>
              <button
                className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={offset + pageSize >= total}
                onClick={() => changePage(offset + pageSize)}
                type="button"
              >
                Next
              </button>
            </nav>
          )}
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}
