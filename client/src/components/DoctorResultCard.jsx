import { Link } from 'react-router-dom'
import { resolveDoctorPortrait } from '../lib/doctor-portraits.js'

function initials(name) {
  return name
    .replace(/^Dr\.\s*/i, '')
    .split(' ')
    .slice(0, 2)
    .map(part => part[0])
    .join('')
}

function formatAvailability(value) {
  if (!value) return null

  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))
}

function formatSelectedDate(value) {
  if (!value) return null

  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(`${value}T12:00:00+05:30`))
}

export function DoctorResultCard({ doctor, selectedDate }) {
  const availability = selectedDate
    ? `Available ${formatSelectedDate(selectedDate)}`
    : formatAvailability(doctor.nextAvailableAt)
  const imageUrl = resolveDoctorPortrait(doctor)

  return (
    <article className="doctor-result group">
      <div className="doctor-result__portrait">
        {imageUrl
          ? <img alt={`Portrait of ${doctor.fullName}`} className="size-full object-cover" src={imageUrl} />
          : <span aria-hidden="true">{initials(doctor.fullName)}</span>}
      </div>

      <div className="doctor-result__content">
        <div className="doctor-result__heading flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h2 className="doctor-result__name">{doctor.fullName}</h2>
          <span className="verified-doctor">
            <svg className="size-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M10 2.5 16 5v4.4c0 3.7-2.4 6.5-6 8.1-3.6-1.6-6-4.4-6-8.1V5l6-2.5Z" strokeLinejoin="round" />
              <path d="m7 10 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Verified doctor
          </span>
        </div>
        <p className="doctor-result__specialization">
          {doctor.specializations.map(specialization => specialization.name).join(' · ')}
        </p>
        <div className="doctor-result__metadata">
          {doctor.qualification && <span>{doctor.qualification}</span>}
          <span>{doctor.experienceYears} years experience</span>
          {doctor.clinic?.name && <span>{doctor.clinic.name}</span>}
        </div>
        {doctor.bio && <p className="doctor-result__bio">{doctor.bio}</p>}
      </div>

      <div className="doctor-result__decision">
        <div className="doctor-result__decision-details">
          <div>
            <p className="doctor-result__label">{selectedDate ? 'Selected date' : 'Next available'}</p>
            <p className={`doctor-result__availability ${availability ? 'text-[#246B59]' : 'text-[#68736F]'}`}>
              {availability ?? 'No upcoming slots'}
            </p>
          </div>
          {doctor.defaultFee !== null && doctor.defaultFee !== undefined && (
            <div>
              <p className="doctor-result__label">Consultation fee</p>
              <p className="doctor-result__fee">₹{doctor.defaultFee}</p>
            </div>
          )}
        </div>
        <Link className="doctor-result__action" to={`/doctors/${doctor.id}${selectedDate ? `?date=${selectedDate}` : ''}`}>
          View profile <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  )
}
