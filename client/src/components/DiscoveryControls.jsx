import { createPortal } from 'react-dom'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from '../hooks/useLanguage.js'

function parseDate(value) {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

function toDateValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function focusAdjacentControl(trigger, reverse = false) {
  const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  const controls = [...document.querySelectorAll(selector)].filter(element => !element.closest('.discovery-popover') && element.offsetParent !== null)
  const currentIndex = controls.indexOf(trigger)
  const nextIndex = reverse ? currentIndex - 1 : currentIndex + 1
  controls[Math.min(controls.length - 1, Math.max(0, nextIndex))]?.focus()
}

function useAnchoredPopover(open, onClose, preferredWidth, preferSidePlacement = false) {
  const triggerRef = useRef(null)
  const popoverRef = useRef(null)
  const [position, setPosition] = useState({ left: 12, top: 12, width: preferredWidth })

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return

    const rect = triggerRef.current.getBoundingClientRect()
    const width = Math.min(Math.max(rect.width, preferredWidth), window.innerWidth - 24)
    const popoverHeight = popoverRef.current?.offsetHeight ?? 280
    let left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12)
    const roomBelow = window.innerHeight - rect.bottom - 12
    const roomAbove = rect.top - 12
    const fitsBelow = roomBelow >= popoverHeight + 8
    const fitsAbove = roomAbove >= popoverHeight + 8
    const roomLeft = rect.left - 12
    const roomRight = window.innerWidth - rect.right - 12
    const canPlaceBeside = preferSidePlacement && !fitsBelow && !fitsAbove && Math.max(roomLeft, roomRight) >= width + 8
    let top

    if (canPlaceBeside) {
      left = roomLeft >= width + 8 ? rect.left - width - 8 : rect.right + 8
      top = Math.min(Math.max(12, rect.top), window.innerHeight - popoverHeight - 12)
    } else {
      top = fitsBelow || roomBelow >= roomAbove
        ? Math.min(rect.bottom + 8, window.innerHeight - popoverHeight - 12)
        : rect.top - popoverHeight - 8
    }

    setPosition({ left, top: Math.max(12, top), width })
  }, [preferSidePlacement, preferredWidth])

  useLayoutEffect(() => {
    if (!open) return undefined
    updatePosition()
    const frame = window.requestAnimationFrame(updatePosition)
    return () => window.cancelAnimationFrame(frame)
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return undefined

    function handlePointerDown(event) {
      if (triggerRef.current?.contains(event.target) || popoverRef.current?.contains(event.target)) return
      onClose()
    }

    function handleFocusIn(event) {
      if (triggerRef.current?.contains(event.target) || popoverRef.current?.contains(event.target)) return
      onClose()
    }

    function handleKeyDown(event) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
      window.requestAnimationFrame(() => triggerRef.current?.focus())
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [onClose, open, updatePosition])

  return { popoverRef, position, triggerRef }
}

function Chevron({ open }) {
  return (
    <svg className={`discovery-control__chevron ${open ? 'is-open' : ''}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="m2.5 4.25 3.5 3.5 3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DiscoverySelect({ ariaLabel, className = '', onChange, options, placeholder, value, variant = 'filter' }) {
  const menuId = useId()
  const optionRefs = useRef([])
  const [open, setOpen] = useState(false)
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value))
  const selectedOption = options.find(option => option.value === value)
  const active = Boolean(value)

  const closeMenu = useCallback(() => setOpen(false), [])
  const { popoverRef, position, triggerRef } = useAnchoredPopover(open, closeMenu, variant === 'search' ? 210 : variant === 'field' ? 240 : 210)

  function closeMenuAndFocus() {
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  useEffect(() => {
    if (!open) return
    window.requestAnimationFrame(() => optionRefs.current[selectedIndex]?.focus())
  }, [open, selectedIndex])

  function openMenu(direction = 0) {
    setOpen(true)
    if (direction !== 0) {
      window.requestAnimationFrame(() => {
        const index = direction > 0 ? 0 : options.length - 1
        optionRefs.current[index]?.focus()
      })
    }
  }

  function handleTriggerKeyDown(event) {
    if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) return
    event.preventDefault()
    if (open) closeMenuAndFocus()
    else openMenu(event.key === 'ArrowUp' ? -1 : 1)
  }

  function handleOptionKeyDown(event, index) {
    let nextIndex = null
    if (event.key === 'ArrowDown') nextIndex = (index + 1) % options.length
    if (event.key === 'ArrowUp') nextIndex = (index - 1 + options.length) % options.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = options.length - 1
    if (nextIndex !== null) {
      event.preventDefault()
      optionRefs.current[nextIndex]?.focus()
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onChange(options[index].value)
      closeMenuAndFocus()
    }
  }

  function handlePopoverKeyDown(event) {
    if (event.key !== 'Tab') return
    event.preventDefault()
    setOpen(false)
    window.requestAnimationFrame(() => focusAdjacentControl(triggerRef.current, event.shiftKey))
  }

  return (
    <div className={`discovery-control discovery-control--${variant} ${active ? 'is-active' : ''} ${className}`}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="discovery-control__trigger"
        onClick={() => setOpen(current => !current)}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        <span>{active ? selectedOption?.label : placeholder ?? selectedOption?.label}</span>
        <Chevron open={open} />
      </button>

      {open && createPortal(
        <div className="discovery-popover discovery-select-popover" onKeyDown={handlePopoverKeyDown} ref={popoverRef} style={position}>
          <ul aria-label={ariaLabel} id={menuId} role="listbox">
            {options.map((option, index) => (
              <li
                aria-selected={option.value === value}
                className={`discovery-option ${option.value === value ? 'is-selected' : ''}`}
                key={option.value || 'empty'}
                onClick={() => {
                  onChange(option.value)
                  closeMenuAndFocus()
                }}
                onKeyDown={event => handleOptionKeyDown(event, index)}
                ref={element => { optionRefs.current[index] = element }}
                role="option"
                tabIndex={-1}
              >
                <span>{option.label}</span>
                {option.value === value && (
                  <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                    <path d="m3 8 3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  )
}

export function DiscoveryDatePicker({ allowClear = true, ariaLabel = 'Availability date', className = '', minDate, onChange, preferSidePlacement = false, value, variant = 'filter' }) {
  const { locale, t } = useLanguage()
  const calendarId = useId()
  const calendarRef = useRef(null)
  const selectedDate = parseDate(value)
  const minimumDate = parseDate(minDate)
  const today = parseDate(toDateValue(new Date()))
  const initialView = selectedDate ?? minimumDate ?? today
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(() => new Date(initialView.getFullYear(), initialView.getMonth(), 1, 12))

  const closeCalendar = useCallback(() => setOpen(false), [])
  const { popoverRef, position, triggerRef } = useAnchoredPopover(open, closeCalendar, 288, preferSidePlacement)

  useEffect(() => {
    if (!open) return
    window.requestAnimationFrame(() => calendarRef.current?.querySelector('[data-calendar-focus="true"]')?.focus())
  }, [open])

  function closeCalendarAndFocus() {
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  function toggleCalendar() {
    if (!open) {
      const nextView = selectedDate ?? minimumDate ?? today
      setViewDate(new Date(nextView.getFullYear(), nextView.getMonth(), 1, 12))
    }
    setOpen(current => !current)
  }

  function resetCalendarView() {
    const nextView = selectedDate ?? minimumDate ?? today
    setViewDate(new Date(nextView.getFullYear(), nextView.getMonth(), 1, 12))
  }

  const days = useMemo(() => {
    const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1, 12)
    const start = new Date(firstDay)
    start.setDate(firstDay.getDate() - firstDay.getDay())
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return date
    })
  }, [viewDate])

  const displayValue = selectedDate
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(selectedDate)
    : t('calendar.anyDate')
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(viewDate)
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2023, 0, index + 1)))
  const previousMonthEnd = new Date(viewDate.getFullYear(), viewDate.getMonth(), 0, 12)
  const previousDisabled = minimumDate ? previousMonthEnd < minimumDate : false

  function moveMonth(amount) {
    setViewDate(current => new Date(current.getFullYear(), current.getMonth() + amount, 1, 12))
  }

  function chooseDate(date) {
    onChange(toDateValue(date))
    closeCalendarAndFocus()
  }

  function handleDayKeyDown(event) {
    const enabledDays = [...calendarRef.current.querySelectorAll('button:not(:disabled)')]
    const currentIndex = enabledDays.indexOf(event.currentTarget)
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (!(event.key in offsets)) return
    event.preventDefault()
    enabledDays[Math.min(enabledDays.length - 1, Math.max(0, currentIndex + offsets[event.key]))]?.focus()
  }

  function handleCalendarKeyDown(event) {
    if (event.key !== 'Tab') return
    event.preventDefault()
    setOpen(false)
    window.requestAnimationFrame(() => focusAdjacentControl(triggerRef.current, event.shiftKey))
  }

  return (
    <div className={`discovery-control discovery-control--${variant} discovery-control--date ${value ? 'is-active' : ''} ${className}`}>
      <button
        aria-controls={calendarId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${ariaLabel}: ${displayValue}`}
        className="discovery-control__trigger"
        onClick={toggleCalendar}
        ref={triggerRef}
        type="button"
      >
        <svg className="discovery-control__calendar-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
          <path d="M6.5 2.8v3.4M13.5 2.8v3.4M3 8h14" strokeLinecap="round" />
        </svg>
        <span>{displayValue}</span>
        <Chevron open={open} />
      </button>

      {open && createPortal(
        <section aria-label={t('calendar.chooseDate')} aria-modal="false" className="discovery-popover discovery-calendar" id={calendarId} onKeyDown={handleCalendarKeyDown} ref={popoverRef} role="dialog" style={position}>
          <div className="discovery-calendar__header">
            <strong>{monthLabel}</strong>
            <div>
              <button aria-label={t('calendar.previousMonth')} disabled={previousDisabled} onClick={() => moveMonth(-1)} type="button">←</button>
              <button aria-label={t('calendar.nextMonth')} onClick={() => moveMonth(1)} type="button">→</button>
            </div>
          </div>
          <div className="discovery-calendar__weekdays" aria-hidden="true">
            {weekdayLabels.map(label => <span key={label}>{label}</span>)}
          </div>
          <div className="discovery-calendar__grid" ref={calendarRef} role="grid">
            {days.map(date => {
              const dateValue = toDateValue(date)
              const disabled = minimumDate ? date < minimumDate : false
              const selected = dateValue === value
              const isToday = today ? dateValue === toDateValue(today) : false
              const outsideMonth = date.getMonth() !== viewDate.getMonth()
              return (
                <button
                  aria-label={new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(date)}
                  aria-pressed={selected}
                  className={`${selected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''} ${outsideMonth ? 'is-outside' : ''}`}
                  data-calendar-focus={selected || (!value && isToday) ? 'true' : undefined}
                  disabled={disabled}
                  key={dateValue}
                  onClick={() => chooseDate(date)}
                  onKeyDown={handleDayKeyDown}
                  role="gridcell"
                  tabIndex={selected || (!value && isToday) ? 0 : -1}
                  type="button"
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>
          <div className={`discovery-calendar__actions ${allowClear ? '' : 'is-single'}`}>
            {allowClear && <button disabled={!value} onClick={() => { onChange(''); resetCalendarView(); closeCalendarAndFocus() }} type="button">{t('calendar.clear')}</button>}
            <button onClick={() => chooseDate(today)} type="button">{t('calendar.today')}</button>
          </div>
        </section>,
        document.body,
      )}
    </div>
  )
}
