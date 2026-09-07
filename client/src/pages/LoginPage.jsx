import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthPageFrame } from '../components/AuthPageFrame.jsx'
import { FormField, inputClassName, PasswordField } from '../components/FormField.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { safeInternalReturnTo } from '../lib/navigation.js'

function validate(values) {
  const errors = {}
  if (!values.email.trim()) errors.email = 'Enter your email address.'
  else if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = 'Enter a valid email address.'
  if (!values.password) errors.password = 'Enter your password.'
  else if (values.password.length > 128) errors.password = 'Password must be 128 characters or fewer.'
  return errors
}

export function LoginPage() {
  const { status, login } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const params = new URLSearchParams(location.search)
  const returnTo = safeInternalReturnTo(params.get('returnTo'))
  const registered = params.get('registered')
  const [values, setValues] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') navigate(returnTo, { replace: true })
  }, [navigate, returnTo, status])

  function update(field, value) {
    setValues(current => ({ ...current, [field]: value }))
    setErrors(current => ({ ...current, [field]: undefined }))
    setApiError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = validate(values)

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setSubmitting(true)
    setApiError('')

    try {
      await login({ email: values.email, password: values.password })
      navigate(returnTo, { replace: true })
    } catch (error) {
      if (error.code === 'INVALID_CREDENTIALS') {
        setApiError('The email or password is incorrect. Please check both and try again.')
      } else if (error.code === 'ACCOUNT_DISABLED') {
        setApiError('This account is disabled. Please contact MedReach support for help.')
      } else if (error.code === 'VALIDATION_ERROR') {
        setApiError('Please check the information you entered and try again.')
      } else {
        setApiError('We could not sign you in right now. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const registerParams = new URLSearchParams()
  if (returnTo !== '/') registerParams.set('returnTo', returnTo)
  const registerUrl = `/register${registerParams.size ? `?${registerParams.toString()}` : ''}`
  const bookingReturnUrl = new URL(returnTo, 'https://medreach.local')
  const hasBookingContext = /^\/doctors\/\d+$/.test(bookingReturnUrl.pathname)
    && bookingReturnUrl.searchParams.has('date')
    && bookingReturnUrl.searchParams.has('slot')

  return (
    <AuthPageFrame variant="editorial">
      <section className="auth-workspace" aria-labelledby="login-form-heading">
        <div className="auth-workspace__intro">
          <p>Welcome back</p>
          <h1 id="login-form-heading">Sign in to MedReach</h1>
          <span>Access your appointments and continue your care.</span>
        </div>

        {hasBookingContext && (
          <div className="auth-context" role="status">
            <p>Your appointment is waiting</p>
            <span>Your selected appointment will still be here after you sign in.</span>
          </div>
        )}

        {registered && (
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900" role="status">
            {registered === 'doctor'
              ? 'Your doctor account was created. You can sign in while your profile awaits verification.'
              : 'Your patient account was created. Sign in to continue.'}
          </div>
        )}

        {apiError && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800" role="alert">
            {apiError}
          </div>
        )}

        <form className="mt-6 space-y-5" noValidate onSubmit={handleSubmit}>
          <FormField error={errors.email} id="login-email" label="Email">
            <input
              aria-describedby={errors.email ? 'login-email-error' : undefined}
              aria-invalid={Boolean(errors.email)}
              autoComplete="email"
              className={inputClassName}
              disabled={submitting}
              id="login-email"
              onChange={event => update('email', event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={values.email}
            />
          </FormField>
          <PasswordField
            autoComplete="current-password"
            disabled={submitting}
            error={errors.password}
            id="login-password"
            label="Password"
            onChange={event => update('password', event.target.value)}
            onToggle={() => setPasswordVisible(value => !value)}
            value={values.password}
            visible={passwordVisible}
          />
          <button
            className="auth-submit"
            disabled={submitting}
            type="submit"
          >
            {submitting ? 'Signing in…' : 'Sign in →'}
          </button>
        </form>

        <p className="auth-switch">
          New to MedReach? <Link to={registerUrl}>Create an account →</Link>
        </p>
      </section>
    </AuthPageFrame>
  )
}
