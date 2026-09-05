import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DiscoverySearch } from '../components/DiscoverySearch.jsx'
import { PublicFooter } from '../components/PublicFooter.jsx'
import { PublicHeader } from '../components/PublicHeader.jsx'
import { getHomeDiscovery } from '../lib/api.js'

const careSteps = [
  { number: '01', title: 'Find', description: 'Search by doctor, specialization or the health concern you want help with.' },
  { number: '02', title: 'Choose', description: 'Review professional details and select a real 30-minute time slot.' },
  { number: '03', title: 'Consult', description: 'Connect remotely and keep future care organized in one journey.' },
]

const exploreItems = [
  { label: 'General', image: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Screenshot%202026-09-05%20131359-TjpsQxmpmvvJwchFH4rLTVIjrQVlX6.png' },
  { label: 'Pain management', image: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Screenshot%202026-09-05%20131446-mCiGIZK3F5sphfrYW6jsOvQmsVH2qI.png' },
  { label: 'Cold & flu', image: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Screenshot%202026-09-05%20130958-91muh5awrfi3qAGmgYqkTxzWX2t4IT.png' },
  { label: 'Dermatology', image: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Screenshot%202026-09-05%20131014-kaecxCSzbzZ2UEd8f5tkkPSsEx6EJy.png' },
]

const trustItems = [
  { title: 'Verified doctors', description: 'Registration details are reviewed before a doctor profile appears publicly.' },
  { title: 'Private by design', description: 'Your healthcare information is handled with care and discretion.' },
  { title: 'Continuous care', description: 'Appointments, follow-ups and medical context stay connected.' },
]

function Arrow() {
  return <span aria-hidden="true" className="ml-3 text-xl leading-none">→</span>
}

export function HomePage() {
  const [discovery, setDiscovery] = useState({ specializations: [], doctors: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [requestVersion, setRequestVersion] = useState(0)
  const retry = useCallback(() => { setLoading(true); setError(null); setRequestVersion(version => version + 1) }, [])

  useEffect(() => {
    const controller = new AbortController()
    getHomeDiscovery(controller.signal)
      .then(data => setDiscovery(data))
      .catch(requestError => { if (requestError.name !== 'AbortError') setError(requestError.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [requestVersion])

  return (
    <div className="min-h-screen bg-[#f8f8f4] text-[#111c2d]">
      <PublicHeader />
      <main>
        <section className="relative isolate min-h-[620px] overflow-hidden bg-[#111c2d] text-white">
          <img className="absolute inset-0 -z-10 size-full object-cover object-center opacity-55" src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Screenshot%202026-09-05%20130958-91muh5awrfi3qAGmgYqkTxzWX2t4IT.png" alt="Doctor working in a research laboratory" />
          <div className="absolute inset-0 -z-10 bg-[#111c2d]/65" />
          <div className="mx-auto flex min-h-[620px] max-w-7xl flex-col justify-end px-5 pb-14 pt-24 sm:px-8 lg:px-10 lg:pb-20">
            <div className="max-w-3xl">
              <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-[#b7e9b0]">Your care, considered</p>
              <h1 className="max-w-3xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-8xl">Better access to better care.</h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-white/80">Find the right doctor for your health concern, book a time that works for you, and make care easier to continue.</p>
              <DiscoverySearch className="mt-8 max-w-3xl" />
              <p className="mt-4 text-xs text-white/60">Not for emergencies. If you need urgent help, contact your local emergency service.</p>
            </div>
          </div>
        </section>

        <section className="bg-[#b7e9b0]" aria-labelledby="specializations-heading">
          <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:px-10 lg:py-20">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#315c46]">Explore care</p><h2 id="specializations-heading" className="mt-3 max-w-xl text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">Start with what matters to you.</h2></div>
              <Link className="inline-flex items-center font-semibold text-[#111c2d] underline decoration-1 underline-offset-4" to="/doctors">View all doctors <Arrow /></Link>
            </div>
            <div className="mt-12 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {exploreItems.map(item => <Link className="group" key={item.label} to={`/doctors?specialization=${encodeURIComponent(item.label)}`}><div className="aspect-[1.18] overflow-hidden rounded-[2rem] bg-[#d8e7d5]"><img className="size-full object-cover grayscale transition duration-500 group-hover:scale-105 group-hover:grayscale-0" src={item.image} alt="" /></div><div className="mt-4 flex items-center justify-between text-xl font-semibold"><span>{item.label}</span><Arrow /></div></Link>)}
            </div>
            {!loading && error && <div className="mt-8 flex gap-4 text-sm text-[#315c46]"><span>Specializations could not be loaded.</span><button className="font-semibold underline" onClick={retry} type="button">Try again</button></div>}
            {!loading && !error && discovery.specializations.length > 0 && <p className="mt-10 text-sm text-[#315c46]">{discovery.specializations.length} care areas available to explore.</p>}
          </div>
        </section>

        <section className="bg-[#f8f8f4]" id="how-it-works" aria-labelledby="how-it-works-heading">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10 lg:py-24">
            <div className="grid gap-12 lg:grid-cols-[0.8fr_1.5fr] lg:gap-24"><div><p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#315c46]">A clearer path</p><h2 id="how-it-works-heading" className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">Care that moves with you.</h2></div><ol className="grid gap-10 border-t border-[#cfd7d2] pt-7 md:grid-cols-3 md:gap-8">{careSteps.map(step => <li key={step.number}><span className="font-mono text-sm text-[#315c46]">{step.number}</span><h3 className="mt-6 text-2xl font-semibold">{step.title}</h3><p className="mt-3 leading-7 text-[#536170]">{step.description}</p></li>)}</ol></div>
          </div>
        </section>

        <section className="grid lg:grid-cols-2"><div className="min-h-[420px] bg-[#111c2d] p-8 text-white sm:p-12 lg:p-20"><p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#b7e9b0]">About MedReach</p><h2 className="mt-5 max-w-lg text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">A more human way to reach healthcare.</h2><p className="mt-7 max-w-md leading-7 text-white/70">We believe finding care should be clear, calm and connected. MedReach helps you take the next step with confidence.</p><Link className="mt-10 inline-flex items-center rounded-full border border-white/60 px-5 py-3 font-semibold hover:bg-white hover:text-[#111c2d]" to="/doctors">Learn more <Arrow /></Link></div><div className="min-h-[420px] bg-[#d9e8e3] bg-cover bg-center" style={{ backgroundImage: 'url(https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Screenshot%202026-09-05%20131014-kaecxCSzbzZ2UEd8f5tkkPSsEx6EJy.png)' }} aria-label="A mother and child enjoying time together" role="img" /></section>

        <section className="bg-white" aria-labelledby="trust-heading"><div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10 lg:py-24"><div className="grid gap-12 lg:grid-cols-[0.85fr_1.4fr] lg:gap-24"><div><p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#315c46]">Why MedReach</p><h2 id="trust-heading" className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">Built around trust.</h2></div><div className="grid gap-8 sm:grid-cols-3">{trustItems.map(item => <div className="border-t border-[#cfd7d2] pt-5" key={item.title}><h3 className="text-xl font-semibold">{item.title}</h3><p className="mt-3 leading-7 text-[#536170]">{item.description}</p></div>)}</div></div></div></section>
      </main>
      <PublicFooter />
    </div>
  )
}
