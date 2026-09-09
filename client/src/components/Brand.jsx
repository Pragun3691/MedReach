import { Link } from 'react-router-dom'

function TemporaryWordmark({ inverse }) {
  return (
    <span className="brand-wordmark" data-inverse={inverse ? 'true' : 'false'}>
      MedReach
    </span>
  )
}

export function Brand({ inverse = false, label = 'MedReach home' }) {
  return (
    <Link className="brand-slot" to="/" aria-label={label}>
      <TemporaryWordmark inverse={inverse} />
    </Link>
  )
}
