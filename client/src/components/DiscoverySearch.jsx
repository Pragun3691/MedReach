import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const searchTypes = [
  { value: 'problem', label: 'Health concern' },
  { value: 'specialization', label: 'Specialization' },
  { value: 'name', label: 'Doctor name' },
]

export function DiscoverySearch({ initialType = 'problem', initialQuery = '', className = 'mt-8' }) {
  const navigate = useNavigate()
  const [searchType, setSearchType] = useState(initialType)
  const [query, setQuery] = useState(initialQuery)

  function handleSubmit(event) {
    event.preventDefault()
    const normalizedQuery = query.trim()
    if (!normalizedQuery) return
    const params = new URLSearchParams({ [searchType]: normalizedQuery })
    navigate(`/doctors?${params.toString()}`)
  }

  return (
    <form className={`${className} rounded-[1.25rem] border border-white/20 bg-white p-2 text-[#111c2d] shadow-2xl`} onSubmit={handleSubmit} role="search">
      <div className="grid gap-2 sm:grid-cols-[170px_1fr_auto]">
        <label className="sr-only" htmlFor="search-type">Search by</label>
        <select className="min-h-13 rounded-xl border-0 bg-[#eef3ef] px-4 text-sm font-semibold outline-none ring-[#315c46] focus:ring-2" id="search-type" value={searchType} onChange={event => setSearchType(event.target.value)}>
          {searchTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
        <label className="relative block" htmlFor="doctor-search"><span className="sr-only">Search doctors</span><svg className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#536170]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" strokeLinecap="round" /></svg><input className="min-h-13 w-full rounded-xl border-0 px-11 text-base outline-none placeholder:text-[#7a8790] focus:ring-2 focus:ring-[#315c46]" id="doctor-search" placeholder="Try “rash” or “Dermatology”" required type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <button className="inline-flex min-h-13 items-center justify-center rounded-xl bg-[#315c46] px-7 text-sm font-semibold text-white hover:bg-[#234735] focus:outline-none focus:ring-2 focus:ring-[#315c46] focus:ring-offset-2" type="submit">Find doctors</button>
      </div>
    </form>
  )
}
