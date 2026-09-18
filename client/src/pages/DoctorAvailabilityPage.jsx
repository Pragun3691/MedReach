import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PublicFooter } from '../components/PublicFooter.jsx'
import { PublicHeader } from '../components/PublicHeader.jsx'
import { useModalDialog } from '../hooks/useModalDialog.js'
import {
  createDoctorAvailability,
  createDoctorRecurringAvailability,
  deleteDoctorAvailability,
  listDoctorAvailability,
  listDoctorRecurringAvailability,
  stopDoctorRecurringAvailability,
} from '../lib/api.js'
import { formatAppointmentTime, formatFee } from '../lib/appointment-format.js'
import { isoToIndiaDate, todayInIndia } from '../lib/date.js'

const initialForm = { date: '', startTime: '', endTime: '', fee: '' }
const initialRecurringForm = {
  weekdays: [], startTime: '', endTime: '', startsOn: '', endMode: 'none', endsOn: '', fee: '',
}
const halfHourTimes = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2)
  const minute = index % 2 === 0 ? '00' : '30'
  return `${String(hour).padStart(2, '0')}:${minute}`
})
const startTimeOptions = halfHourTimes.slice(0, -1)
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const friendlyErrors = {
  AVAILABILITY_OVERLAP: 'This time overlaps with availability you already added.',
  AVAILABILITY_IN_PAST: 'Choose a future date and time.',
  RECURRING_AVAILABILITY_IN_PAST: 'Choose a schedule that includes future availability.',
  ACCOUNT_DISABLED: 'This account is disabled. Availability can’t be changed.',
  DOCTOR_NOT_APPROVED: 'Your doctor profile must be approved before you can manage availability.',
  AVAILABILITY_BLOCK_PROTECTED: 'This availability has appointment history and can’t be removed.',
  AVAILABILITY_BLOCK_NOT_DELETABLE: 'Only future availability can be removed.',
}

function recurringValidationRequestMessage(error) {
  const fields = new Set((error?.details ?? []).map(detail => detail.field?.split('.')[0]))
  if (fields.has('weekdays')) return 'Choose at least one valid day of the week.'
  if (fields.has('startTime') || fields.has('endTime')) return 'Choose valid start and end times on a 30-minute boundary.'
  if (fields.has('startsOn') || fields.has('endsOn')) return 'Choose a valid schedule date range.'
  if (fields.has('fee')) return 'Enter a valid consultation fee.'
  return 'Check the days, dates, times and fee, then try again.'
}

function friendlyRecurringError(error, fallback) {
  if (error?.code === 'VALIDATION_ERROR') return recurringValidationRequestMessage(error)
  if (error?.code === 'AVAILABILITY_OVERLAP') return 'This schedule overlaps availability you already have.'
  return friendlyErrors[error?.code] ?? fallback
}

function validationRequestMessage(error) {
  const fields = new Set((error?.details ?? []).map(detail => detail.field))
  if (fields.has('date')) return 'Choose a valid calendar date.'
  if (fields.has('startTime') || fields.has('endTime')) return 'Choose valid start and end times on a 30-minute boundary.'
  if (fields.has('fee')) return 'Enter a valid consultation fee.'
  return 'Check the date, times and fee, then try again.'
}

function friendlyError(error, fallback) {
  if (error?.code === 'VALIDATION_ERROR') return validationRequestMessage(error)
  return friendlyErrors[error?.code] ?? fallback
}

function formatAvailabilityDate(date) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata',
  }).format(new Date(`${date}T00:00:00+05:30`))
}

function formatSelectedDate(date) {
  if (!date) return 'Choose a date'
  const [year, month, day] = date.split('-').map(Number)
  const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' })
    .format(new Date(`${date}T00:00:00+05:30`))
  const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]
  return `${weekday}, ${day} ${monthName} ${year}`
}

function calendarDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function calendarDays(monthDate) {
  const year = monthDate.getUTCFullYear()
  const month = monthDate.getUTCMonth()
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7
  const dayCount = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: dayCount }, (_, index) => calendarDate(year, month, index + 1)),
  ]
}

function monthFromDate(date) {
  const [year, month] = (date || todayInIndia()).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 1))
}

function CalendarField({ value, onChange, buttonRef, id = 'availability-calendar', label = 'Date', minDate }) {
  const [open, setOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() => monthFromDate(value || minDate))
  const fieldRef = useRef(null)
  const today = todayInIndia()
  const earliestDate = minDate && minDate > today ? minDate : today
  const todayMonth = monthFromDate(earliestDate)
  const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(visibleMonth)
  const days = calendarDays(visibleMonth)
  const cannotGoBack = visibleMonth.getTime() <= todayMonth.getTime()

  useEffect(() => {
    if (!open) return undefined
    function closeOutside(event) {
      if (!fieldRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => document.removeEventListener('mousedown', closeOutside)
  }, [open])

  function moveMonth(offset) {
    setVisibleMonth(current => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + offset, 1)))
  }

  function chooseDate(date) {
    onChange(date)
    setOpen(false)
    buttonRef.current?.focus()
  }

  return (
    <div className="availability-calendar-field" ref={fieldRef} onKeyDown={event => {
      if (event.key === 'Escape' && open) {
        event.stopPropagation()
        setOpen(false)
        buttonRef.current?.focus()
      }
    }}>
      <button aria-controls={id} aria-expanded={open} aria-label={value ? `${label}, ${formatSelectedDate(value)}` : `${label}, choose a date`} className="availability-calendar-trigger" onClick={() => {
        if (!open && minDate && visibleMonth < monthFromDate(minDate)) setVisibleMonth(monthFromDate(minDate))
        setOpen(current => !current)
      }} ref={buttonRef} type="button">
        <span data-placeholder={!value}>{formatSelectedDate(value)}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24"><rect height="16" rx="2" width="18" x="3" y="5" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
      </button>
      {open && <div aria-label={label === 'Date' ? 'Choose availability date' : `Choose ${label.toLowerCase()}`} className="availability-calendar" id={id} role="group">
        <div className="availability-calendar__header">
          <button aria-label="Previous month" disabled={cannotGoBack} onClick={() => moveMonth(-1)} type="button">←</button>
          <strong aria-live="polite">{monthLabel}</strong>
          <button aria-label="Next month" onClick={() => moveMonth(1)} type="button">→</button>
        </div>
        <div className="availability-calendar__weekdays" aria-hidden="true">{weekdays.map(day => <span key={day}>{day}</span>)}</div>
        <div className="availability-calendar__days">
          {days.map((date, index) => date ? <button
            aria-label={`Choose ${formatAvailabilityDate(date)} ${date.slice(0, 4)}`}
            aria-current={date === today ? 'date' : undefined}
            aria-pressed={date === value}
            data-today={date === today || undefined}
            disabled={date < earliestDate}
            key={date}
            onClick={() => chooseDate(date)}
            type="button"
          >{Number(date.slice(-2))}</button> : <span aria-hidden="true" key={`blank-${index}`} />)}
        </div>
      </div>}
    </div>
  )
}

function formatTimeOption(value) {
  if (!value) return ''
  const [hour, minute] = value.split(':').map(Number)
  const period = hour < 12 ? 'AM' : 'PM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`
}

function formatAvailabilityTime(value) {
  return formatAppointmentTime(value).replace(/\b(am|pm)\b/gi, period => period.toUpperCase())
}

const timePeriods = [
  { id: 'morning', label: 'Morning', start: 0, end: 11 * 60 + 30 },
  { id: 'afternoon', label: 'Afternoon', start: 12 * 60, end: 16 * 60 + 30 },
  { id: 'evening', label: 'Evening', start: 17 * 60, end: 23 * 60 + 30 },
]

function periodForTime(value) {
  const time = minutes(value)
  return timePeriods.find(period => time >= period.start && time <= period.end)?.id ?? 'morning'
}

function TimePicker({ id, label, value, options, onChange, disabled = false }) {
  const [open, setOpen] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState('morning')
  const [activeIndex, setActiveIndex] = useState(0)
  const fieldRef = useRef(null)
  const triggerRef = useRef(null)
  const listRef = useRef(null)
  const listId = `${id}-options`
  const availablePeriods = timePeriods.filter(period => options.some(option => {
    const time = minutes(option)
    return time >= period.start && time <= period.end
  }))
  const visibleOptions = options.filter(option => periodForTime(option) === selectedPeriod)

  useEffect(() => {
    if (!open) return undefined
    listRef.current?.focus()
    function closeOutside(event) {
      if (!fieldRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => document.removeEventListener('mousedown', closeOutside)
  }, [open])

  useEffect(() => {
    const activeOption = visibleOptions[activeIndex]
    if (open && activeOption) document.getElementById(`${id}-option-${activeOption.replace(':', '-')}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, id, open, visibleOptions])

  function choose(nextValue) {
    onChange(nextValue)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function openPicker() {
    const period = value && options.includes(value) ? periodForTime(value) : availablePeriods[0]?.id
    const periodOptions = options.filter(option => periodForTime(option) === period)
    setSelectedPeriod(period)
    setActiveIndex(Math.max(0, periodOptions.indexOf(value)))
    setOpen(true)
  }

  function choosePeriod(period, focusOptions = true) {
    const periodOptions = options.filter(option => periodForTime(option) === period)
    setSelectedPeriod(period)
    setActiveIndex(Math.max(0, periodOptions.indexOf(value)))
    if (focusOptions) listRef.current?.focus()
  }

  function handlePeriodKeyDown(event, index) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? availablePeriods.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + availablePeriods.length) % availablePeriods.length
    choosePeriod(availablePeriods[nextIndex].id, false)
    event.currentTarget.parentElement.children[nextIndex]?.focus()
  }

  function handleListKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      setActiveIndex(current => {
        if (event.key === 'Home') return 0
        if (event.key === 'End') return visibleOptions.length - 1
        const offset = event.key === 'ArrowDown' ? 2 : event.key === 'ArrowUp' ? -2 : event.key === 'ArrowRight' ? 1 : -1
        return Math.min(visibleOptions.length - 1, Math.max(0, current + offset))
      })
      return
    }
    if ((event.key === 'Enter' || event.key === ' ') && visibleOptions[activeIndex]) {
      event.preventDefault()
      choose(visibleOptions[activeIndex])
    }
  }

  return (
    <div className="availability-time-field" ref={fieldRef}>
      <span>{label}</span>
      <button
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${label}, ${value ? formatTimeOption(value) : 'choose a time'}`}
        className="availability-time-trigger"
        disabled={disabled}
        onClick={() => open ? setOpen(false) : openPicker()}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault()
            openPicker()
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <span data-placeholder={!value}>{value ? formatTimeOption(value) : disabled ? 'Choose start time first' : 'Choose a time'}</span>
        <svg aria-hidden="true" viewBox="0 0 12 8"><path d="m1 1 5 5 5-5" /></svg>
      </button>
      {open && <div className="availability-time-popover" id={listId}>
        <div aria-label={`${label} periods`} className="availability-time-periods" role="tablist">
          {availablePeriods.map((period, index) => <button
            aria-controls={`${id}-${period.id}-panel`}
            aria-selected={period.id === selectedPeriod}
            key={period.id}
            onClick={() => choosePeriod(period.id)}
            onKeyDown={event => handlePeriodKeyDown(event, index)}
            role="tab"
            tabIndex={period.id === selectedPeriod ? 0 : -1}
            type="button"
          >{period.label}</button>)}
        </div>
        <div
          aria-activedescendant={visibleOptions[activeIndex] ? `${id}-option-${visibleOptions[activeIndex].replace(':', '-')}` : undefined}
          aria-label={`${label} options`}
          className="availability-time-options"
          id={`${id}-${selectedPeriod}-panel`}
          onKeyDown={handleListKeyDown}
          ref={listRef}
          role="listbox"
          tabIndex="0"
        >
          {visibleOptions.map((option, index) => <button
            aria-selected={option === value}
            data-active={index === activeIndex || undefined}
            id={`${id}-option-${option.replace(':', '-')}`}
            key={option}
            onClick={() => choose(option)}
            onMouseMove={() => setActiveIndex(index)}
            role="option"
            tabIndex="-1"
            type="button"
            value={option}
          >{formatTimeOption(option)}</button>)}
        </div>
      </div>}
    </div>
  )
}

function minutes(time) {
  if (!/^\d{2}:\d{2}$/.test(time ?? '')) return null
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

function formValues(form) {
  return { startTime: form.startTime || null, endTime: form.endTime || null }
}

function validateForm(form) {
  if (!form.date) return 'Choose a date.'
  const { startTime, endTime } = formValues(form)
  if (!startTime || !endTime) return 'Choose a start time and an end time.'
  const startMinutes = minutes(startTime)
  const endMinutes = minutes(endTime)
  if (endMinutes <= startMinutes) return 'End time must be after start time.'
  if ((endMinutes - startMinutes) % 30 !== 0) return 'Availability must use 30-minute intervals.'
  if (new Date(`${form.date}T${startTime}:00+05:30`) <= new Date()) return 'Choose a future date and time.'
  if (form.fee !== '' && (!Number.isFinite(Number(form.fee)) || Number(form.fee) < 0)) return 'Enter a valid consultation fee.'
  return ''
}

function previewFor(form) {
  if (validateForm(form)) return null
  const { startTime, endTime } = formValues(form)
  const start = minutes(startTime)
  const end = minutes(endTime)
  return { range: `${formatTimeOption(startTime)} – ${formatTimeOption(endTime)}`, slots: `${(end - start) / 30} × 30-minute slots` }
}

function validateRecurringForm(form) {
  if (form.weekdays.length === 0) return 'Choose at least one day of the week.'
  if (!form.startTime || !form.endTime) return 'Choose a start time and an end time.'
  const startMinutes = minutes(form.startTime)
  const endMinutes = minutes(form.endTime)
  if (endMinutes <= startMinutes) return 'End time must be after start time.'
  if ((endMinutes - startMinutes) % 30 !== 0) return 'Availability must use 30-minute intervals.'
  if (!form.startsOn) return 'Choose a start date.'
  if (form.startsOn < todayInIndia()) return 'Start date can’t be in the past.'
  if (form.endMode === 'date' && !form.endsOn) return 'Choose an end date.'
  if (form.endMode === 'date' && form.endsOn < form.startsOn) return 'End date must be on or after the start date.'
  if (form.fee !== '' && (!Number.isFinite(Number(form.fee)) || Number(form.fee) < 0)) return 'Enter a valid consultation fee.'
  return ''
}

function joinWeekdays(values) {
  const names = [...values].sort((left, right) => left - right).map(value => weekdayNames[value - 1])
  if (names.length < 2) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

function formatRuleDate(date) {
  const match = String(date ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return 'Date unavailable'
  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (!monthName || day < 1 || day > daysInMonth) return 'Date unavailable'
  return `${day} ${monthName} ${year}`
}

function recurringPreviewFor(form) {
  if (validateRecurringForm(form)) return null
  return {
    weekdays: `Every ${joinWeekdays(form.weekdays)}`,
    range: `${formatTimeOption(form.startTime)} – ${formatTimeOption(form.endTime)}`,
    starts: `Starting ${formatRuleDate(form.startsOn)}`,
    ends: form.endMode === 'date' ? `Until ${formatRuleDate(form.endsOn)}` : 'Continues weekly',
    slots: `${(minutes(form.endTime) - minutes(form.startTime)) / 30} × 30-minute slots each day`,
  }
}

function slotState(slot) {
  if (slot.isBooked) return 'Booked'
  if (slot.hasAppointmentHistory) return 'Protected'
  if (slot.isActive) return 'Available'
  return 'Unavailable'
}

function AvailabilityDialog({ onClose, onCreated }) {
  const [form, setForm] = useState(initialForm)
  const [pending, setPending] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [requestError, setRequestError] = useState('')
  const dialogRef = useRef(null)
  const dateRef = useRef(null)
  const guardedClose = useCallback(() => { if (!pending) onClose() }, [onClose, pending])
  useModalDialog({ open: true, onClose: guardedClose, dialogRef, initialFocusRef: dateRef })
  const validationError = validateForm(form)
  const preview = previewFor(form)
  const endTimeOptions = useMemo(() => form.startTime
    ? halfHourTimes.filter(time => minutes(time) > minutes(form.startTime))
    : [], [form.startTime])

  function updateForm(field, value) {
    setForm(current => ({ ...current, [field]: value }))
    setRequestError('')
  }

  function updateStartTime(value) {
    setForm(current => ({
      ...current,
      startTime: value,
      endTime: current.endTime && minutes(current.endTime) > minutes(value) ? current.endTime : '',
    }))
    setRequestError('')
  }

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    setRequestError('')
    if (validationError) return
    const { startTime, endTime } = formValues(form)
    const payload = { date: form.date, startTime, endTime, ...(form.fee === '' ? {} : { fee: Number(form.fee) }) }
    setPending(true)
    try {
      await createDoctorAvailability(payload)
      onCreated()
    } catch (error) {
      setRequestError(friendlyError(error, 'We couldn’t add this availability. Please try again.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="availability-dialog-backdrop" onMouseDown={event => event.target === event.currentTarget && guardedClose()} role="presentation">
      <section aria-labelledby="add-availability-heading" aria-modal="true" className="availability-dialog" ref={dialogRef} role="dialog">
        <div className="availability-dialog__heading">
          <div><p>One-off availability</p><h2 id="add-availability-heading">Add one-off availability</h2></div>
          <button aria-label="Close add availability dialog" disabled={pending} onClick={guardedClose} type="button">×</button>
        </div>
        <form noValidate onSubmit={submit}>
          <div className="availability-dialog__field"><span>Date</span><CalendarField buttonRef={dateRef} onChange={date => updateForm('date', date)} value={form.date} /></div>
          <div className="availability-dialog__times">
            <TimePicker id="availability-start" label="Start time" onChange={updateStartTime} options={startTimeOptions} value={form.startTime} />
            <TimePicker disabled={!form.startTime} id="availability-end" label="End time" onChange={time => updateForm('endTime', time)} options={endTimeOptions} value={form.endTime} />
          </div>
          <label className="availability-dialog__field">Consultation fee <span>(optional)</span><div className="availability-dialog__fee"><span aria-hidden="true">₹</span><input inputMode="decimal" min="0" name="fee" onChange={event => updateForm('fee', event.target.value)} step="0.01" type="number" value={form.fee} /></div></label>
          <p className="availability-dialog__hint">If left blank, your profile consultation fee will be used.</p>
          {preview && <div className="availability-dialog__preview" aria-live="polite"><strong>{preview.range}</strong><span>{preview.slots}</span></div>}
          {submitted && validationError && <p className="availability-dialog__error" role="alert">{validationError}</p>}
          {requestError && <p className="availability-dialog__error" role="alert">{requestError}</p>}
          <div className="availability-dialog__actions">
            <button className="availability-button availability-button--secondary" disabled={pending} onClick={guardedClose} type="button">Cancel</button>
            <button className="availability-button availability-button--primary" disabled={pending} type="submit">{pending ? 'Adding…' : 'Add availability'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

function WeeklyScheduleDialog({ onClose, onCreated }) {
  const [form, setForm] = useState(initialRecurringForm)
  const [pending, setPending] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [requestError, setRequestError] = useState('')
  const dialogRef = useRef(null)
  const firstDayRef = useRef(null)
  const startsOnRef = useRef(null)
  const endsOnRef = useRef(null)
  const guardedClose = useCallback(() => { if (!pending) onClose() }, [onClose, pending])
  useModalDialog({ open: true, onClose: guardedClose, dialogRef, initialFocusRef: firstDayRef })
  const validationError = validateRecurringForm(form)
  const preview = recurringPreviewFor(form)
  const endTimeOptions = useMemo(() => form.startTime
    ? halfHourTimes.filter(time => minutes(time) > minutes(form.startTime))
    : [], [form.startTime])

  function updateForm(field, value) {
    setForm(current => ({ ...current, [field]: value }))
    setRequestError('')
  }

  function toggleWeekday(value) {
    setForm(current => ({
      ...current,
      weekdays: current.weekdays.includes(value)
        ? current.weekdays.filter(day => day !== value)
        : [...current.weekdays, value].sort((left, right) => left - right),
    }))
    setRequestError('')
  }

  function updateStartTime(value) {
    setForm(current => ({
      ...current,
      startTime: value,
      endTime: current.endTime && minutes(current.endTime) > minutes(value) ? current.endTime : '',
    }))
    setRequestError('')
  }

  function updateStartsOn(value) {
    setForm(current => ({
      ...current,
      startsOn: value,
      endsOn: current.endsOn && current.endsOn < value ? '' : current.endsOn,
    }))
    setRequestError('')
  }

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    setRequestError('')
    if (validationError) return
    const payload = {
      weekdays: form.weekdays,
      startTime: form.startTime,
      endTime: form.endTime,
      startsOn: form.startsOn,
      ...(form.endMode === 'date' ? { endsOn: form.endsOn } : {}),
      ...(form.fee === '' ? {} : { fee: Number(form.fee) }),
    }
    setPending(true)
    try {
      await createDoctorRecurringAvailability(payload)
      onCreated()
    } catch (error) {
      setRequestError(friendlyRecurringError(error, 'We couldn’t add this weekly schedule. Please try again.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="availability-dialog-backdrop" onMouseDown={event => event.target === event.currentTarget && guardedClose()} role="presentation">
      <section aria-labelledby="add-weekly-schedule-heading" aria-modal="true" className="availability-dialog availability-dialog--weekly" ref={dialogRef} role="dialog">
        <div className="availability-dialog__heading">
          <div><p>Regular schedule</p><h2 id="add-weekly-schedule-heading">Add weekly availability</h2></div>
          <button aria-label="Close weekly schedule dialog" disabled={pending} onClick={guardedClose} type="button">×</button>
        </div>
        <form noValidate onSubmit={submit}>
          <fieldset className="availability-weekdays">
            <legend>Days of week</legend>
            <div>
              {weekdays.map((day, index) => <button
                aria-label={weekdayNames[index]}
                aria-pressed={form.weekdays.includes(index + 1)}
                key={day}
                onClick={() => toggleWeekday(index + 1)}
                ref={index === 0 ? firstDayRef : undefined}
                type="button"
              >{day}</button>)}
            </div>
          </fieldset>
          <div className="availability-dialog__times">
            <TimePicker id="weekly-start" label="Start time" onChange={updateStartTime} options={startTimeOptions} value={form.startTime} />
            <TimePicker disabled={!form.startTime} id="weekly-end" label="End time" onChange={time => updateForm('endTime', time)} options={endTimeOptions} value={form.endTime} />
          </div>
          <div className="availability-dialog__field"><span>Starts on</span><CalendarField buttonRef={startsOnRef} id="weekly-start-date-calendar" label="Starts on" onChange={updateStartsOn} value={form.startsOn} /></div>
          <fieldset className="availability-end-choice">
            <legend>Ends</legend>
            <label><input checked={form.endMode === 'none'} name="weekly-end-mode" onChange={() => updateForm('endMode', 'none')} type="radio" /> No end date</label>
            <label><input checked={form.endMode === 'date'} name="weekly-end-mode" onChange={() => updateForm('endMode', 'date')} type="radio" /> End on date</label>
          </fieldset>
          {form.endMode === 'date' && <div className="availability-dialog__field"><span>Ends on</span><CalendarField buttonRef={endsOnRef} id="weekly-end-date-calendar" label="Ends on" minDate={form.startsOn || undefined} onChange={date => updateForm('endsOn', date)} value={form.endsOn} /></div>}
          <label className="availability-dialog__field">Consultation fee <span>(optional)</span><div className="availability-dialog__fee"><span aria-hidden="true">₹</span><input inputMode="decimal" min="0" name="weeklyFee" onChange={event => updateForm('fee', event.target.value)} step="0.01" type="number" value={form.fee} /></div></label>
          <p className="availability-dialog__hint">If left blank, your profile consultation fee will be used.</p>
          {preview && <div className="availability-dialog__preview availability-dialog__preview--weekly" aria-live="polite"><strong>{preview.weekdays}</strong><span>{preview.range}</span><span>{preview.starts}</span><span>{preview.ends}</span><span>{preview.slots}</span></div>}
          {submitted && validationError && <p className="availability-dialog__error" role="alert">{validationError}</p>}
          {requestError && <p className="availability-dialog__error" role="alert">{requestError}</p>}
          <div className="availability-dialog__actions">
            <button className="availability-button availability-button--secondary" disabled={pending} onClick={guardedClose} type="button">Cancel</button>
            <button className="availability-button availability-button--primary" disabled={pending} type="submit">{pending ? 'Adding…' : 'Add weekly schedule'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

function DeleteDialog({ block, onClose, onDeleted, onProtected }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef(null)
  const cancelRef = useRef(null)
  const guardedClose = useCallback(() => { if (!pending) onClose() }, [onClose, pending])
  useModalDialog({ open: true, onClose: guardedClose, dialogRef, initialFocusRef: cancelRef })

  async function remove() {
    setPending(true)
    setError('')
    try {
      await deleteDoctorAvailability(block.id)
      onDeleted()
    } catch (requestError) {
      const message = friendlyError(requestError, 'We couldn’t remove this availability. Please try again.')
      if (requestError.code === 'AVAILABILITY_BLOCK_PROTECTED') onProtected(message)
      else setError(message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="availability-dialog-backdrop" onMouseDown={event => event.target === event.currentTarget && guardedClose()} role="presentation">
      <section aria-labelledby="remove-availability-heading" aria-modal="true" className="availability-dialog availability-dialog--confirm" ref={dialogRef} role="dialog">
        <p className="availability-dialog__eyebrow">Remove availability</p><h2 id="remove-availability-heading">Remove this availability?</h2>
        <p className="availability-dialog__copy">Patients will no longer be able to book these open times.</p>
        {error && <p className="availability-dialog__error" role="alert">{error}</p>}
        <div className="availability-dialog__actions">
          <button className="availability-button availability-button--secondary" disabled={pending} onClick={guardedClose} ref={cancelRef} type="button">Cancel</button>
          <button className="availability-button availability-button--danger" disabled={pending} onClick={remove} type="button">{pending ? 'Removing…' : 'Remove availability'}</button>
        </div>
      </section>
    </div>
  )
}

function StopScheduleDialog({ rule, onClose, onStopped }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef(null)
  const cancelRef = useRef(null)
  const guardedClose = useCallback(() => { if (!pending) onClose() }, [onClose, pending])
  useModalDialog({ open: true, onClose: guardedClose, dialogRef, initialFocusRef: cancelRef })

  async function stop() {
    setPending(true)
    setError('')
    try {
      await stopDoctorRecurringAvailability(rule.id)
      onStopped()
    } catch (requestError) {
      setError(friendlyRecurringError(requestError, 'We couldn’t stop this weekly schedule. Please try again.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="availability-dialog-backdrop" onMouseDown={event => event.target === event.currentTarget && guardedClose()} role="presentation">
      <section aria-labelledby="stop-schedule-heading" aria-modal="true" className="availability-dialog availability-dialog--confirm" ref={dialogRef} role="dialog">
        <p className="availability-dialog__eyebrow">Regular weekly schedule</p><h2 id="stop-schedule-heading">Stop this weekly schedule?</h2>
        <p className="availability-dialog__copy">Future unbooked availability from this schedule will no longer be offered. Existing patient appointments will not be cancelled.</p>
        {error && <p className="availability-dialog__error" role="alert">{error}</p>}
        <div className="availability-dialog__actions">
          <button className="availability-button availability-button--secondary" disabled={pending} onClick={guardedClose} ref={cancelRef} type="button">Cancel</button>
          <button className="availability-button availability-button--danger" disabled={pending} onClick={stop} type="button">{pending ? 'Stopping…' : 'Stop schedule'}</button>
        </div>
      </section>
    </div>
  )
}

function RecurringRule({ rule, onStop }) {
  const dayLabel = rule.weekdays.map(value => weekdays[value - 1]).join(' · ')
  const dateLabel = rule.endsOn
    ? `${formatRuleDate(rule.startsOn)} – ${formatRuleDate(rule.endsOn)}`
    : `Starting ${formatRuleDate(rule.startsOn)} · No end date`
  return (
    <article className="availability-rule" data-status={rule.status}>
      <div className="availability-rule__main">
        <div>
          <strong>{dayLabel}</strong>
          <p>{formatTimeOption(rule.startTime)} – {formatTimeOption(rule.endTime)}</p>
        </div>
        <span className="availability-rule__status">{rule.status === 'active' ? 'Active' : 'Stopped'}</span>
      </div>
      <div className="availability-rule__meta">
        <span>{dateLabel}</span>
        <span>{formatFee(rule.effectiveFee, 'en-IN', 'Fee not specified')}{rule.effectiveFee === null || rule.effectiveFee === undefined ? '' : ' per consultation'}</span>
      </div>
      {rule.status === 'active' && <button className="availability-rule__stop" onClick={() => onStop(rule)} type="button">Stop schedule</button>}
    </article>
  )
}

function PreviousSchedules({ rules }) {
  const [open, setOpen] = useState(false)
  const contentId = 'previous-schedules-list'

  return (
    <div className="availability-previous">
      <button aria-controls={contentId} aria-expanded={open} onClick={() => setOpen(value => !value)} type="button">
        <span>Previous schedules ({rules.length})</span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="availability-rules availability-rules--previous" id={contentId}>{rules.map(rule => <RecurringRule key={rule.id} onStop={() => {}} rule={rule} />)}</div>}
    </div>
  )
}

function AvailabilityBlock({ block, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const slotsId = `availability-block-${block.id}-slots`
  const availableCount = block.slots.filter(slot => slotState(slot) === 'Available').length
  const bookedCount = block.slots.filter(slot => slot.isBooked).length
  const isOneOff = block.recurringRuleId === null
  const sourceLabel = isOneOff
    ? 'One-off'
    : Number.isFinite(block.recurringRuleId)
      ? 'From regular schedule'
      : 'Source unavailable'

  return (
    <article className="availability-block">
      <div className="availability-block__summary">
        <div>
          <strong>{formatAvailabilityTime(block.startAt)} – {formatAvailabilityTime(block.endAt)}</strong>
          <span>{block.slots.length} slots · {availableCount} available · {bookedCount} booked</span>
          <span className="availability-block__source">{sourceLabel}</span>
        </div>
        <p>{formatFee(block.effectiveFee, 'en-IN', 'Fee not specified')}{block.effectiveFee === null || block.effectiveFee === undefined ? '' : ' per consultation'}</p>
      </div>
      <div className="availability-block__controls">
        <button aria-controls={slotsId} aria-expanded={expanded} className="availability-block__disclosure" onClick={() => setExpanded(value => !value)} type="button">
          {expanded ? 'Hide slots' : 'Show slots'} <span aria-hidden="true">{expanded ? '↑' : '↓'}</span>
        </button>
        {bookedCount > 0 && <Link className="availability-block__appointments" to="/doctor/appointments">View appointments <span aria-hidden="true">→</span></Link>}
      </div>
      {expanded && <ul className="availability-slots" id={slotsId} aria-label={`Slots from ${formatAvailabilityTime(block.startAt)} to ${formatAvailabilityTime(block.endAt)}`}>
        {block.slots.map(slot => { const state = slotState(slot); return <li key={slot.id}><time dateTime={slot.startAt}>{formatAvailabilityTime(slot.startAt)}</time><span data-state={state.toLowerCase()}>{state}</span></li> })}
      </ul>}
      {isOneOff && block.isProtected && <p className="availability-block__protected">This one-off time has appointment history and can’t be removed.</p>}
      {isOneOff && block.canDelete && <button className="availability-block__remove" onClick={() => onDelete(block)} type="button">Remove block</button>}
    </article>
  )
}

function AvailabilityCalendar({ groups, onDelete }) {
  const today = todayInIndia()
  const groupedByDate = new Map(groups)
  const firstAvailableDate = groups[0]?.[0] ?? null
  const lastAvailableDate = groups.at(-1)?.[0] ?? null
  const currentMonth = monthFromDate(today)
  const lastAvailableMonth = monthFromDate(lastAvailableDate || today)
  const minMonthTime = currentMonth.getTime()
  const maxMonthTime = Math.max(currentMonth.getTime(), lastAvailableMonth.getTime())
  const [visibleMonth, setVisibleMonth] = useState(() => monthFromDate(firstAvailableDate || today))
  const [selectedDate, setSelectedDate] = useState(firstAvailableDate)
  const visibleMonthTime = Math.min(maxMonthTime, Math.max(minMonthTime, visibleMonth.getTime()))
  const displayedMonth = new Date(visibleMonthTime)
  const monthLabel = new Intl.DateTimeFormat('en-IN', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(displayedMonth)
  const days = calendarDays(displayedMonth)
  const visibleMonthKey = `${displayedMonth.getUTCFullYear()}-${String(displayedMonth.getUTCMonth() + 1).padStart(2, '0')}`
  const monthHasAvailability = groups.some(([date]) => date.startsWith(visibleMonthKey))
  const selectedBlocks = selectedDate ? groupedByDate.get(selectedDate) : null

  function moveMonth(offset) {
    const nextMonth = new Date(Date.UTC(displayedMonth.getUTCFullYear(), displayedMonth.getUTCMonth() + offset, 1))
    const nextMonthKey = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, '0')}`
    setVisibleMonth(nextMonth)
    setSelectedDate(groups.find(([date]) => date.startsWith(nextMonthKey))?.[0] ?? null)
  }

  function selectToday() {
    setVisibleMonth(currentMonth)
    setSelectedDate(today)
  }

  return (
    <div className="availability-browser">
      <div className="availability-browser__calendar" aria-label="Availability by date" role="group">
        <p className="availability-browser__eyebrow">Availability</p>
        <div className="availability-browser__month-header">
          <h2 aria-live="polite" id="availability-calendar-heading">{monthLabel}</h2>
          <div>
            <button className="availability-browser__today" onClick={selectToday} type="button">Today</button>
            <button aria-label="Previous month" className="availability-browser__month-nav" disabled={visibleMonthTime <= minMonthTime} onClick={() => moveMonth(-1)} type="button">‹</button>
            <button aria-label="Next month" className="availability-browser__month-nav" disabled={visibleMonthTime >= maxMonthTime} onClick={() => moveMonth(1)} type="button">›</button>
          </div>
        </div>
        <div className="availability-browser__weekdays" aria-hidden="true">{weekdays.map(day => <span key={day}>{day}</span>)}</div>
        <div className="availability-browser__days">
          {days.map((date, index) => {
            if (!date) return <span aria-hidden="true" key={`blank-${index}`} />
            const blocks = groupedByDate.get(date)
            const hasAvailability = Boolean(blocks?.length)
            const isPast = date < today
            return <button
              aria-current={date === today ? 'date' : undefined}
              aria-label={`${hasAvailability ? 'View' : 'Select'} ${formatAvailabilityDate(date)} ${date.slice(0, 4)}${hasAvailability ? `, ${blocks.length} ${blocks.length === 1 ? 'block' : 'blocks'}` : ', no availability'}`}
              aria-selected={selectedDate === date}
              data-available={hasAvailability || undefined}
              data-past={isPast || undefined}
              disabled={isPast}
              key={date}
              onClick={() => setSelectedDate(date)}
              type="button"
            >
              <span className="availability-browser__date-number">{Number(date.slice(-2))}</span>
              {hasAvailability && <i aria-hidden="true" />}
            </button>
          })}
        </div>
        {!monthHasAvailability && <p className="availability-browser__empty-month">No bookable time this month.</p>}
      </div>

      <div className="availability-browser__detail" aria-live="polite">
        {selectedBlocks ? <section className="availability-date availability-date--selected" aria-labelledby={`availability-browse-date-${selectedDate}`}>
          <h3 id={`availability-browse-date-${selectedDate}`}>{formatAvailabilityDate(selectedDate)}</h3>
          <div>{selectedBlocks.map(block => <AvailabilityBlock block={block} key={`${selectedDate}-${block.id}`} onDelete={onDelete} />)}</div>
        </section> : selectedDate ? <div className="availability-browser__date-empty"><h3>{formatAvailabilityDate(selectedDate)}</h3><p>No bookable time on this date.</p></div> : groups.length === 0 ? <div className="availability-browser__empty"><h3>No bookable availability yet.</h3><p>Set a regular schedule or add one-off time to start accepting bookings.</p></div> : <div className="availability-browser__date-empty"><p>Select a future date to see availability.</p></div>}
      </div>
    </div>
  )
}

export function DoctorAvailabilityPage() {
  const [requestVersion, setRequestVersion] = useState(0)
  const [state, setState] = useState({ key: null, availability: null, rules: null, error: null })
  const [dialog, setDialog] = useState(null)
  const [notice, setNotice] = useState(null)
  const requestKey = String(requestVersion)
  const refresh = useCallback(() => setRequestVersion(version => version + 1), [])
  const closeDialog = useCallback(() => setDialog(null), [])
  const openOneOffDialog = useCallback(() => { setNotice(null); setDialog({ type: 'add-one-off' }) }, [])
  const openWeeklyDialog = useCallback(() => { setNotice(null); setDialog({ type: 'add-weekly' }) }, [])

  useEffect(() => {
    const controller = new AbortController()
    const currentKey = requestKey
    Promise.all([
      listDoctorAvailability(controller.signal),
      listDoctorRecurringAvailability(controller.signal),
    ])
      .then(([availability, rules]) => setState({ key: currentKey, availability, rules, error: null }))
      .catch(error => {
        if (error.name !== 'AbortError') setState({ key: currentKey, availability: null, rules: null, error })
      })
    return () => controller.abort()
  }, [requestKey])

  const grouped = useMemo(() => {
    const groups = new Map()
    for (const block of state.availability?.items ?? []) {
      const date = isoToIndiaDate(block.startAt)
      if (!groups.has(date)) groups.set(date, [])
      groups.get(date).push(block)
    }
    return [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, blocks]) => [date, blocks.sort((left, right) => new Date(left.startAt) - new Date(right.startAt))])
  }, [state.availability])
  const activeRules = useMemo(() => (state.rules?.items ?? []).filter(rule => rule.status === 'active'), [state.rules])
  const stoppedRules = useMemo(() => (state.rules?.items ?? []).filter(rule => rule.status === 'stopped'), [state.rules])
  const loading = state.key !== requestKey

  function oneOffCreated() { setDialog(null); setNotice({ type: 'success', message: 'One-off availability added.' }); refresh() }
  function weeklyCreated() { setDialog(null); setNotice({ type: 'success', message: 'Weekly schedule added.' }); refresh() }
  function stopped() { setDialog(null); setNotice({ type: 'success', message: 'Weekly schedule stopped.' }); refresh() }
  function deleted() { setDialog(null); setNotice({ type: 'success', message: 'Availability removed.' }); refresh() }
  function protectedDelete(message) { setDialog(null); setNotice({ type: 'error', message }); refresh() }

  return (
    <div className="doctor-availability-page min-h-screen">
      <PublicHeader editorial forceEnglish />
      <main className="doctor-availability-shell">
        <div className="doctor-availability__intro">
          <div><p>Consultation schedule</p><h1>Availability</h1><span>Manage when patients can book consultations.</span></div>
        </div>
        {notice && <p className="doctor-availability__notice" data-type={notice.type} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.message}</p>}
        {loading && <div className="doctor-availability__loading animate-pulse" aria-label="Loading availability"><div /><div /></div>}
        {!loading && state.error && <div className="doctor-availability__error"><h2>We couldn’t load your availability</h2><p>{friendlyError(state.error, 'Please try again.')}</p><button onClick={refresh} type="button">Try again</button></div>}
        {!loading && !state.error && <div className="availability-workspace">
          <section className="availability-section availability-section--regular" aria-labelledby="regular-schedule-heading">
            <div className="availability-section__heading">
              <div><p>Schedule settings</p><h2 id="regular-schedule-heading">Regular schedule</h2><span>Your usual weekly consultation hours.</span></div>
            </div>
            {activeRules.length > 0
              ? <div className="availability-rules">{activeRules.map(rule => <RecurringRule key={rule.id} onStop={selected => { setNotice(null); setDialog({ type: 'stop-weekly', rule: selected }) }} rule={rule} />)}</div>
              : <div className="availability-section__empty"><p>No regular schedule yet.</p><span>Add the days and times you usually consult.</span></div>}
            {stoppedRules.length > 0 && <PreviousSchedules rules={stoppedRules} />}
            <div className="availability-management-actions">
              <button className="availability-button availability-button--primary" onClick={openWeeklyDialog} type="button"><span aria-hidden="true">+</span> Add weekly schedule</button>
              <button className="availability-button availability-button--secondary" onClick={openOneOffDialog} type="button"><span aria-hidden="true">+</span> Add one-off time</button>
            </div>
          </section>

          <section className="availability-section availability-section--upcoming" aria-labelledby="availability-calendar-heading">
            <AvailabilityCalendar groups={grouped} onDelete={selected => { setNotice(null); setDialog({ type: 'delete', block: selected }) }} />
          </section>
        </div>}
      </main>
      <PublicFooter />
      {dialog?.type === 'add-one-off' && <AvailabilityDialog onClose={closeDialog} onCreated={oneOffCreated} />}
      {dialog?.type === 'add-weekly' && <WeeklyScheduleDialog onClose={closeDialog} onCreated={weeklyCreated} />}
      {dialog?.type === 'delete' && <DeleteDialog block={dialog.block} onClose={closeDialog} onDeleted={deleted} onProtected={protectedDelete} />}
      {dialog?.type === 'stop-weekly' && <StopScheduleDialog onClose={closeDialog} onStopped={stopped} rule={dialog.rule} />}
    </div>
  )
}
