import { useEffect, useRef, useState } from 'react'
import { PublicHeader } from '../components/PublicHeader.jsx'
import { getDoctorVerification, listDoctorVerifications, reviewDoctorVerification } from '../lib/api.js'
import { verificationDate, verificationLabels } from '../lib/verification.js'

function ReviewDetails({ id, onReviewed }) {
  const [verification, setVerification] = useState(null)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [action, setAction] = useState(null)
  const [pending, setPending] = useState(false)
  const [reload, setReload] = useState(0)
  const busy = useRef(false)
  const confirmation = useRef(null)
  const reviewHeading = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    getDoctorVerification(id, controller.signal).then(result => {
      if (!controller.signal.aborted) setVerification(result.verification)
    }).catch(cause => { if (cause.name !== 'AbortError') setError('Review details could not be loaded. Please retry.') })
    return () => controller.abort()
  }, [id, reload])

  useEffect(() => { if (action) confirmation.current?.focus() }, [action])
  useEffect(() => { if (verification) reviewHeading.current?.focus() }, [verification])

  async function confirm(event) {
    event.preventDefault()
    if (busy.current) return
    if (action === 'reject' && !reason.trim()) {
      setError('Enter a rejection reason before confirming.')
      document.getElementById('rejection-reason')?.focus()
      return
    }
    busy.current = true
    setPending(true)
    setError('')
    try {
      await reviewDoctorVerification(verification.id, action, {
        version: verification.version, ...(action === 'reject' ? { reason: reason.trim() } : {}),
      })
      onReviewed(`Request ${action === 'approve' ? 'approved' : 'rejected'} for ${verification.fullName}.`)
    } catch (cause) {
      setError(cause.status === 409 ? 'This request changed or is no longer eligible. Reload its latest details before reviewing.' : 'The review could not be saved. Please try again.')
      setAction(null)
      if (cause.status === 409) setVerification(null)
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  const eligible = verification?.status === 'pending' && verification.isEnabled
    && verification.registrationNumber?.trim().length >= 2 && verification.issuingAuthority?.trim().length >= 2
    && verification.submittedAt
  function reloadDetails() {
    setVerification(null)
    setError('')
    setAction(null)
    setReason('')
    setReload(value => value + 1)
  }
  return (
    <section className="verification-panel verification-review" aria-labelledby="review-heading" aria-busy={pending}>
      <h2 id="review-heading" ref={reviewHeading} tabIndex="-1">Review details</h2>
      {error && <div className="verification-notice" role="alert"><p>{error}</p><button disabled={pending} type="button" onClick={reloadDetails}>Reload details</button></div>}
      {!verification && !error && <p role="status">Loading review details…</p>}
      {verification && <>
        <span className="verification-badge" data-status={verification.status}>{verificationLabels[verification.status]}</span>
        <h3>{verification.fullName}</h3>
        <dl className="verification-details">
          {[
            ['Specializations', verification.specializations.map(item => item.name).join(', ')],
            ['Qualification', verification.qualification], ['Experience', `${verification.experienceYears} years`],
            ['Medical registration number', verification.registrationNumber], ['Issuing authority', verification.issuingAuthority],
            ['Submitted', verificationDate(verification.submittedAt)], ['Bio', verification.bio],
            ['Clinic', [verification.clinicName, verification.clinicCity, verification.clinicDistrict].filter(Boolean).join(', ')],
            ['Reviewed', verification.reviewedAt ? verificationDate(verification.reviewedAt) : 'Not reviewed'],
            ['Reviewer ID', verification.reviewedByUserId], ['Rejection reason', verification.rejectionReason],
          ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="verification-text">{value || 'Not provided'}</dd></div>)}
        </dl>
        <p className="verification-disclosure">Check the submitted credentials through your trusted manual review process before approving. This page contains self-reported text and no license evidence uploads.</p>
        {!eligible && <p>{verification.status === 'missing_credentials' ? 'This Doctor must submit the missing credentials before review.' : verification.status === 'pending' ? 'This request cannot be reviewed while credentials are incomplete or the account is disabled.' : 'This review is complete. Further review requires a new submission.'}</p>}
        {eligible && !action && <div className="verification-actions"><button className="verification-primary" type="button" onClick={() => { setError(''); setAction('approve') }}>Approve</button><button className="verification-danger" type="button" onClick={() => { setError(''); setAction('reject') }}>Reject</button></div>}
        {action && <form className="verification-confirmation" onSubmit={confirm}>
          <h3 ref={confirmation} tabIndex="-1">{action === 'approve' ? 'Confirm manual approval' : 'Confirm rejection'}</h3>
          <p>{action === 'approve' ? 'Confirm that you have manually reviewed this Doctor’s credentials. Approval makes this profile eligible for public discovery and availability management.' : 'Explain what the Doctor needs to correct. This reason will be visible to the Doctor.'}</p>
          {action === 'reject' && <><label htmlFor="rejection-reason">Rejection reason (required)</label><textarea id="rejection-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={2000} required disabled={pending} /></>}
          <div className="verification-actions"><button className={action === 'approve' ? 'verification-primary' : 'verification-danger'} type="submit" disabled={pending || (action === 'reject' && !reason.trim())}>{pending ? 'Saving…' : action === 'approve' ? 'Confirm approval' : 'Confirm rejection'}</button><button disabled={pending} type="button" onClick={() => { setAction(null); setError('') }}>Cancel</button></div>
        </form>}
      </>}
    </section>
  )
}

export function AdminDoctorVerificationsPage() {
  const [status, setStatus] = useState('pending')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    listDoctorVerifications({ status, offset, signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setData(result)
    }).catch(cause => { if (cause.name !== 'AbortError') setError('Verification requests could not be loaded. Please try again.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [status, offset, reload])

  function beginQueueLoad() {
    setLoading(true)
    setError('')
    setData(null)
  }

  return (
    <div className="verification-workspace">
      <PublicHeader forceEnglish />
      <main className="verification-shell verification-shell-wide">
        <p className="verification-eyebrow">Administration · Manual review</p>
        <h1>Doctor verification requests</h1>
        <p className="verification-intro">Review professional registration credentials and record a clear decision.</p>
        <div className="verification-filters" role="group" aria-label="Verification status">
          {['pending', 'approved', 'rejected', 'missing_credentials'].map(value => <button key={value} disabled={loading} aria-pressed={status === value} onClick={() => { beginQueueLoad(); setStatus(value); setOffset(0); setSelected(null); setSuccess(''); setReload(current => current + 1) }} type="button">{verificationLabels[value]}</button>)}
        </div>
        {success && <p className="verification-success" role="status">{success}</p>}
        {loading && <p role="status">Loading verification requests…</p>}
        {error && <div className="verification-notice" role="alert"><p>{error}</p><button onClick={() => { beginQueueLoad(); setReload(value => value + 1) }} type="button">Try again</button></div>}
        {data?.items.length === 0 && <p className="verification-panel">No {verificationLabels[status].toLowerCase()} requests on this page.</p>}
        {data && <div className="verification-layout"><section aria-label="Doctor requests" className="verification-list">
          {data.items.map(item => <article className="verification-panel" key={item.id}>
            <span className="verification-badge" data-status={item.status}>{verificationLabels[item.status]}</span>
            <h2>{item.fullName}</h2><p>{item.qualification} · {item.specializations.map(value => value.name).join(', ') || 'No specializations'}</p>
            <dl className="verification-details"><div><dt>Medical registration number</dt><dd>{item.registrationNumber || 'Missing'}</dd></div><div><dt>Issuing authority</dt><dd>{item.issuingAuthority || 'Missing'}</dd></div><div><dt>Submitted</dt><dd>{verificationDate(item.submittedAt)}</dd></div></dl>
            {!item.isEnabled && <p className="verification-notice">Account disabled</p>}
            <button type="button" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>Review {item.fullName}</button>
          </article>)}
          <nav className="verification-actions" aria-label="Verification pages"><button disabled={offset === 0} onClick={() => { beginQueueLoad(); setOffset(value => value - 20); setSelected(null) }} type="button">Previous</button><button disabled={!data.hasMore} onClick={() => { beginQueueLoad(); setOffset(value => value + 20); setSelected(null) }} type="button">Next</button></nav>
        </section>{selected && <ReviewDetails key={selected} id={selected} onReviewed={message => { beginQueueLoad(); setSuccess(message); setSelected(null); setReload(value => value + 1) }} />}</div>}
      </main>
    </div>
  )
}
