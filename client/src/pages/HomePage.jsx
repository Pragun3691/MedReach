import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import continuityImage from '../assets/care-continuity.jpg'
import doctorDiscoveryImage from '../assets/doctor-discovery.jpg'
import doctorInsightsImage from '../assets/doctor-insights.jpg'
import heroImage from '../assets/medreach-home-hero.jpg'
import medicineImage from '../assets/medicine-access-v2.jpg'
import { DiscoverySearch } from '../components/DiscoverySearch.jsx'
import { PublicFooter } from '../components/PublicFooter.jsx'
import { PublicHeader } from '../components/PublicHeader.jsx'
import { getHomeDiscovery } from '../lib/api.js'

const specializationOrder = ['General Medicine', 'Dermatology', 'Cardiology', 'Gynecology', 'Pediatrics', 'Psychiatry']

const careSteps = [
  { number: '01', title: 'Search', description: 'Search by doctor, specialization or health concern.' },
  { number: '02', title: 'Choose', description: 'Choose real availability and a 30-minute slot.' },
  { number: '03', title: 'Meet', description: 'Meet the doctor remotely.' },
  { number: '04', title: 'Continue', description: 'Keep consultations, prescriptions and follow-ups connected.' },
]

const trustItems = [
  { title: 'Professional review', description: 'Registration information is reviewed before approved doctor profiles are made public.' },
  { title: 'Permission-led privacy', description: 'Protected health information is controlled by permissions throughout the care experience.' },
  { title: 'One connected journey', description: 'Appointments, consultations and follow-ups remain part of one continuous-care journey.' },
]

function SpecializationIcon({ name }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 1.7,
  }

  return (
    <svg aria-hidden="true" className="size-24 sm:size-28" viewBox="0 0 64 64" {...common}>
      {name === 'General Medicine' && (
        <>
          <path d="m17.5 46.5 29-29a10.6 10.6 0 0 0-15-15l-29 29a10.6 10.6 0 0 0 15 15Z" transform="translate(7.5 7.5) scale(.78)" />
          <path d="m22 42 20-20M24.5 18.5h11M30 13v11" />
          <path d="M37 40c3-6.5 8.8-9.6 17-9-1 8.6-5.7 13.8-14 15M37 40c-1.7-5.2-5.5-8.2-11.5-9 0 6.5 3.2 10.5 9.5 12" />
        </>
      )}
      {name === 'Dermatology' && (
        <>
          <path d="M35 10c-10 0-18 7.8-18 18 0 7 3.8 13 9.5 16.1V54H39" />
          <path d="M35 17c4.7 1.2 7 4.1 7 8.8v4.7l4 4h-5v5c0 3-1.8 4.5-5.5 4.5H31" />
          <path d="M25 27c2.3-2 4.7-2 7 0M24.5 34c2 1.7 4 2.5 6 2.5" />
          <circle cx="46.5" cy="45.5" r="7.5" />
          <path d="m52 51 6 6M44 43.5h5M46.5 41v5" />
        </>
      )}
      {name === 'Cardiology' && (
        <>
          <path d="M32 55S8 41 8 23c0-9 5.8-14 13.2-14 4.8 0 8.7 2.6 10.8 6.4C34.1 11.6 38 9 42.8 9 50.2 9 56 14 56 23c0 18-24 32-24 32Z" />
          <path d="M11 32h11l4-8 7 16 5-10 4 2h11" />
        </>
      )}
      {name === 'Gynecology' && (
        <>
          <path d="M21 12c0 10.5 3.4 17 11 19M43 12c0 10.5-3.4 17-11 19" />
          <path d="M16 9c0 7 2 11 5 14M48 9c0 7-2 11-5 14M32 31v24M24 47h16" />
          <circle cx="32" cy="25" r="7" />
        </>
      )}
      {name === 'Pediatrics' && (
        <>
          <path d="M20 22c-5.3.3-8-2-8-6 0-3.8 3-6.5 6.5-6.5 3 0 5.2 1.7 6.3 4.2M44 22c5.3.3 8-2 8-6 0-3.8-3-6.5-6.5-6.5-3 0-5.2 1.7-6.3 4.2" />
          <path d="M32 12c-10 0-17 7.5-17 18 0 11.7 7.6 21 17 21s17-9.3 17-21c0-10.5-7-18-17-18Z" />
          <path d="M24 34c2.2 2.7 4.9 4 8 4s5.8-1.3 8-4M28 43h8" />
          <circle cx="25" cy="28" r="1.35" fill="currentColor" stroke="none" />
          <circle cx="39" cy="28" r="1.35" fill="currentColor" stroke="none" />
          <path d="M32 18c0-4.5 3.5-7 7-7" />
        </>
      )}
      {name === 'Psychiatry' && (
        <>
          <path d="M31.5 54v-9c-2.7 3.2-7.5 2.1-8.4-1.5-4.4.8-7.6-2.8-6.1-6.8-4.3-1.8-4.5-7.4-.6-9.7-2.2-4.3.7-9 5.1-9.3.3-4.7 5.6-7.3 9.6-4.8 2.7-4 8.8-3.6 10.8.8 4.7-1.3 9 2.8 8.2 7.5 4.6 1.1 6.2 6.7 3 10 3.1 3.7.4 9.3-4.5 9.5-.6 4.7-5.8 7.2-9.8 4.7V54" />
          <path d="M31.5 16v29M31.5 24c-3.8 0-6-1.8-6.5-5.5M31.5 32c-4.6 0-7.3 2-8 6M31.5 21c3.7 0 6-1.8 7-5.5M31.5 28c5 0 7.8 2.3 8.5 7M31.5 40c3.2 0 5.3 1.5 6.3 4.5" />
        </>
      )}
    </svg>
  )
}

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

  useEffect(() => {
    const revealItems = document.querySelectorAll('[data-home-reveal]')
    if (!('IntersectionObserver' in window)) {
      revealItems.forEach(item => item.classList.add('is-visible'))
      return undefined
    }

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        }
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -40px' })

    revealItems.forEach(item => observer.observe(item))
    return () => observer.disconnect()
  }, [loading, error])

  const specializations = specializationOrder.map(name => (
    discovery.specializations.find(item => item.name === name) ?? { id: name, name }
  ))

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F8F6F1] text-[#1D2A35]">
      <PublicHeader overlay />
      <main>
        <section className="relative isolate flex min-h-[88svh] overflow-hidden bg-[#0F2747] text-white" aria-labelledby="home-hero-heading">
          <img alt="A doctor providing remote care from her consultation room" className="hero-image absolute inset-0 -z-20 size-full object-cover object-[72%_center] sm:object-[70%_center] lg:object-right" fetchPriority="high" src={heroImage} />
          <div className="hero-image-overlay absolute inset-0 -z-10" aria-hidden="true" />
          <div className="mx-auto flex w-full max-w-7xl items-end px-5 pb-12 pt-32 sm:px-8 sm:pb-16 sm:pt-36 lg:px-10 lg:pb-20 lg:pt-40">
            <div className="w-full max-w-4xl">
              <p className="hero-reveal hero-reveal--1 flex items-center gap-3 text-xs font-bold tracking-[0.18em] text-[#A8E6CF] sm:text-sm"><span className="h-px w-8 bg-[#A8E6CF]" aria-hidden="true" />REMOTE CARE, MADE CLEARER</p>
              <h1 className="hero-reveal hero-reveal--2 mt-5 max-w-3xl text-[2.4rem] font-medium leading-[1.04] tracking-[-0.04em] text-white sm:text-[3.5rem] lg:text-[4rem]" id="home-hero-heading">Care that continues, wherever you are.</h1>
              <p className="hero-reveal hero-reveal--3 mt-5 max-w-2xl text-base leading-7 text-white/78 sm:text-lg sm:leading-8">Find verified doctors, view real availability, book remote consultations and keep follow-up care connected.</p>
              <DiscoverySearch className="hero-reveal hero-reveal--4 mt-7 sm:mt-9" tone="hero" />
              <p className="hero-reveal hero-reveal--5 mt-4 text-xs leading-5 text-white/68 sm:text-sm">Not for emergencies. If you need urgent help, contact your local emergency service.</p>
            </div>
          </div>
        </section>

        <section className="specializations-section" id="specializations" aria-labelledby="specializations-heading">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24 lg:px-10 lg:py-28">
            <div className="grid gap-7 md:grid-cols-[1fr_auto] md:items-end" data-home-reveal>
              <div className="max-w-2xl">
                <p className="editorial-eyebrow">Browse care</p>
                <h2 className="editorial-heading mt-4" id="specializations-heading">Start with the care you need.</h2>
                <p className="mt-5 max-w-xl leading-7 text-[#34534D]">Choose a starting point and meet doctors with the right focus for your concern.</p>
              </div>
              <Link className="arrow-link group w-fit" to="/doctors">View all doctors <span className="arrow-link__icon" aria-hidden="true">→</span></Link>
            </div>

            {loading ? (
              <div className="specialization-grid mt-12" aria-label="Loading specializations">
                {[1, 2, 3, 4, 5, 6].map(item => <span className="h-44 animate-pulse bg-white/16" key={item} />)}
              </div>
            ) : (
              <div className="specialization-grid mt-12">
                {specializations.map((specialization, index) => (
                  <Link className="specialization-link group" data-home-reveal key={specialization.id} style={{ '--reveal-delay': `${(index % 3) * 60}ms` }} to={`/doctors?specialization=${encodeURIComponent(specialization.name)}`}>
                    <span className="specialization-icon"><SpecializationIcon name={specialization.name} /></span>
                    <span className="mt-7 flex items-end justify-between gap-4">
                      <span className="text-xl font-medium tracking-[-0.025em] text-[#0F2747] sm:text-2xl">{specialization.name}</span>
                      <span className="specialization-arrow" aria-hidden="true">→</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}

            {!loading && error && (
              <div className="mt-7 flex flex-wrap items-center gap-4 text-sm text-[#34534D]" role="status">
                <p>Live specialization data is temporarily unavailable. You can still browse by care area.</p>
                <button className="font-semibold underline decoration-[#2C7A68]/50 underline-offset-4 hover:decoration-[#2C7A68]" onClick={retry} type="button">Try again</button>
              </div>
            )}
          </div>
        </section>

        <section className="bg-[#F8F6F1]" id="how-it-works" aria-labelledby="how-it-works-heading">
          <div className="mx-auto max-w-7xl px-5 py-18 sm:px-8 sm:py-22 lg:px-10 lg:py-24">
            <div className="grid gap-7 lg:grid-cols-[0.92fr_1.08fr] lg:items-end" data-home-reveal>
              <div>
                <p className="editorial-eyebrow">Your care journey</p>
                <h2 className="editorial-heading mt-4" id="how-it-works-heading">Clear from search to follow-up.</h2>
              </div>
              <p className="max-w-xl text-base leading-7 text-[#53616D] lg:justify-self-end lg:text-lg lg:leading-8">A simple path to remote care, with the context from each step ready for the next one.</p>
            </div>

            <ol className="journey-track mt-12">
              {careSteps.map((step, index) => (
                <li className="journey-step" data-home-reveal key={step.number} style={{ '--reveal-delay': `${index * 55}ms` }}>
                  <span className="journey-marker">{step.number}</span>
                  <div className="journey-copy">
                    <h3 className="text-2xl font-medium tracking-[-0.025em] text-[#0F2747]">{step.title}</h3>
                    <p className="mt-3 max-w-[16rem] leading-7 text-[#53616D]">{step.description}</p>
                  </div>
                  {index < careSteps.length - 1 && <span className="journey-direction" aria-hidden="true">→</span>}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="continuity-section" id="continuity" aria-labelledby="continuity-heading">
          <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[0.9fr_1.1fr] lg:items-stretch">
            <div className="continuity-copy px-5 py-20 sm:px-8 sm:py-24 lg:flex lg:flex-col lg:justify-center lg:px-16 lg:py-28" data-home-reveal>
              <p className="editorial-eyebrow">Continuity matters</p>
              <h2 className="editorial-heading mt-4 max-w-xl" id="continuity-heading">Care shouldn’t restart with every appointment.</h2>
              <p className="mt-6 max-w-lg text-base leading-7 text-[#53616D] sm:text-lg sm:leading-8">MedReach keeps consultations, follow-ups and the context around your care connected, so the next conversation can begin where the last one ended.</p>
              <Link className="arrow-link group mt-8" to="/register">Create your account <span className="arrow-link__icon" aria-hidden="true">→</span></Link>
            </div>
            <div className="h-[29rem] overflow-hidden lg:h-auto lg:min-h-[42rem]" data-home-reveal="image">
              <img alt="A patient reviewing her follow-up care plan at home" className="continuity-image editorial-image size-full object-cover object-[72%_center] sm:object-[78%_center] lg:object-[84%_center]" decoding="async" loading="lazy" src={continuityImage} />
            </div>
          </div>
        </section>

        <section className="bg-[#0F2747] text-white" id="doctor-discovery" aria-labelledby="doctor-discovery-heading">
          <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[1.08fr_0.92fr] lg:items-stretch">
            <div className="order-2 h-[29rem] overflow-hidden lg:order-1 lg:h-auto lg:min-h-[41rem]" data-home-reveal="image">
              <img alt="A doctor speaking attentively during a remote consultation" className="editorial-image size-full object-cover object-center" decoding="async" loading="lazy" src={doctorDiscoveryImage} />
            </div>
            <div className="order-1 px-5 py-20 sm:px-8 sm:py-24 lg:order-2 lg:flex lg:flex-col lg:justify-center lg:px-16 lg:py-24" data-home-reveal>
              <p className="editorial-eyebrow editorial-eyebrow--light">Doctor discovery</p>
              <h2 className="editorial-heading editorial-heading--light mt-4 max-w-xl" id="doctor-discovery-heading">Know who you’re consulting before you book.</h2>
              <p className="mt-6 max-w-lg text-base leading-7 text-white/68 sm:text-lg sm:leading-8">Review verified profiles, qualifications and professional information, explore each doctor’s specialization, then choose real availability and a clear path to remote care.</p>
              <Link className="arrow-link arrow-link--light group mt-8" to="/doctors">Find a doctor <span className="arrow-link__icon" aria-hidden="true">→</span></Link>
            </div>
          </div>
        </section>

        <section className="bg-[#F8F6F1]" id="care-beyond" aria-labelledby="care-beyond-heading">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24 lg:px-10 lg:py-28">
            <div className="grid gap-7 lg:grid-cols-[1.05fr_0.95fr] lg:items-end" data-home-reveal>
              <div>
                <p className="editorial-eyebrow">Beyond the consultation</p>
                <h2 className="editorial-heading mt-4" id="care-beyond-heading">More of your healthcare, connected.</h2>
              </div>
              <p className="max-w-xl text-base leading-7 text-[#53616D] lg:justify-self-end lg:text-lg lg:leading-8">A considered look at where MedReach is headed—from prescription-connected medicine access to useful guidance from verified doctors.</p>
            </div>

            <div className="mt-12 grid gap-5 lg:grid-cols-[1.18fr_0.82fr] lg:grid-rows-2">
              <article className="feature-teaser group relative min-h-[35rem] overflow-hidden bg-[#0F2747] text-white lg:row-span-2" data-home-reveal="image">
                <img alt="Prescription medicines arranged with a care instruction sheet" className="feature-teaser__image absolute inset-0 size-full object-cover object-[48%_center]" decoding="async" loading="lazy" src={medicineImage} />
                <div className="absolute inset-0 bg-gradient-to-t from-[#07182c]/96 via-[#07182c]/48 to-[#07182c]/5" aria-hidden="true" />
                <div className="absolute inset-x-0 bottom-0 p-7 sm:p-10">
                  <p className="text-xs font-bold tracking-[0.18em] text-[#A8E6CF]">MEDICINES</p>
                  <h3 className="mt-3 max-w-xl text-3xl font-medium tracking-[-0.035em] sm:text-4xl">Prescription-connected access, without losing the care context.</h3>
                  <p className="mt-4 max-w-xl leading-7 text-white/72">Designed to make prescribed medicines easier to understand, organize and follow within the wider care journey.</p>
                  <span className="mt-7 block h-px w-10 bg-[#A8E6CF]/70" aria-hidden="true" />
                </div>
              </article>

              <article className="feature-teaser group grid min-h-72 overflow-hidden bg-[#EEE8DE] sm:grid-cols-[0.92fr_1.08fr] lg:min-h-0" data-home-reveal>
                <div className="overflow-hidden">
                  <img alt="A doctor reviewing educational healthcare material" className="feature-teaser__image h-56 w-full object-cover object-[70%_center] sm:h-full" decoding="async" loading="lazy" src={doctorInsightsImage} />
                </div>
                <div className="flex flex-col justify-between p-7 sm:p-8">
                  <p className="text-xs font-bold tracking-[0.18em] text-[#2C7A68]">DOCTOR INSIGHTS</p>
                  <div className="mt-10">
                    <h3 className="text-2xl font-medium tracking-[-0.025em] text-[#0F2747]">Guidance from verified doctors.</h3>
                    <p className="mt-3 text-sm leading-6 text-[#53616D]">Educational perspectives grounded in clinical experience, presented with clarity.</p>
                    <Link className="arrow-link group/link mt-5 text-sm" to="/doctors">Meet our doctors <span className="arrow-link__icon" aria-hidden="true">→</span></Link>
                  </div>
                </div>
              </article>

              <article className="feature-teaser group flex min-h-64 flex-col justify-between bg-[#D8ECE3] p-7 sm:p-8" data-home-reveal>
                <p className="text-xs font-bold tracking-[0.18em] text-[#245F54]">HEALTH ARTICLES</p>
                <div className="mt-12 max-w-md">
                  <h3 className="text-2xl font-medium tracking-[-0.025em] text-[#0F2747]">Useful reading for better-informed care.</h3>
                  <p className="mt-3 text-sm leading-6 text-[#45645D]">A considered home for clear, plain-language health education as MedReach grows.</p>
                  <span className="mt-6 block h-px w-10 bg-[#2C7A68]/45" aria-hidden="true" />
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="trust-section" id="trust" aria-labelledby="trust-heading">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-18 lg:px-10 lg:py-20">
            <div className="grid gap-10 lg:grid-cols-[0.74fr_1.26fr] lg:gap-20">
              <div data-home-reveal>
                <p className="editorial-eyebrow">Trust at every step</p>
                <h2 className="editorial-heading mt-4 max-w-lg" id="trust-heading">Built for care that feels considered.</h2>
              </div>
              <div>
                {trustItems.map((item, index) => (
                  <article className="trust-row" data-home-reveal key={item.title} style={{ '--reveal-delay': `${index * 55}ms` }}>
                    <span className="text-xs font-bold tracking-[0.18em] text-[#2C7A68]">0{index + 1}</span>
                    <h3 className="text-xl font-medium tracking-[-0.02em] text-[#0F2747]">{item.title}</h3>
                    <p className="leading-7 text-[#3E5A54]">{item.description}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  )
}
