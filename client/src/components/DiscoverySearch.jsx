import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const searchTypes = [
  { value: 'problem', label: 'Health concern' },
  { value: 'specialization', label: 'Specialization' },
  { value: 'name', label: 'Doctor name' },
]

export function DiscoverySearch({ initialType = 'problem', initialQuery = '', className = 'mt-8', tone = 'default' }) {
  const navigate = useNavigate()
  const [searchType, setSearchType] = useState(initialType)
  const [query, setQuery] = useState(initialQuery)
  const isHero = tone === 'hero'

  function handleSubmit(event) {
    event.preventDefault()
    const normalizedQuery = query.trim()

    if (!normalizedQuery) return

    const params = new URLSearchParams({ [searchType]: normalizedQuery })
    navigate(`/doctors?${params.toString()}`)
  }

  return (
    <form
      className={isHero
        ? `${className} rounded-xl border border-white/25 bg-[#F8F6F1]/95 p-1.5 shadow-[0_16px_38px_-26px_rgba(2,12,27,0.76)] transition-[border-color,box-shadow] duration-300 focus-within:border-[#A8E6CF]`
        : `${className} rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_45px_-24px_rgba(15,23,42,0.35)]`}
      onSubmit={handleSubmit}
      role="search"
    >
      <div className={`grid gap-2 ${isHero ? 'sm:grid-cols-[170px_1fr_auto]' : 'sm:grid-cols-[180px_1fr_auto]'}`}>
        <label className="sr-only" htmlFor="search-type">Search by</label>
        <select
          className={isHero
            ? 'min-h-13 rounded-lg border-0 bg-[#efede7] px-4 text-sm font-medium text-slate-800 outline-none ring-[#0F2747] focus:ring-2'
            : 'min-h-13 rounded-xl border-0 bg-slate-50 px-4 text-sm font-semibold text-slate-800 outline-none ring-blue-600 focus:ring-2'}
          id="search-type"
          value={searchType}
          onChange={event => setSearchType(event.target.value)}
        >
          {searchTypes.map(type => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>

        <label className="relative block" htmlFor="doctor-search">
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
              ? 'min-h-13 w-full rounded-lg border-0 bg-white/90 px-11 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-[#0F2747]'
              : 'min-h-13 w-full rounded-xl border-0 px-11 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-blue-600'}
            id="doctor-search"
            placeholder="Try “rash” or “Dermatology”"
            required
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </label>

        <button
          className={isHero
            ? 'group inline-flex min-h-13 items-center justify-center gap-3 rounded-lg bg-[#0F2747] px-7 text-sm font-semibold text-white transition-[background-color,transform] duration-250 hover:-translate-y-0.5 hover:bg-[#173960] focus:outline-none focus:ring-2 focus:ring-[#0F2747] focus:ring-offset-2 active:translate-y-0'
            : 'inline-flex min-h-13 items-center justify-center rounded-xl bg-blue-700 px-7 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2'}
          type="submit"
        >
          Find doctors
          {isHero && (
            <svg className="size-4 transition-transform duration-250 group-hover:translate-x-1" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M3 10h13M11.5 5.5 16 10l-4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>
    </form>
  )
}
