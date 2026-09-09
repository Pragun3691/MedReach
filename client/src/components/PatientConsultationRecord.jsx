import { Link } from 'react-router-dom'
import { isoToIndiaDate } from '../lib/date.js'
import { useLanguage } from '../hooks/useLanguage.js'

function recordDate(value, locale, includeTime = false) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))
}

export function PatientConsultationRecord({ consultation, doctor }) {
  const { locale, t } = useLanguage()
  const followUp = consultation.followUp
  const availabilityPath = followUp?.targetAt
    ? `/doctors/${doctor.id}?date=${isoToIndiaDate(followUp.targetAt)}`
    : `/doctors/${doctor.id}`

  return <section aria-labelledby="patient-record-heading" className="patient-consultation-record">
    <header className="patient-consultation-record__header">
      <p>{t('record.completed')}</p>
      <h2 id="patient-record-heading">{t('record.title')}</h2>
      <span>{t('record.completedOn', { name: doctor.fullName, date: recordDate(consultation.finishedAt, locale, true) })}</span>
    </header>

    <section className="patient-record-section">
      <p className="patient-record-section__eyebrow">{t('record.notesEyebrow')}</p>
      <h3>{t('record.notesTitle')}</h3>
      {consultation.notes
        ? <p className="patient-record-notes">{consultation.notes}</p>
        : <p className="patient-record-empty">{t('record.noNotes')}</p>}
    </section>

    <section className="patient-record-section">
      <p className="patient-record-section__eyebrow">{t('record.prescription')}</p>
      <h3>{t('record.medicines')}</h3>
      {consultation.prescriptionItems.length === 0
        ? <p className="patient-record-empty">{t('record.noMedicines')}</p>
        : <div className="patient-prescription-list">{consultation.prescriptionItems.map((item, index) => <article className="patient-prescription-item" key={item.id ?? index}><div><span>{t('record.medicine', { number: new Intl.NumberFormat(locale).format(index + 1) })}</span><h4>{item.medicineName}</h4></div><dl><div><dt>{t('record.dosage')}</dt><dd>{item.dosage}</dd></div><div><dt>{t('record.frequency')}</dt><dd>{item.frequency}</dd></div><div><dt>{t('record.duration')}</dt><dd>{item.duration}</dd></div>{item.instructions && <div><dt>{t('record.instructions')}</dt><dd>{item.instructions}</dd></div>}</dl></article>)}</div>}
    </section>

    <section className="patient-record-section patient-record-follow-up">
      <p className="patient-record-section__eyebrow">{t('record.followUp')}</p>
      {followUp ? <><h3>{t('record.recommended')}</h3><p>{t('record.followIn', { interval: new Intl.NumberFormat(locale).format(followUp.interval), unit: t(`record.unit${followUp.unit[0].toUpperCase()}${followUp.unit.slice(1)}`) })}</p>{followUp.targetAt && <p className="patient-record-follow-up__target">{t('record.around')} <strong>{recordDate(followUp.targetAt, locale)}</strong></p>}<Link to={availabilityPath}>{t('record.viewAvailability')} <span aria-hidden="true">→</span></Link><small>{t('record.chooseAny')}</small></> : <><h3>{t('record.noFollowUp')}</h3><p className="patient-record-empty">{t('record.noFollowUpCopy')}</p></>}
    </section>
  </section>
}
