import { Link } from 'react-router-dom'
import { Brand } from './Brand.jsx'

const footerGroups = [
  { heading: 'Patients', links: [{ label: 'Find Doctors', to: '/doctors' }, { label: 'How it works', to: '/#how-it-works' }, { label: 'Login', to: '/login' }] },
  { heading: 'For doctors', links: [{ label: 'Join MedReach', to: '/register?role=doctor' }, { label: 'Doctor login', to: '/login?role=doctor' }, { label: 'Verification', to: '/doctor-verification' }] },
  { heading: 'MedReach', links: [{ label: 'About', to: '/about' }, { label: 'Privacy', to: '/privacy' }, { label: 'Terms', to: '/terms' }] },
]

export function PublicFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#07182C] text-white">
      <div className="mx-auto max-w-7xl px-5 pb-7 pt-14 sm:px-8 sm:pb-9 sm:pt-16 lg:px-10">
        <div className="grid gap-12 border-b border-white/14 pb-12 md:grid-cols-[1.1fr_1.9fr] lg:gap-24 lg:pb-14">
          <div>
            <Brand inverse />
            <p className="mt-6 max-w-sm text-base leading-7 text-white/58">Remote healthcare that helps patients find verified doctors and continue care with confidence.</p>
            <Link className="arrow-link arrow-link--light group mt-7" to="/doctors">Find a doctor <span className="arrow-link__icon" aria-hidden="true">→</span></Link>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3">
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
          <p>© 2026 MedReach. All rights reserved.</p>
          <p>MedReach is for non-emergency healthcare only. Contact local emergency services for urgent help.</p>
        </div>
      </div>
    </footer>
  )
}
