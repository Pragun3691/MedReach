import { Link } from 'react-router-dom'

export function Brand({ inverse = false }) {
  return (
    <Link className="inline-flex items-center gap-2.5" to="/" aria-label="MedReach home">
      <span
        className={`grid size-9 place-items-center rounded-[10px] ${inverse ? 'bg-white text-blue-700' : 'bg-blue-700 text-white'}`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      </span>
      <span className={`text-xl font-bold tracking-[-0.03em] ${inverse ? 'text-white' : 'text-slate-950'}`}>
        Med<span className={inverse ? 'text-blue-200' : 'text-blue-700'}>Reach</span>
      </span>
    </Link>
  )
}
