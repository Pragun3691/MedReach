import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PublicHeader } from '../components/PublicHeader.jsx'
import { FormField, inputClassName } from '../components/FormField.jsx'
import { getMyVerification, submitMyVerification } from '../lib/api.js'
import { validateCredentials, verificationDate, verificationLabels } from '../lib/verification.js'

export function DoctorVerificationPage() {
  const [verification, setVerification] = useState(null)
  const [values, setValues] = useState({ registrationNumber: '', issuingAuthority: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    getMyVerification(controller.signal).then(({ verification: value }) => {
      if (controller.signal.aborted) return
      setVerification(value)
      setValues({ registrationNumber: value.registrationNumber ?? '', issuingAuthority: value.issuingAuthority ?? '' })
    }).catch(reason => {
      if (reason.name !== 'AbortError') setError('Your verification status could not be loaded. Please try again.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [reload])

  async function submit(event) {
    event.preventDefault()
    if (busy.current) return
    const nextErrors = validateCredentials(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      document.getElementById(`verification-${Object.keys(nextErrors)[0]}`)?.focus()
      return
    }
    busy.current = true
    setPending(true)
    setError('')
    try {
      const result = await submitMyVerification({
        registrationNumber: values.registrationNumber.trim(), issuingAuthority: values.issuingAuthority.trim(),
        version: verification.version,
      })
      setVerification(result.verification)
      setSuccess('Credentials submitted for manual review. Your profile remains private until approval.')
    } catch (reason) {
      setError(reason.code === 'VERIFICATION_CONFLICT'
        ? 'Your request has changed. Reload the status before trying again.'
        : reason.code === 'CREDENTIALS_IN_USE' ? reason.message : 'Credentials could not be submitted. Please try again.')
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  const editable = verification && ['missing_credentials', 'rejected'].includes(verification.status)
  function reloadStatus() {
    setLoading(true)
    setError('')
    setSuccess('')
    setReload(value => value + 1)
  }
  return (
    <div className="verification-workspace">
      <PublicHeader forceEnglish />
      <main className="verification-shell">
        <p className="verification-eyebrow">Professional account</p>
        <h1>Doctor verification</h1>
        <p className="verification-intro">Submit your medical registration details for a manual review by MedReach. Approval follows an Admin review; submitting text alone does not verify a license.</p>
        {loading && <p role="status">Loading your verification status…</p>}
        {error && <div className="verification-notice" role="alert"><p>{error}</p><button disabled={pending} onClick={reloadStatus} type="button">Reload status</button></div>}
        {success && <p className="verification-success" role="status">{success}</p>}
        {!loading && verification && (
          <section className="verification-panel" aria-labelledby="verification-status">
            <span className="verification-badge" data-status={verification.status}>{verificationLabels[verification.status]}</span>
            <h2 id="verification-status">{editable ? 'Registration details required' : verification.status === 'approved' ? 'Your profile is approved' : 'Your credentials are awaiting review'}</h2>
            {verification.status === 'missing_credentials' && <p>Your account has no submitted medical registration credentials. Add them below to join the review queue.</p>}
            {verification.status === 'rejected' && <div className="verification-notice"><strong>Reason for rejection</strong><p className="verification-text">{verification.rejectionReason}</p><p>Correct your credentials below and submit a new review request.</p></div>}
            {verification.status !== 'approved' && <p>Your profile is excluded from public discovery and availability management until approved.</p>}
            {verification.submittedAt && <p>Submitted: {verificationDate(verification.submittedAt)}</p>}
            {editable ? (
              <form className="registration-form verification-form" noValidate onSubmit={submit} aria-busy={pending}>
                {['registrationNumber', 'issuingAuthority'].map(name => (
                  <FormField key={name} id={`verification-${name}`} label={name === 'registrationNumber' ? 'Medical registration number' : 'Issuing authority'} error={errors[name]}>
                    <input className={inputClassName} id={`verification-${name}`} value={values[name]} required maxLength={name === 'registrationNumber' ? 100 : 160}
                      disabled={pending} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `verification-${name}-error` : undefined}
                      onChange={event => {
                        const next = { ...values, [name]: event.target.value }
                        setValues(next)
                        if (Object.hasOwn(errors, name)) setErrors(current => ({ ...current, [name]: validateCredentials(next)[name] }))
                      }} onBlur={() => setErrors(current => ({ ...current, [name]: validateCredentials(values)[name] }))} />
                  </FormField>
                ))}
                <button className="verification-primary" disabled={pending} type="submit">{pending ? 'Submitting…' : verification.status === 'rejected' ? 'Resubmit for review' : 'Submit for review'}</button>
              </form>
            ) : (
              <dl className="verification-details"><div><dt>Medical registration number</dt><dd>{verification.registrationNumber}</dd></div><div><dt>Issuing authority</dt><dd>{verification.issuingAuthority}</dd></div></dl>
            )}
            {verification.status === 'approved' && <Link className="verification-primary" to="/doctor/availability">Manage availability</Link>}
          </section>
        )}
      </main>
    </div>
  )
}
