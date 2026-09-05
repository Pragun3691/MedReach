import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DiscoverySearch } from '../components/DiscoverySearch.jsx'
import { PublicFooter } from '../components/PublicFooter.jsx'
import { PublicHeader } from '../components/PublicHeader.jsx'
import { getHomeDiscovery } from '../lib/api.js'

const careSteps = [
  { number: '01', title: 'Find', description: 'Search by doctor, specialization or the health concern you want help with.' },
  { number: '02', title: 'Choose', description: 'Review verified professional details and select a real 30-minute time slot.' },
  { number: '03', title: 'Consult', description: 'Connect remotely and keep future care organized in one continuous journey.' },
]

const trustItems = [
  { title: 'Verified doctors', description: 'Registration details are reviewed before a doctor profile appears publicly.' },
  { title: 'Private by design', description: 'MedReach is designed to keep personal healthcare information protected.' },
  { title: 'Continuous care', description: 'Built to keep appointments, follow-ups and medical context connected.' },
]

export function HomePage() {
  const [discovery, setDiscovery] = useState({ specializations: [], doctors: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [requestVersion, setRequestVersion] = useState(0)
  const retry = useCallback(() => {
    setLoading(true)
    setError(null)
    setRequestVersion(version => version + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    getHomeDiscovery(controller.signal)
      .then(data => setDiscovery(data))
      .catch(requestError => {
        if (requestError.name !== 'AbortError') setError(requestError.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [requestVersion])

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <div className="relative">
        <PublicHeader overlay />
        <main>
          <section className="relative isolate overflow-hidden bg-slate-950 text-white">
            <img className="absolute inset-0 -z-20 size-full object-cover object-center" src="/medreach-hero.png" alt="Doctor preparing for a remote healthcare consultation" />
            <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(2,18,38,0.92)_0%,rgba(4,28,53,0.78)_42%,rgba(4,28,53,0.32)_100%)]" aria-hidden="true" />
            <div className="mx-auto flex min-h-[700px] max-w-7xl items-end px-5 pb-16 pt-36 sm:px-8 sm:pb-20 lg:min-h-[780px] lg:px-10 lg:pb-24">
              <div className="max-w-3xl">
                <p className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-50 backdrop-blur-sm">
                  <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                  Remote healthcare, made easier
                </p>
                <h1 className="mt-6 max-w-3xl text-5xl font-bold leading-[1.02] tracking-[-0.05em] text-balance sm:text-6xl lg:text-[76px]">
                  Find verified doctors and care that continues.
                </h1>
                <p className="mt-6 max-w-2xl text-lg leading-8 text-blue-50/90 sm:text-xl">
                  Search by doctor, specialization or health concern. Compare professional details, choose an available slot and consult remotely.
                </p>
                <DiscoverySearch className="mt-8 max-w-3xl" />
                <p className="mt-4 text-sm text-blue-100/75">
                  Not for emergencies. If you need urgent help, contact your local emergency service.
                </p>
              </div>
            </div>
          </section>

          <section className="border-b border-slate-200 bg-white" aria-labelledby="specializations-heading">
          <div className="mx-auto max-w-7xl px-5 py-11 sm:px-8 lg:px-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-700">Browse care</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950" id="specializations-heading">
                  Popular specializations
                </h2>
              </div>
              <Link className="text-sm font-semibold text-blue-700 hover:text-blue-800" to="/doctors">
                View all doctors <span aria-hidden="true">→</span>
              </Link>
            </div>

            {loading && (
              <div className="mt-7 flex flex-wrap gap-3" aria-label="Loading specializations">
                {[1, 2, 3, 4, 5, 6].map(item => <span className="h-11 w-36 animate-pulse rounded-full bg-slate-100" key={item} />)}
              </div>
            )}

            {!loading && !error && (
              <div className="mt-7 flex flex-wrap gap-3">
                {discovery.specializations.map(specialization => (
                  <Link
                    className="inline-flex min-h-11 items-center rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800"
                    key={specialization.id}
                    to={`/doctors?specialization=${encodeURIComponent(specialization.name)}`}
                  >
                    {specialization.name}
                  </Link>
                ))}
              </div>
            )}

            {!loading && error && (
              <div className="mt-7 flex items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p>Specializations could not be loaded.</p>
                <button className="font-semibold underline underline-offset-2" onClick={retry} type="button">Try again</button>
              </div>
            )}
          </div>
        </section>

        <section className="bg-white" id="how-it-works" aria-labelledby="how-it-works-heading">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
            <div className="max-w-xl">
              <p className="text-sm font-semibold text-blue-700">A clearer path to care</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950" id="how-it-works-heading">Find. Choose. Consult.</h2>
              <p className="mt-3 leading-7 text-slate-600">Three straightforward steps from a health concern to a scheduled consultation.</p>
            </div>

            <ol className="mt-10 grid gap-8 border-t border-slate-200 pt-8 md:grid-cols-3 md:gap-10">
              {careSteps.map(step => (
                <li key={step.number}>
                  <span className="text-sm font-bold tracking-[0.14em] text-blue-700">{step.number}</span>
                  <h3 className="mt-3 text-xl font-semibold text-slate-950">{step.title}</h3>
                  <p className="mt-2 max-w-sm leading-7 text-slate-600">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-blue-700 text-white" aria-labelledby="trust-heading">
          <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:px-10 lg:py-16">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_2fr] lg:items-start">
              <div>
                <p className="text-sm font-semibold text-blue-100">Trust at every step</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]" id="trust-heading">Care should feel safe and connected.</h2>
              </div>

              <div className="grid gap-7 sm:grid-cols-3">
                {trustItems.map(item => (
                  <div className="border-t border-blue-400/70 pt-5" key={item.title}>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-blue-100">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        </main>
      </div>

      <PublicFooter />
    </div>
  )
}
