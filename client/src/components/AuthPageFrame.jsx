import { PublicFooter } from './PublicFooter.jsx'
import { PublicHeader } from './PublicHeader.jsx'
import careContinuityImage from '../assets/care-continuity.jpg'
import doctorInsightsImage from '../assets/doctor-insights.jpg'

export function AuthPageFrame({ eyebrow, title, description, children, aside, variant }) {
  if (variant === 'editorial') {
    return (
      <div className="auth-page min-h-screen">
        <PublicHeader />
        <main className="auth-shell">
          <section className="auth-visual" aria-labelledby="auth-visual-heading">
            <img alt="" src={careContinuityImage} />
            <div className="auth-visual__overlay" />
            <div className="auth-visual__copy">
              <p>Continuous care, secure access</p>
              <h2 id="auth-visual-heading">Care that continues.</h2>
              <span>Access your appointments and continue your care securely.</span>
            </div>
          </section>
          <div className="auth-form-stage">{children}</div>
        </main>
        <PublicFooter />
      </div>
    )
  }

  if (variant === 'professional') {
    return (
      <div className="doctor-register-page min-h-screen">
        <PublicHeader />
        <main className="doctor-register-shell">
          <aside className="doctor-register-context" aria-labelledby="doctor-register-context-heading">
            <div className="doctor-register-context__image">
              <img alt="" src={doctorInsightsImage} />
            </div>
            <div className="doctor-register-context__copy">
              <p>Join MedReach as a doctor</p>
              <h1 id="doctor-register-context-heading">Build your professional profile.</h1>
              <span>Submit your professional details for review before your profile can appear publicly.</span>
              <div className="doctor-register-review">
                <strong>What happens next</strong>
                <ul>
                  <li>Your profile begins as Pending.</li>
                  <li>You can sign in while MedReach reviews your details.</li>
                  <li>Public and restricted features unlock after approval.</li>
                </ul>
              </div>
            </div>
          </aside>
          <div className="doctor-register-stage">{children}</div>
        </main>
        <PublicFooter />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <PublicHeader />
      <main className="mx-auto grid max-w-6xl items-start gap-8 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)] lg:px-10 lg:py-18">
        <section className="max-w-xl lg:sticky lg:top-8">
          <p className="text-sm font-semibold text-blue-700">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-slate-950 sm:text-4xl">{title}</h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-slate-600">{description}</p>
          {aside}
        </section>
        {children}
      </main>
      <PublicFooter />
    </div>
  )
}
