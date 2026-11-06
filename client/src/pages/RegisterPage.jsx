import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthPageFrame } from '../components/AuthPageFrame.jsx'
import { FormField, inputClassName, PasswordField } from '../components/FormField.jsx'
import { listSpecializations, registerDoctorAccount, registerPatientAccount } from '../lib/api.js'
import { safeInternalReturnTo } from '../lib/navigation.js'
import { useLanguage } from '../hooks/useLanguage.js'
import { translateMessage } from '../i18n/messages.js'
import { validateCredentials } from '../lib/verification.js'

const initialPatient = { fullName: '', email: '', password: '', confirmPassword: '' }
const initialDoctor = {
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  qualification: '',
  registrationNumber: '',
  issuingAuthority: '',
  experienceYears: '',
  specializationIds: [],
  bio: '',
  clinicName: '',
  clinicCity: '',
  clinicDistrict: '',
  defaultFee: '',
}

const doctorStepOneFields = ['fullName', 'email', 'password', 'confirmPassword', 'qualification', 'experienceYears', 'registrationNumber', 'issuingAuthority']

function validateBase(values, t = (key, data) => translateMessage('en', key, data)) {
  const errors = {}
  if (values.fullName.trim().length < 2) errors.fullName = t('auth.enterName')
  if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = t('auth.validEmail')
  if (values.password.length < 12) errors.password = t('auth.shortPassword')
  else if (values.password.length > 128) errors.password = t('auth.longPassword')
  if (!values.confirmPassword) errors.confirmPassword = t('auth.confirmRequired')
  else if (values.confirmPassword !== values.password) errors.confirmPassword = t('auth.mismatch')
  return errors
}

function validateDoctor(values) {
  const errors = { ...validateBase(values), ...validateCredentials(values) }
  if (values.qualification.trim().length < 2) errors.qualification = 'Enter your professional qualification.'
  const experience = Number(values.experienceYears)
  if (values.experienceYears === '' || !Number.isInteger(experience) || experience < 0 || experience > 80) {
    errors.experienceYears = 'Enter experience from 0 to 80 years.'
  }
  if (values.specializationIds.length === 0) errors.specializationIds = 'Choose at least one specialization.'
  if (values.defaultFee !== '' && (Number(values.defaultFee) < 0 || Number(values.defaultFee) > 100000)) {
    errors.defaultFee = 'Enter a fee from ₹0 to ₹100,000.'
  }
  return errors
}

function validateDoctorStepOne(values) {
  const errors = validateDoctor(values)
  return Object.fromEntries(Object.entries(errors).filter(([field]) => doctorStepOneFields.includes(field)))
}

function optional(value) {
  const normalized = value.trim()
  return normalized || undefined
}

export function RegisterPage() {
  const languageState = useLanguage()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const role = searchParams.get('role') === 'doctor' ? 'doctor' : 'patient'
  const t = role === 'patient' ? languageState.t : (key, data) => translateMessage('en', key, data)
  const returnTo = safeInternalReturnTo(searchParams.get('returnTo'))
  const [patient, setPatient] = useState(initialPatient)
  const [doctor, setDoctor] = useState(initialDoctor)
  const [patientErrors, setPatientErrors] = useState({})
  const [doctorErrors, setDoctorErrors] = useState({})
  const [patientApiError, setPatientApiError] = useState('')
  const [doctorApiError, setDoctorApiError] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const submissionPending = useRef(false)
  const [specializations, setSpecializations] = useState([])
  const [specializationError, setSpecializationError] = useState('')
  const [doctorStep, setDoctorStep] = useState(1)

  useEffect(() => {
    const controller = new AbortController()
    listSpecializations(controller.signal)
      .then(data => setSpecializations(data.items))
      .catch(error => {
        if (error.name !== 'AbortError') setSpecializationError('Specializations could not be loaded. Please refresh and try again.')
      })
    return () => controller.abort()
  }, [])

  const values = role === 'doctor' ? doctor : patient
  const setValues = role === 'doctor' ? setDoctor : setPatient
  const errors = role === 'doctor' ? doctorErrors : patientErrors
  const setErrors = role === 'doctor' ? setDoctorErrors : setPatientErrors
  const apiError = role === 'doctor' ? doctorApiError : patientApiError
  const setApiError = role === 'doctor' ? setDoctorApiError : setPatientApiError

  function validate(nextValues) {
    return role === 'doctor' ? validateDoctor(nextValues) : validateBase(nextValues, t)
  }

  function blur(field) {
    const nextErrors = validate(values)
    // A key also records that a valid field has been visited. Preserve API
    // feedback on repeated blur until the user actually edits that field.
    setErrors(current => Object.hasOwn(current, field) ? current : { ...current, [field]: nextErrors[field] })
  }

  function update(field, value) {
    const nextErrors = validate({ ...values, [field]: value })
    setValues(current => ({ ...current, [field]: value }))
    setErrors(current => ({
      ...current,
      ...(Object.hasOwn(current, field) ? { [field]: nextErrors[field] } : {}),
      ...(field === 'password' && Object.hasOwn(current, 'confirmPassword')
        ? { confirmPassword: nextErrors.confirmPassword } : {}),
    }))
    setApiError('')
  }

  function toggleSpecialization(id) {
    const selected = doctor.specializationIds.includes(id)
    update('specializationIds', selected
      ? doctor.specializationIds.filter(value => value !== id)
      : [...doctor.specializationIds, id])
  }

  function focusFirstInvalid(nextErrors) {
    requestAnimationFrame(() => {
      // Use the rendered order, including when an API error returns Step 1.
      const target = [...document.querySelectorAll('[id^="register-"]')]
        .find(element => nextErrors[element.id.slice('register-'.length)])
      const control = target?.id === 'register-specializationIds'
        ? target.querySelector('input') ?? target
        : target
      control?.focus()
    })
  }

  function continueDoctorRegistration() {
    const nextErrors = validateDoctorStepOne(doctor)
    setErrors(current => ({
      ...current,
      ...Object.fromEntries(doctorStepOneFields.map(field => [field, nextErrors[field]])),
    }))

    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalid(nextErrors)
      return
    }

    setApiError('')
    setDoctorStep(2)
    requestAnimationFrame(() => document.getElementById('register-form-heading')?.focus())
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submissionPending.current) return
    if (role === 'doctor' && doctorStep === 1) {
      continueDoctorRegistration()
      return
    }
    const nextErrors = validate(values)
    setErrors(Object.fromEntries(Object.keys(values).map(field => [field, nextErrors[field]])))

    if (Object.keys(nextErrors).length > 0) {
      if (role === 'doctor' && doctorStepOneFields.some(field => nextErrors[field])) setDoctorStep(1)
      focusFirstInvalid(nextErrors)
      return
    }

    submissionPending.current = true
    setSubmitting(true)
    setApiError('')

    try {
      if (role === 'patient') {
        await registerPatientAccount({
          fullName: patient.fullName,
          email: patient.email,
          password: patient.password,
        })
      } else {
        await registerDoctorAccount({
          fullName: doctor.fullName,
          email: doctor.email,
          password: doctor.password,
          qualification: doctor.qualification,
          registrationNumber: doctor.registrationNumber.trim(),
          issuingAuthority: doctor.issuingAuthority.trim(),
          experienceYears: Number(doctor.experienceYears),
          specializationIds: doctor.specializationIds,
          bio: optional(doctor.bio),
          clinicName: optional(doctor.clinicName),
          clinicCity: optional(doctor.clinicCity),
          clinicDistrict: optional(doctor.clinicDistrict),
          defaultFee: doctor.defaultFee === '' ? undefined : Number(doctor.defaultFee),
        })
      }

      const loginParams = new URLSearchParams({ registered: role })
      if (returnTo !== '/') loginParams.set('returnTo', returnTo)
      navigate(`/login?${loginParams.toString()}`, { replace: true })
    } catch (error) {
      if (error.code === 'EMAIL_IN_USE') {
        setErrors({ email: role === 'patient' ? t('auth.emailUsed') : 'An account with this email already exists.' })
        setApiError(role === 'patient' ? t('auth.emailUsedCopy') : 'This email is already registered. Try logging in instead.')
        if (role === 'doctor') setDoctorStep(1)
        focusFirstInvalid({ email: true })
      } else if (error.code === 'CREDENTIALS_IN_USE') {
        setApiError('These registration credentials cannot be submitted. Please check them or contact support.')
        setDoctorStep(1)
        focusFirstInvalid({ registrationNumber: true })
      } else if (error.code === 'INVALID_SPECIALIZATION') {
        setErrors({ specializationIds: 'One of the selected specializations is no longer available.' })
        setApiError('Please review your specialization choices and try again.')
        focusFirstInvalid({ specializationIds: true })
      } else if (error.code === 'VALIDATION_ERROR') {
        const fieldErrors = Object.fromEntries(
          error.details.map(detail => [detail.field.split('.')[0], detail.message]),
        )
        setErrors(fieldErrors)
        setApiError(role === 'patient' ? t('auth.validationReview') : 'Please review the highlighted fields.')
        if (role === 'doctor' && doctorStepOneFields.some(field => fieldErrors[field])) setDoctorStep(1)
        focusFirstInvalid(fieldErrors)
      } else {
        setApiError(role === 'patient' ? t('auth.registerError') : 'We could not create your account right now. Please try again.')
      }
    } finally {
      submissionPending.current = false
      setSubmitting(false)
    }
  }

  const field = (name, label, options = {}) => (
    <FormField error={errors[name]} id={`register-${name}`} label={label} hint={options.hint}>
      <input
        aria-describedby={errors[name] ? `register-${name}-error` : options.hint ? `register-${name}-hint` : undefined}
        aria-invalid={Boolean(errors[name])}
        autoComplete={options.autoComplete}
        className={inputClassName}
        disabled={submitting}
        id={`register-${name}`}
        max={options.max}
        maxLength={options.maxLength}
        min={options.min}
        onChange={event => update(name, event.target.value)}
        onBlur={() => blur(name)}
        placeholder={options.placeholder}
        required={options.required !== false}
        type={options.type ?? 'text'}
        value={values[name]}
      />
    </FormField>
  )

  const loginUrl = `/login${returnTo !== '/' ? `?${new URLSearchParams({ returnTo }).toString()}` : ''}`
  const doctorParams = new URLSearchParams({ role: 'doctor' })
  if (returnTo !== '/') doctorParams.set('returnTo', returnTo)
  const doctorRegisterUrl = `/register?${doctorParams.toString()}`

  return (
    <AuthPageFrame
      aside={(
        <div className="mt-8 space-y-4 border-t border-slate-200 pt-6 text-sm leading-6 text-slate-600">
          <p><strong className="font-semibold text-slate-900">Patients:</strong> create an account to continue from a selected consultation slot.</p>
          <p><strong className="font-semibold text-slate-900">Doctors:</strong> registration creates a private profile. It will not appear publicly until MedReach verification is complete.</p>
        </div>
      )}
      description="Choose the account type that matches how you will use MedReach. There is no public administrator registration."
      eyebrow="Join MedReach"
      title="Create your account"
      variant={role === 'patient' ? 'editorial' : 'professional'}
    >
      <section className={role === 'patient' ? 'auth-workspace' : 'doctor-onboarding'} aria-labelledby="register-form-heading">

        <div className={role === 'patient' ? 'auth-workspace__intro' : 'mt-6'}>
          <p className={role === 'doctor' ? 'doctor-form-eyebrow' : undefined}>{role === 'doctor' ? 'Professional onboarding' : t('auth.join')}</p>
          {role === 'patient' ? (
            <>
              <h1 id="register-form-heading">{t('auth.registerTitle')}</h1>
              <span>{t('auth.registerCopy')}</span>
            </>
          ) : (
            <>
              <h2 className="doctor-form-title" id="register-form-heading" tabIndex="-1">
                {doctorStep === 1 ? 'Account & credentials' : 'Professional profile'}
              </h2>
              <p className="doctor-form-support">Complete your secure application for MedReach review.</p>
            </>
          )}
        </div>

        {role === 'doctor' && (
          <nav className="doctor-stepper" aria-label="Doctor registration progress">
            <div aria-current={doctorStep === 1 ? 'step' : undefined} data-state={doctorStep === 1 ? 'current' : 'complete'}>
              <span>01</span>
              <strong>Account &amp; credentials</strong>
            </div>
            <i aria-hidden="true" />
            <div aria-current={doctorStep === 2 ? 'step' : undefined} data-state={doctorStep === 2 ? 'current' : 'upcoming'}>
              <span>02</span>
              <strong>Professional profile</strong>
            </div>
          </nav>
        )}

        {apiError && <div className="registration-feedback" role="alert">{apiError}</div>}

        <form className="registration-form mt-6 space-y-5" aria-busy={submitting} noValidate onSubmit={handleSubmit}>
          {(role === 'patient' || doctorStep === 1) && (
            <div className={role === 'doctor' ? 'doctor-step-panel' : 'grid gap-5'} key="account-step">
              <div className={role === 'patient' ? 'grid gap-5' : 'grid gap-5 sm:grid-cols-2'}>
                {field('fullName', role === 'patient' ? t('auth.fullName') : 'Full name', { autoComplete: 'name', placeholder: role === 'doctor' ? 'Dr. Priya Sharma' : 'Priya Sharma' })}
                {field('email', role === 'patient' ? t('auth.email') : 'Email', { autoComplete: 'email', placeholder: 'you@example.com', type: 'email' })}
              </div>
              <div className={role === 'patient' ? 'grid gap-5' : 'grid gap-5 sm:grid-cols-2'}>
                <PasswordField
                  autoComplete="new-password"
                  disabled={submitting}
                  error={errors.password}
                  hint={role === 'patient' ? t('auth.passwordHint') : 'Use 12 to 128 characters.'}
                  id="register-password"
                  label={role === 'patient' ? t('auth.password') : 'Password'}
                  onChange={event => update('password', event.target.value)}
                  onBlur={() => blur('password')}
                  onToggle={() => setPasswordVisible(value => !value)}
                  value={values.password}
                  visible={passwordVisible}
                  toggleLabels={role === 'patient' ? { show: t('auth.show'), hide: t('auth.hide') } : undefined}
                />
                <PasswordField
                  autoComplete="new-password"
                  disabled={submitting}
                  error={errors.confirmPassword}
                  id="register-confirmPassword"
                  label={role === 'patient' ? t('auth.confirmPassword') : 'Confirm password'}
                  onChange={event => update('confirmPassword', event.target.value)}
                  onBlur={() => blur('confirmPassword')}
                  onToggle={() => setConfirmPasswordVisible(value => !value)}
                  value={values.confirmPassword}
                  visible={confirmPasswordVisible}
                  toggleLabels={role === 'patient' ? { show: t('auth.show'), hide: t('auth.hide') } : undefined}
                />
              </div>
              {role === 'doctor' && (
                <div className="grid gap-5 sm:grid-cols-2">
                  {field('registrationNumber', 'Medical registration number', { maxLength: 100, hint: 'Use the number issued by your medical council.' })}
                  {field('issuingAuthority', 'Issuing authority', { maxLength: 160, hint: 'Name the council or authority that issued your registration.' })}
                </div>
              )}
              {role === 'doctor' && (
                <div className="grid gap-5 sm:grid-cols-2">
                  {field('qualification', 'Qualification', { placeholder: 'MBBS, MD' })}
                  {field('experienceYears', 'Experience in years', { min: 0, max: 80, placeholder: '8', type: 'number' })}
                </div>
              )}
            </div>
          )}

          {role === 'doctor' && doctorStep === 2 && (
            <div className="doctor-step-panel" key="profile-step">
              <FormField error={errors.bio} id="register-bio" label="Bio (optional)">
                <textarea
                  aria-describedby={errors.bio ? 'register-bio-error' : undefined}
                  aria-invalid={Boolean(errors.bio)}
                  className={`${inputClassName} min-h-28 py-3`}
                  disabled={submitting}
                  id="register-bio"
                  maxLength={4000}
                  onChange={event => update('bio', event.target.value)}
                  onBlur={() => blur('bio')}
                  placeholder="Briefly describe your practice and approach to care."
                  value={doctor.bio}
                />
              </FormField>

              <div className="grid gap-5 sm:grid-cols-2">
                {field('clinicName', 'Clinic name (optional)', { required: false })}
                {field('defaultFee', 'Consultation fee (optional)', { min: 0, max: 100000, placeholder: '700', required: false, type: 'number' })}
                {field('clinicCity', 'City (optional)', { required: false })}
                {field('clinicDistrict', 'District (optional)', { required: false })}
              </div>

              <div className="doctor-profile-divider">
                <p>Specializations</p>
                <small>Select every area that applies</small>
              </div>
              <fieldset
                className="doctor-specializations"
                aria-describedby={errors.specializationIds ? 'register-specializationIds-hint register-specializationIds-error' : 'register-specializationIds-hint'}
                aria-invalid={Boolean(errors.specializationIds)}
                onBlur={event => {
                  if (!event.currentTarget.contains(event.relatedTarget)) blur('specializationIds')
                }}
              >
                <legend className="sr-only">Specializations</legend>
                <p id="register-specializationIds-hint">Choose at least one specialization. Multiple selections are supported.</p>
                {specializationError && <p className="doctor-specializations__error" role="alert">{specializationError}</p>}
                {!specializationError && specializations.length === 0 && <div className="h-20 animate-pulse rounded-md bg-[#EEE9DF]" aria-label="Loading specializations" />}
                <div className="doctor-specialization-grid" id="register-specializationIds" tabIndex="-1">
                  {specializations.map(item => {
                    const selected = doctor.specializationIds.includes(item.id)
                    return (
                      <label className="doctor-specialization" data-selected={selected} key={item.id}>
                        <input
                          aria-describedby={errors.specializationIds ? 'register-specializationIds-error' : 'register-specializationIds-hint'}
                          aria-invalid={Boolean(errors.specializationIds)}
                          checked={selected}
                          disabled={submitting}
                          onChange={() => toggleSpecialization(item.id)}
                          type="checkbox"
                        />
                        <span aria-hidden="true">{selected ? '✓' : '+'}</span>
                        {item.name}
                      </label>
                    )
                  })}
                </div>
                <div aria-live="polite" aria-atomic="true">
                  {errors.specializationIds && <p className="form-field-error" id="register-specializationIds-error"><span aria-hidden="true">!</span>{errors.specializationIds}</p>}
                </div>
              </fieldset>

              <div className="doctor-verification-note">
                <p>MedReach review</p>
                <span>Your doctor account will be created with a Pending profile. You can sign in while MedReach reviews your submitted professional details.</span>
              </div>
            </div>
          )}

          {role === 'doctor' && doctorStep === 2 ? (
            <div className="doctor-form-actions">
              <button className="doctor-back" disabled={submitting} onClick={() => {
                setDoctorStep(1)
                requestAnimationFrame(() => document.getElementById('register-form-heading')?.focus())
              }} type="button">← Back</button>
              <button className="doctor-submit" disabled={submitting} type="submit">
                {submitting ? 'Creating account…' : 'Submit for review →'}
              </button>
            </div>
          ) : (
            <button className={role === 'patient' ? 'auth-submit' : 'doctor-submit'} disabled={submitting} type="submit">
              {submitting ? (role === 'patient' ? t('auth.creating') : 'Creating account…') : role === 'patient' ? t('auth.create') : 'Continue →'}
            </button>
          )}
        </form>

        <p className={role === 'patient' ? 'auth-switch' : 'doctor-login-route'}>
          {role === 'patient' ? `${t('auth.already')} ` : 'Already submitted? '}
          <Link to={loginUrl}>{role === 'patient' ? t('auth.signIn') : 'Sign in →'}</Link>
        </p>
        {role === 'patient' && (
          <p className="auth-doctor-route">{t('auth.areDoctor')} <Link to={doctorRegisterUrl}>{t('auth.joinLink')}</Link></p>
        )}
        {role === 'doctor' && (
          <p className="doctor-patient-route">Looking for a patient account? <Link to="/register">Create a patient account →</Link></p>
        )}
      </section>
    </AuthPageFrame>
  )
}
