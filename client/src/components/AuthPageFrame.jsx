import { PublicFooter } from './PublicFooter.jsx'
import { PublicHeader } from './PublicHeader.jsx'

export function AuthPageFrame({ eyebrow, title, description, children, aside }) {
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
