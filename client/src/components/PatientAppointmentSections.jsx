import { Link } from 'react-router-dom'
import { getAppointmentDisplayStatus } from '../lib/appointment-display.js'
import { formatAppointmentDate, formatAppointmentTime, formatFee } from '../lib/appointment-format.js'
import { resolveDoctorPortrait } from '../lib/doctor-portraits.js'
import { useLanguage } from '../hooks/useLanguage.js'
import { specializationDisplayName } from '../i18n/messages.js'

function doctorInitials(name) {
  return name.replace(/^Dr\.\s*/i, '').split(' ').slice(0, 2).map(part => part[0]).join('')
}

function DoctorPortrait({ doctor, compact = false, t }) {
  const portrait = resolveDoctorPortrait(doctor)
  return (
    <div className={compact ? 'patient-history__portrait' : 'patient-upcoming__portrait'}>
      {portrait
        ? <img alt={t('doctorCard.portrait', { name: doctor.fullName })} src={portrait} />
        : <span aria-hidden="true">{doctorInitials(doctor.fullName)}</span>}
    </div>
  )
}

function AppointmentStatus({ appointment, t }) {
  const displayStatus = getAppointmentDisplayStatus(appointment)
  return <span className="patient-appointment-status" data-status={displayStatus}>{t(`status.${displayStatus}`)}</span>
}

function UpcomingAppointment({ appointment, featured, language, locale, t }) {
  return (
    <article className="patient-upcoming" data-featured={featured || undefined}>
      <div className="patient-upcoming__topline">
        <p>{featured ? t('appointments.upcomingConsultation') : t('appointments.scheduledConsultation')}</p>
        <AppointmentStatus appointment={appointment} t={t} />
      </div>
      <div className="patient-upcoming__body">
        <DoctorPortrait doctor={appointment.doctor} t={t} />
        <div className="patient-upcoming__identity">
          <h3>{appointment.doctor.fullName}</h3>
          <p>{appointment.doctor.specializations.map(item => specializationDisplayName(language, item.name)).join(' · ')}</p>
        </div>
        <div className="patient-upcoming__schedule">
          <p>{formatAppointmentDate(appointment.slot.startAt, { locale })}</p>
          <strong>{formatAppointmentTime(appointment.slot.startAt, locale)} IST <span aria-hidden="true">·</span> {t('booking.duration')}</strong>
          <span>{t('appointments.remote')}</span>
        </div>
        <div className="patient-upcoming__decision">
          <p>{formatFee(appointment.feeSnapshot, locale)}</p>
          <Link to={`/appointments/${appointment.id}`}>{t('appointments.viewAppointment')} <span aria-hidden="true">→</span></Link>
        </div>
      </div>
    </article>
  )
}

function HistoryAppointment({ appointment, language, locale, t }) {
  return (
    <article className="patient-history">
      <DoctorPortrait compact doctor={appointment.doctor} t={t} />
      <div className="patient-history__identity">
        <h3>{appointment.doctor.fullName}</h3>
        <p>{appointment.doctor.specializations.map(item => specializationDisplayName(language, item.name)).join(' · ')}</p>
      </div>
      <p className="patient-history__schedule">
        {formatAppointmentDate(appointment.slot.startAt, { short: true, locale })}<span aria-hidden="true"> · </span>{formatAppointmentTime(appointment.slot.startAt, locale)} IST
      </p>
      <div className="patient-history__status"><AppointmentStatus appointment={appointment} t={t} /></div>
      <Link className="patient-history__link" to={`/appointments/${appointment.id}`}>{t('appointments.viewDetails')} <span aria-hidden="true">→</span></Link>
    </article>
  )
}

function SectionHeading({ eyebrow, heading, count, unit, headingId }) {
  return (
    <div className="patient-appointments__section-heading">
      <div><p>{eyebrow}</p><h2 id={headingId}>{heading}</h2></div>
      <span>{count} {unit}</span>
    </div>
  )
}

export function PatientAppointmentSections({ appointments }) {
  const { language, locale, t } = useLanguage()
  const count = value => new Intl.NumberFormat(locale).format(value)
  return (
    <div className="patient-appointments__sections">
      <section aria-labelledby="upcoming-appointments-heading">
        <SectionHeading count={count(appointments.upcoming.length)} eyebrow={t('appointments.scheduledCare')} heading={t('appointments.upcoming')} headingId="upcoming-appointments-heading" unit={t(appointments.upcoming.length === 1 ? 'appointments.appointment' : 'appointments.appointments')} />
        {appointments.upcoming.length > 0 ? (
          <div className="patient-upcoming-list">
            {appointments.upcoming.map((appointment, index) => <UpcomingAppointment appointment={appointment} featured={index === 0} key={appointment.id} language={language} locale={locale} t={t} />)}
          </div>
        ) : (
          <div className="patient-appointments__empty">
            <h3>{t('appointments.noneUpcoming')}</h3>
            <p>{t('appointments.noneUpcomingCopy')}</p>
            <Link to="/doctors">{t('appointments.findDoctor')} <span aria-hidden="true">→</span></Link>
          </div>
        )}
      </section>
      <section aria-labelledby="appointment-history-heading">
        <SectionHeading count={count(appointments.history.length)} eyebrow={t('appointments.previous')} heading={t('appointments.history')} headingId="appointment-history-heading" unit={t(appointments.history.length === 1 ? 'appointments.record' : 'appointments.records')} />
        {appointments.history.length > 0 ? (
          <div className="patient-history-list">
            {appointments.history.map(appointment => <HistoryAppointment appointment={appointment} key={appointment.id} language={language} locale={locale} t={t} />)}
          </div>
        ) : (
          <div className="patient-appointments__empty patient-appointments__empty--quiet"><h3>{t('appointments.noneHistory')}</h3></div>
        )}
      </section>
    </div>
  )
}
