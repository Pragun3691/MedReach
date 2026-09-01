import { Link } from 'react-router-dom'
import { Brand } from './Brand.jsx'

const footerGroups = [
  {
    heading: 'Patients',
    links: [
      { label: 'Find Doctors', to: '/doctors' },
      { label: 'How it works', to: '/#how-it-works' },
      { label: 'Login', to: '/login' },
    ],
  },
  {
    heading: 'For doctors',
    links: [
      { label: 'Join MedReach', to: '/register?role=doctor' },
      { label: 'Doctor login', to: '/login?role=doctor' },
      { label: 'Verification', to: '/doctor-verification' },
    ],
  },
  {
    heading: 'MedReach',
    links: [
      { label: 'About', to: '/about' },
      { label: 'Privacy', to: '/privacy' },
      { label: 'Terms', to: '/terms' },
    ],
  },
]

export function PublicFooter() {
  return (
    <footer className="bg-slate-950 text-slate-300">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.5fr_2fr] lg:px-10 lg:py-14">
        <div>
          <Brand inverse />
          <p className="mt-5 max-w-sm text-sm leading-6 text-slate-400">
            Remote healthcare that helps patients find verified doctors and continue care with confidence.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {footerGroups.map(group => (
            <div key={group.heading}>
              <h2 className="text-sm font-semibold text-white">{group.heading}</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-400">
                {group.links.map(link => (
                  <li key={link.label}>
                    <Link className="hover:text-white" to={link.to}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-slate-800">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <p>© 2026 MedReach. All rights reserved.</p>
          <p>For non-emergency healthcare only.</p>
        </div>
      </div>
    </footer>
  )
}
