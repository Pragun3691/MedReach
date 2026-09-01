import { useCallback, useRef, useState } from 'react'
import { useModalDialog } from '../hooks/useModalDialog.js'

const feeOptions = [
  { value: '', label: 'Any fee' },
  { value: '500', label: 'Up to ₹500' },
  { value: '650', label: 'Up to ₹650' },
  { value: '800', label: 'Up to ₹800' },
  { value: '1000', label: 'Up to ₹1,000' },
]

const experienceOptions = [
  { value: '', label: 'Any experience' },
  { value: '5', label: '5+ years' },
  { value: '10', label: '10+ years' },
  { value: '15', label: '15+ years' },
]

function FilterField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-800">{label}</span>
      {children}
    </label>
  )
}

function filterSelectClass() {
  return 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 outline-none hover:border-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
}

export function DoctorFilters({ filters, specializations, minDate, onChange, onApply, onClear }) {
  const [allFiltersOpen, setAllFiltersOpen] = useState(false)
  const [draft, setDraft] = useState(filters)
  const closeButtonRef = useRef(null)
  const dialogRef = useRef(null)
  const closeAllFilters = useCallback(() => setAllFiltersOpen(false), [])

  useModalDialog({ open: allFiltersOpen, onClose: closeAllFilters, dialogRef, initialFocusRef: closeButtonRef })

  function openAllFilters() {
    setDraft(filters)
    setAllFiltersOpen(true)
  }

  function updateDraft(key, value) {
    setDraft(current => ({ ...current, [key]: value }))
  }

  function applyDraft() {
    onApply(draft)
    setAllFiltersOpen(false)
  }

  const activeCount = Object.values(filters).filter(Boolean).length

  return (
    <>
      <div className="flex flex-wrap items-end gap-3" aria-label="Doctor filters">
        <label className="min-w-44 flex-1 sm:flex-none">
          <span className="sr-only">Specialization</span>
          <select className={filterSelectClass()} value={filters.specialization} onChange={event => onChange('specialization', event.target.value)}>
            <option value="">All specializations</option>
            {specializations.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
          </select>
        </label>

        <label className="min-w-40 flex-1 sm:flex-none">
          <span className="sr-only">Availability date</span>
          <input
            className={filterSelectClass()}
            min={minDate}
            type="date"
            value={filters.date}
            onChange={event => onChange('date', event.target.value)}
          />
        </label>

        <label className="min-w-36 flex-1 sm:flex-none">
          <span className="sr-only">Maximum consultation fee</span>
          <select className={filterSelectClass()} value={filters.maxFee} onChange={event => onChange('maxFee', event.target.value)}>
            {feeOptions.map(option => <option key={option.label} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        <label className="min-w-40 flex-1 sm:flex-none">
          <span className="sr-only">Minimum experience</span>
          <select className={filterSelectClass()} value={filters.minExperience} onChange={event => onChange('minExperience', event.target.value)}>
            {experienceOptions.map(option => <option key={option.label} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:border-blue-300 hover:text-blue-700"
          onClick={openAllFilters}
          type="button"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
          </svg>
          All filters{activeCount > 0 && ` (${activeCount})`}
        </button>

        {activeCount > 0 && (
          <button className="min-h-11 px-2 text-sm font-semibold text-blue-700 hover:text-blue-800" onClick={onClear} type="button">
            Clear
          </button>
        )}
      </div>

      {allFiltersOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-6"
          onMouseDown={event => {
            if (event.target === event.currentTarget) closeAllFilters()
          }}
          role="presentation"
        >
          <section
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:max-w-xl sm:rounded-2xl"
            ref={dialogRef}
            role="dialog"
            aria-labelledby="all-filters-heading"
            aria-modal="true"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-blue-700">Refine your search</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950" id="all-filters-heading">All filters</h2>
              </div>
              <button
                className="grid size-10 place-items-center rounded-full text-2xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
                onClick={closeAllFilters}
                ref={closeButtonRef}
                type="button"
                aria-label="Close all filters"
              >
                ×
              </button>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <FilterField label="Specialization">
                <select className={filterSelectClass()} value={draft.specialization} onChange={event => updateDraft('specialization', event.target.value)}>
                  <option value="">All specializations</option>
                  {specializations.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
                </select>
              </FilterField>
              <FilterField label="Available on">
                <input className={filterSelectClass()} min={minDate} type="date" value={draft.date} onChange={event => updateDraft('date', event.target.value)} />
              </FilterField>
              <FilterField label="Consultation fee">
                <select className={filterSelectClass()} value={draft.maxFee} onChange={event => updateDraft('maxFee', event.target.value)}>
                  {feeOptions.map(option => <option key={option.label} value={option.value}>{option.label}</option>)}
                </select>
              </FilterField>
              <FilterField label="Experience">
                <select className={filterSelectClass()} value={draft.minExperience} onChange={event => updateDraft('minExperience', event.target.value)}>
                  {experienceOptions.map(option => <option key={option.label} value={option.value}>{option.label}</option>)}
                </select>
              </FilterField>
            </div>

            <div className="mt-8 flex items-center justify-between gap-4 border-t border-slate-200 pt-5">
              <button className="min-h-11 px-2 text-sm font-semibold text-blue-700" onClick={() => setDraft({ specialization: '', date: '', maxFee: '', minExperience: '' })} type="button">
                Reset filters
              </button>
              <button className="min-h-11 rounded-lg bg-blue-700 px-6 text-sm font-semibold text-white hover:bg-blue-800" onClick={applyDraft} type="button">
                Show results
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
