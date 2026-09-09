import { Link } from 'react-router-dom'
import { Brand } from './Brand.jsx'
import { useLanguage } from '../hooks/useLanguage.js'
import { useAuth } from '../hooks/useAuth.js'
import { translateMessage } from '../i18n/messages.js'

export function PublicFooter({ forceEnglish = false }) {
  const languageState = useLanguage()
  const { currentUser, status } = useAuth()
  const patientFacing = !forceEnglish && (status !== 'authenticated' || currentUser?.role === 'patient')
  const t = patientFacing ? languageState.t : (key, values) => translateMessage('en', key, values)
  const footerGroups = [
    { heading: t('footer.patients'), links: [{ label: t('navigation.findDoctors'), to: '/doctors' }, { label: t('footer.howItWorks'), to: '/#how-it-works' }, { label: t('navigation.login'), to: '/login' }] },
    { heading: t('footer.forDoctors'), links: [{ label: t('auth.join'), to: '/register?role=doctor' }, { label: t('footer.doctorLogin'), to: '/login?role=doctor' }, { label: t('footer.verification'), to: '/doctor-verification' }] },
    { heading: 'MedReach', links: [{ label: t('footer.about'), to: '/about' }, { label: t('footer.privacy'), to: '/privacy' }, { label: t('footer.terms'), to: '/terms' }] },
  ]
  return (
    <footer className="border-t border-white/10 bg-[#07182C] text-white">
      <div className="mx-auto max-w-7xl px-5 pb-7 pt-14 sm:px-8 sm:pb-9 sm:pt-16 lg:px-10">
        <div className="grid gap-12 border-b border-white/14 pb-12 md:grid-cols-[1.1fr_1.9fr] lg:gap-24 lg:pb-14">
          <div>
            <Brand inverse label={t('common.medreachHome')} />
            <p className="mt-6 max-w-sm text-base leading-7 text-white/58">{t('footer.description')}</p>
            <Link className="arrow-link arrow-link--light group mt-7" to="/doctors">{t('footer.findDoctor')} <span className="arrow-link__icon" aria-hidden="true">→</span></Link>
          </div>
          <nav aria-label={t('footer.label')} className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3">
            {footerGroups.map(group => (
              <div key={group.heading}>
                <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#A8E6CF]">{group.heading}</h2>
                <ul className="mt-5 space-y-3.5 text-sm text-white/62">
                  {group.links.map(link => <li key={link.label}><Link className="inline-block transition-[color,transform] duration-200 hover:translate-x-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A8E6CF] focus-visible:ring-offset-4 focus-visible:ring-offset-[#07182C]" to={link.to}>{link.label}</Link></li>)}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="flex flex-col gap-3 pt-6 text-xs leading-5 text-white/42 sm:flex-row sm:items-center sm:justify-between">
          <p>{t('footer.rights')}</p>
          <p>{t('footer.emergency')}</p>
        </div>
      </div>
    </footer>
  )
}
