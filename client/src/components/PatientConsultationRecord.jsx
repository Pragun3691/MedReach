import { Link } from 'react-router-dom'
import { isoToIndiaDate } from '../lib/date.js'

function recordDate(value, includeTime = false) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))
}

export function PatientConsultationRecord({ consultation, doctor }) {
  const followUp = consultation.followUp
  const availabilityPath = followUp?.targetAt
    ? `/doctors/${doctor.id}?date=${isoToIndiaDate(followUp.targetAt)}`
    : `/doctors/${doctor.id}`

  return <section aria-labelledby="patient-record-heading" className="patient-consultation-record">
    <header className="patient-consultation-record__header">
      <p>Completed consultation</p>
      <h2 id="patient-record-heading">Consultation record</h2>
      <span>Your consultation with {doctor.fullName} was completed on {recordDate(consultation.finishedAt, true)}.</span>
    </header>

    <section className="patient-record-section">
      <p className="patient-record-section__eyebrow">Doctor’s notes</p>
      <h3>Doctor’s consultation notes</h3>
      {consultation.notes
        ? <p className="patient-record-notes">{consultation.notes}</p>
        : <p className="patient-record-empty">No consultation notes were added.</p>}
    </section>

    <section className="patient-record-section">
      <p className="patient-record-section__eyebrow">Prescription</p>
      <h3>Medicines</h3>
      {consultation.prescriptionItems.length === 0
        ? <p className="patient-record-empty">No medicines were prescribed during this consultation.</p>
        : <div className="patient-prescription-list">{consultation.prescriptionItems.map((item, index) => <article className="patient-prescription-item" key={item.id ?? index}><div><span>Medicine {index + 1}</span><h4>{item.medicineName}</h4></div><dl><div><dt>Dosage</dt><dd>{item.dosage}</dd></div><div><dt>Frequency</dt><dd>{item.frequency}</dd></div><div><dt>Duration</dt><dd>{item.duration}</dd></div>{item.instructions && <div><dt>Instructions</dt><dd>{item.instructions}</dd></div>}</dl></article>)}</div>}
    </section>

    <section className="patient-record-section patient-record-follow-up">
      <p className="patient-record-section__eyebrow">Follow-up</p>
      {followUp ? <><h3>Follow-up recommended</h3><p>Follow up in {followUp.interval} {followUp.unit}.</p>{followUp.targetAt && <p className="patient-record-follow-up__target">Recommended around <strong>{recordDate(followUp.targetAt)}</strong></p>}<Link to={availabilityPath}>View doctor availability <span aria-hidden="true">→</span></Link><small>You can choose any normally available appointment time.</small></> : <><h3>No follow-up recommended</h3><p className="patient-record-empty">No follow-up was recommended for this consultation.</p></>}
    </section>
  </section>
}
