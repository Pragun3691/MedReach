import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthPageFrame } from '../components/AuthPageFrame.jsx'
import { FormField, inputClassName, PasswordField } from '../components/FormField.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { safeInternalReturnTo } from '../lib/navigation.js'
import { useLanguage } from '../hooks/useLanguage.js'

function validate(values, t) {
  const errors = {}
  if (!values.email.trim()) errors.email = t('auth.enterEmail')
  else if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = t('auth.validEmail')
  if (!values.password) errors.password = t('auth.enterPassword')
  else if (values.password.length > 128) errors.password = t('auth.longPassword')
  return errors
}

export function LoginPage() {
  const { t } = useLanguage()
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
    const nextErrors = validate(values, t)

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
        setApiError(t('auth.invalidCredentials'))
      } else if (error.code === 'ACCOUNT_DISABLED') {
        setApiError(t('auth.disabled'))
      } else if (error.code === 'VALIDATION_ERROR') {
        setApiError(t('auth.review'))
      } else {
        setApiError(t('auth.signInError'))
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
          <p>{t('auth.welcome')}</p>
          <h1 id="login-form-heading">{t('auth.signInTitle')}</h1>
          <span>{t('auth.signInCopy')}</span>
        </div>

        {hasBookingContext && (
          <div className="auth-context" role="status">
            <p>{t('auth.waiting')}</p>
            <span>{t('auth.waitingCopy')}</span>
          </div>
        )}

        {registered && (
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900" role="status">
            {registered === 'doctor'
              ? 'Your doctor account was created. You can sign in while your profile awaits verification.'
              : t('auth.patientCreated')}
          </div>
        )}

        {apiError && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800" role="alert">
            {apiError}
          </div>
        )}

        <form className="mt-6 space-y-5" noValidate onSubmit={handleSubmit}>
          <FormField error={errors.email} id="login-email" label={t('auth.email')}>
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
            label={t('auth.password')}
            onChange={event => update('password', event.target.value)}
            onToggle={() => setPasswordVisible(value => !value)}
            value={values.password}
            visible={passwordVisible}
            toggleLabels={{ show: t('auth.show'), hide: t('auth.hide') }}
          />
          <button
            className="auth-submit"
            disabled={submitting}
            type="submit"
          >
            {submitting ? t('auth.signingIn') : t('auth.signIn')}
          </button>
        </form>

        <p className="auth-switch">
          {t('auth.newUser')} <Link to={registerUrl}>{t('auth.createAccount')}</Link>
        </p>
      </section>
    </AuthPageFrame>
  )
}
