import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthPageFrame } from '../components/AuthPageFrame.jsx'
import { FormField, inputClassName, PasswordField } from '../components/FormField.jsx'
import { listSpecializations, registerDoctorAccount, registerPatientAccount } from '../lib/api.js'
import { safeInternalReturnTo } from '../lib/navigation.js'

const initialPatient = { fullName: '', email: '', password: '', confirmPassword: '' }
const initialDoctor = {
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  qualification: '',
  experienceYears: '',
  specializationIds: [],
  bio: '',
  clinicName: '',
  clinicCity: '',
  clinicDistrict: '',
  defaultFee: '',
}

function validateBase(values) {
  const errors = {}
  if (values.fullName.trim().length < 2) errors.fullName = 'Enter your full name.'
  if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = 'Enter a valid email address.'
  if (values.password.length < 12) errors.password = 'Use at least 12 characters.'
  else if (values.password.length > 128) errors.password = 'Password must be 128 characters or fewer.'
  if (!values.confirmPassword) errors.confirmPassword = 'Confirm your password.'
  else if (values.confirmPassword !== values.password) errors.confirmPassword = 'Passwords do not match.'
  return errors
}

function validateDoctor(values) {
  const errors = validateBase(values)
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

function optional(value) {
  const normalized = value.trim()
  return normalized || undefined
}

function ErrorSummary({ errors }) {
  const entries = Object.entries(errors).filter(([, message]) => message)
  if (entries.length === 0) return null

  return (
    <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
      <p className="font-semibold">Please fix the following:</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {entries.map(([field, message]) => <li key={field}><a className="underline underline-offset-2" href={`#register-${field}`}>{message}</a></li>)}
      </ul>
    </div>
  )
}

export function RegisterPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const role = searchParams.get('role') === 'doctor' ? 'doctor' : 'patient'
  const returnTo = safeInternalReturnTo(searchParams.get('returnTo'))
  const [patient, setPatient] = useState(initialPatient)
  const [doctor, setDoctor] = useState(initialDoctor)
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [specializations, setSpecializations] = useState([])
  const [specializationError, setSpecializationError] = useState('')

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

  function switchRole(nextRole) {
    const next = new URLSearchParams(searchParams)
    if (nextRole === 'doctor') next.set('role', 'doctor')
    else next.delete('role')
    setSearchParams(next, { replace: true })
    setErrors({})
    setApiError('')
  }

  function update(field, value) {
    setValues(current => ({ ...current, [field]: value }))
    setErrors(current => ({ ...current, [field]: undefined }))
    setApiError('')
  }

  function toggleSpecialization(id) {
    const selected = doctor.specializationIds.includes(id)
    setDoctor(current => ({
      ...current,
      specializationIds: selected
        ? current.specializationIds.filter(value => value !== id)
        : [...current.specializationIds, id],
    }))
    setErrors(current => ({ ...current, specializationIds: undefined }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = role === 'doctor' ? validateDoctor(values) : validateBase(values)

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

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
        setErrors({ email: 'An account with this email already exists.' })
        setApiError('This email is already registered. Try logging in instead.')
      } else if (error.code === 'INVALID_SPECIALIZATION') {
        setErrors({ specializationIds: 'One of the selected specializations is no longer available.' })
        setApiError('Please review your specialization choices and try again.')
      } else if (error.code === 'VALIDATION_ERROR') {
        const fieldErrors = Object.fromEntries(
          error.details.map(detail => [detail.field.split('.')[0], detail.message]),
        )
        setErrors(fieldErrors)
        setApiError('Please review the highlighted fields.')
      } else {
        setApiError('We could not create your account right now. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const field = (name, label, options = {}) => (
    <FormField error={errors[name]} id={`register-${name}`} label={label} hint={options.hint}>
      <input
        aria-describedby={errors[name] ? `register-${name}-error` : undefined}
        aria-invalid={Boolean(errors[name])}
        autoComplete={options.autoComplete}
        className={inputClassName}
        disabled={submitting}
        id={`register-${name}`}
        max={options.max}
        min={options.min}
        onChange={event => update(name, event.target.value)}
        placeholder={options.placeholder}
        required={options.required !== false}
        type={options.type ?? 'text'}
        value={values[name]}
      />
    </FormField>
  )

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
    >
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_20px_55px_-42px_rgba(15,23,42,0.55)] sm:p-8" aria-labelledby="register-form-heading">
        <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="group" aria-label="Account type">
          {['patient', 'doctor'].map(item => (
            <button
              aria-pressed={role === item}
              className={`min-h-11 rounded-lg px-4 text-sm font-semibold capitalize focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${role === item ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              key={item}
              onClick={() => switchRole(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>

        <div className="mt-6">
          <p className="text-sm font-semibold text-blue-700">{role === 'doctor' ? 'Professional account' : 'Patient account'}</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950" id="register-form-heading">
            {role === 'doctor' ? 'Register as a doctor' : 'Register as a patient'}
          </h2>
        </div>

        {apiError && <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{apiError}</div>}
        <ErrorSummary errors={errors} />

        <form className="mt-6 space-y-5" noValidate onSubmit={handleSubmit}>
          <div className="grid gap-5 sm:grid-cols-2">
            {field('fullName', 'Full name', { autoComplete: 'name', placeholder: role === 'doctor' ? 'Dr. Priya Sharma' : 'Priya Sharma' })}
            {field('email', 'Email', { autoComplete: 'email', placeholder: 'you@example.com', type: 'email' })}
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <PasswordField
              autoComplete="new-password"
              disabled={submitting}
              error={errors.password}
              hint="Use 12 to 128 characters."
              id="register-password"
              label="Password"
              onChange={event => update('password', event.target.value)}
              onToggle={() => setPasswordVisible(value => !value)}
              value={values.password}
              visible={passwordVisible}
            />
            <PasswordField
              autoComplete="new-password"
              disabled={submitting}
              error={errors.confirmPassword}
              id="register-confirmPassword"
              label="Confirm password"
              onChange={event => update('confirmPassword', event.target.value)}
              onToggle={() => setConfirmPasswordVisible(value => !value)}
              value={values.confirmPassword}
              visible={confirmPasswordVisible}
            />
          </div>

          {role === 'doctor' && (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                {field('qualification', 'Qualification', { placeholder: 'MBBS, MD' })}
                {field('experienceYears', 'Experience in years', { min: 0, max: 80, placeholder: '8', type: 'number' })}
              </div>

              <fieldset>
                <legend className="text-sm font-semibold text-slate-800">Specializations</legend>
                <p className="mt-1 text-xs leading-5 text-slate-500">Choose every area that applies. At least one is required.</p>
                {specializationError && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">{specializationError}</p>}
                {!specializationError && specializations.length === 0 && <div className="mt-3 h-20 animate-pulse rounded-lg bg-slate-100" aria-label="Loading specializations" />}
                <div className="mt-3 grid gap-2 sm:grid-cols-2" id="register-specializationIds">
                  {specializations.map(item => (
                    <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm font-medium ${doctor.specializationIds.includes(item.id) ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-slate-200 text-slate-700 hover:border-blue-300'}`} key={item.id}>
                      <input
                        checked={doctor.specializationIds.includes(item.id)}
                        className="size-4 accent-blue-700"
                        disabled={submitting}
                        onChange={() => toggleSpecialization(item.id)}
                        type="checkbox"
                      />
                      {item.name}
                    </label>
                  ))}
                </div>
                {errors.specializationIds && <p className="mt-2 text-sm text-red-700" id="register-specializationIds-error">{errors.specializationIds}</p>}
              </fieldset>

              <FormField error={errors.bio} id="register-bio" label="Bio (optional)">
                <textarea
                  className={`${inputClassName} min-h-28 py-3`}
                  disabled={submitting}
                  id="register-bio"
                  maxLength={4000}
                  onChange={event => update('bio', event.target.value)}
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
            </>
          )}

          <button
            className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-wait disabled:bg-blue-400"
            disabled={submitting || (role === 'doctor' && specializations.length === 0)}
            type="submit"
          >
            {submitting ? 'Creating account…' : `Create ${role} account`}
          </button>
        </form>

        <p className="mt-6 border-t border-slate-200 pt-5 text-center text-sm text-slate-600">
          Already registered? <Link className="font-semibold text-blue-700 hover:text-blue-800" to={`/login${returnTo !== '/' ? `?${new URLSearchParams({ returnTo }).toString()}` : ''}`}>Sign in</Link>
        </p>
      </section>
    </AuthPageFrame>
  )
}
