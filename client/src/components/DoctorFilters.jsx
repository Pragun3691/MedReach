import { useCallback, useRef, useState } from 'react'
import { useModalDialog } from '../hooks/useModalDialog.js'
import { DiscoveryDatePicker, DiscoverySelect } from './DiscoveryControls.jsx'
import { useLanguage } from '../hooks/useLanguage.js'
import { specializationDisplayName } from '../i18n/messages.js'

function FilterField({ label, children }) {
  return (
    <div className="all-filters-field">
      <span>{label}</span>
      {children}
    </div>
  )
}

export function DoctorFilters({ filters, specializations, minDate, onChange, onApply, onClear }) {
  const { language, locale, t } = useLanguage()
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
  const number = value => new Intl.NumberFormat(locale).format(value)
  const feeOptions = ['', '500', '650', '800', '1000'].map(value => ({ value, label: value ? t('filters.upTo', { amount: number(Number(value)) }) : t('filters.anyFee') }))
  const experienceOptions = ['', '5', '10', '15'].map(value => ({ value, label: value ? t('filters.yearsPlus', { years: number(Number(value)) }) : t('filters.anyExperience') }))
  const specializationOptions = [
    { value: '', label: t('filters.allSpecializations') },
    ...specializations.map(item => ({ value: item.name, label: specializationDisplayName(language, item.name) })),
  ]

  return (
    <>
      <div className="filter-strip" aria-label={t('filters.label')}>
        <DiscoverySelect ariaLabel={t('filters.specializationFilter')} className="filter-control filter-control--specialization" onChange={value => onChange('specialization', value)} options={specializationOptions} placeholder={t('filters.specialization')} value={filters.specialization} />

        <DiscoveryDatePicker ariaLabel={t('filters.availability')} className="filter-control filter-control--date" minDate={minDate} onChange={value => onChange('date', value)} value={filters.date} />

        <DiscoverySelect ariaLabel={t('filters.feeFilter')} className="filter-control filter-control--secondary" onChange={value => onChange('maxFee', value)} options={feeOptions} placeholder={t('filters.fee')} value={filters.maxFee} />

        <DiscoverySelect ariaLabel={t('filters.experienceFilter')} className="filter-control filter-control--secondary" onChange={value => onChange('minExperience', value)} options={experienceOptions} placeholder={t('filters.experience')} value={filters.minExperience} />

        <button aria-label={t('filters.allFilters')} className={`filter-all ${activeCount > 0 ? 'filter-all--active' : ''}`} onClick={openAllFilters} type="button">
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
          </svg>
          {t('filters.all')}{activeCount > 0 && <span className="filter-count">{number(activeCount)}</span>}
        </button>

        {activeCount > 0 && (
          <button className="filter-clear" onClick={onClear} type="button">{t('filters.clearAll')}</button>
        )}
      </div>

      {allFiltersOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#07182C]/52 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={event => {
          if (event.target === event.currentTarget) closeAllFilters()
        }} role="presentation">
          <section className="all-filters-dialog max-h-[94vh] w-full overflow-y-auto rounded-t-xl bg-[#F8F6F1] p-5 shadow-2xl sm:max-w-xl sm:rounded-xl sm:p-7" ref={dialogRef} role="dialog" aria-labelledby="all-filters-heading" aria-modal="true">
            <div className="flex items-start justify-between gap-4 border-b border-[#0F2747]/10 pb-4">
              <div>
                <p className="editorial-eyebrow">{t('filters.refine')}</p>
                <h2 className="mt-2.5 text-3xl font-medium tracking-[-0.035em] text-[#0F2747]" id="all-filters-heading">{t('filters.allFilters')}</h2>
              </div>
              <button className="all-filters-close" onClick={closeAllFilters} ref={closeButtonRef} type="button" aria-label={t('filters.close')}>×</button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <FilterField label={t('filters.specialization')}>
                <DiscoverySelect ariaLabel={t('filters.specialization')} onChange={value => updateDraft('specialization', value)} options={specializationOptions} placeholder={t('filters.allSpecializations')} value={draft.specialization} variant="field" />
              </FilterField>
              <FilterField label={t('filters.availableOn')}>
                <DiscoveryDatePicker ariaLabel={t('filters.availableOn')} minDate={minDate} onChange={value => updateDraft('date', value)} value={draft.date} variant="field" />
              </FilterField>
              <FilterField label={t('filters.consultationFee')}>
                <DiscoverySelect ariaLabel={t('filters.consultationFee')} onChange={value => updateDraft('maxFee', value)} options={feeOptions} placeholder={t('filters.anyFee')} value={draft.maxFee} variant="field" />
              </FilterField>
              <FilterField label={t('filters.experience')}>
                <DiscoverySelect ariaLabel={t('filters.experience')} onChange={value => updateDraft('minExperience', value)} options={experienceOptions} placeholder={t('filters.anyExperience')} value={draft.minExperience} variant="field" />
              </FilterField>
            </div>

            <div className="mt-6 flex items-center justify-between gap-4 border-t border-[#0F2747]/10 pt-5">
              <button className="min-h-11 px-2 text-sm font-semibold text-[#245F54] hover:text-[#0F2747]" onClick={() => setDraft({ specialization: '', date: '', maxFee: '', minExperience: '' })} type="button">{t('filters.reset')}</button>
              <button className="primary-cta min-h-11 rounded-md bg-[#0F2747] px-6 text-sm font-semibold text-white hover:bg-[#173960] focus:outline-none focus:ring-2 focus:ring-[#2C7A68] focus:ring-offset-2" onClick={applyDraft} type="button">{t('filters.showResults')}</button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
