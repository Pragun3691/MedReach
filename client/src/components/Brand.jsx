import { Link } from 'react-router-dom'

function TemporaryWordmark({ inverse }) {
  return (
    <span className="brand-wordmark" data-inverse={inverse ? 'true' : 'false'}>
      MedReach
    </span>
  )
}

export function Brand({ inverse = false }) {
  return (
    <Link className="brand-slot" to="/" aria-label="MedReach home">
      <TemporaryWordmark inverse={inverse} />
    </Link>
  )
}
