import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { DiscoverySelect } from './DiscoveryControls.jsx'

const searchTypes = [
  { value: 'problem', label: 'Health concern' },
  { value: 'specialization', label: 'Specialization' },
  { value: 'name', label: 'Doctor name' },
]

export function DiscoverySearch({ initialType = 'problem', initialQuery = '', className = 'mt-8', tone = 'default' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchType, setSearchType] = useState(initialType)
  const [query, setQuery] = useState(initialQuery)
  const isHero = tone === 'hero'

  function handleSubmit(event) {
    event.preventDefault()
    const normalizedQuery = query.trim()

    if (!normalizedQuery) return

    const params = new URLSearchParams({ [searchType]: normalizedQuery })
    navigate(`/doctors?${params.toString()}`, { replace: location.pathname === '/doctors' })
  }

  return (
    <form
      className={isHero
        ? `${className} w-full max-w-full rounded-xl border border-white/25 bg-[#F8F6F1]/95 p-1.5 shadow-[0_16px_38px_-26px_rgba(2,12,27,0.76)] transition-[border-color,box-shadow] duration-300 focus-within:border-[#A8E6CF]`
        : `${className} discovery-search discovery-search--doctor w-full max-w-full border border-white/60 bg-[#FCFBF7] p-1.5 shadow-[0_24px_55px_-32px_rgba(0,0,0,0.9)] transition-[border-color,box-shadow,transform] duration-300 focus-within:border-[#A8E6CF] focus-within:shadow-[0_26px_60px_-30px_rgba(0,0,0,0.96)]`}
      onSubmit={handleSubmit}
      role="search"
    >
      <div className={`grid min-w-0 gap-2 ${isHero ? 'sm:grid-cols-[170px_1fr_auto]' : 'sm:grid-cols-[190px_1fr_auto]'}`}>
        {isHero ? (
          <>
            <label className="sr-only" htmlFor="search-type">Search by</label>
            <select className="min-h-13 min-w-0 w-full rounded-lg border-0 bg-[#efede7] px-4 text-sm font-medium text-slate-800 outline-none ring-[#0F2747] focus:ring-2" id="search-type" value={searchType} onChange={event => setSearchType(event.target.value)}>
              {searchTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </>
        ) : (
          <DiscoverySelect ariaLabel="Search by" className="discovery-search__mode" options={searchTypes} placeholder="Health concern" value={searchType} onChange={setSearchType} variant="search" />
        )}

        <label className="relative block min-w-0" htmlFor="doctor-search">
          <span className="sr-only">Search doctors</span>
          <svg
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.6-3.6" strokeLinecap="round" />
          </svg>
          <input
            className={isHero
              ? 'min-h-13 min-w-0 w-full rounded-lg border-0 bg-white/90 px-11 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-[#0F2747]'
              : 'min-h-13 min-w-0 w-full rounded-lg border-0 bg-transparent px-11 text-base text-[#142A3E] outline-none placeholder:text-[#718078] focus:bg-white focus:ring-2 focus:ring-[#2C7A68]/70'}
            id="doctor-search"
            placeholder="Search doctors, specialization or concern…"
            required
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </label>

        <button
          className={isHero
            ? 'primary-cta group inline-flex min-h-13 items-center justify-center gap-3 rounded-lg bg-[#0F2747] px-7 text-sm font-semibold text-white hover:bg-[#173960] focus:outline-none focus:ring-2 focus:ring-[#0F2747] focus:ring-offset-2'
            : 'primary-cta group inline-flex min-h-13 items-center justify-center gap-3 rounded-lg bg-[#123454] px-7 text-sm font-semibold text-white shadow-[0_8px_20px_-12px_rgba(15,39,71,0.9)] hover:-translate-y-0.5 hover:bg-[#1A466D] hover:shadow-[0_12px_24px_-14px_rgba(15,39,71,0.95)] active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-[#2C7A68] focus:ring-offset-2 sm:min-w-44'}
          type="submit"
        >
          Find doctors
          <svg className="size-4 transition-transform duration-250 group-hover:translate-x-1" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M3 10h13M11.5 5.5 16 10l-4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </form>
  )
}
