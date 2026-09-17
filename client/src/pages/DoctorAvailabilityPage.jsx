import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PublicFooter } from '../components/PublicFooter.jsx'
import { PublicHeader } from '../components/PublicHeader.jsx'
import { useModalDialog } from '../hooks/useModalDialog.js'
import { createDoctorAvailability, deleteDoctorAvailability, listDoctorAvailability } from '../lib/api.js'
import { formatAppointmentTime, formatFee } from '../lib/appointment-format.js'
import { isoToIndiaDate, todayInIndia } from '../lib/date.js'

const initialForm = { date: '', startTime: '', endTime: '', fee: '' }
const halfHourTimes = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2)
  const minute = index % 2 === 0 ? '00' : '30'
  return `${String(hour).padStart(2, '0')}:${minute}`
})
const startTimeOptions = halfHourTimes.slice(0, -1)
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const friendlyErrors = {
  AVAILABILITY_OVERLAP: 'This time overlaps with availability you already added.',
  AVAILABILITY_IN_PAST: 'Choose a future date and time.',
  ACCOUNT_DISABLED: 'This account is disabled. Availability can’t be changed.',
  DOCTOR_NOT_APPROVED: 'Your doctor profile must be approved before you can manage availability.',
  AVAILABILITY_BLOCK_PROTECTED: 'This availability has appointment history and can’t be removed.',
  AVAILABILITY_BLOCK_NOT_DELETABLE: 'Only future availability can be removed.',
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

function CalendarField({ value, onChange, buttonRef }) {
  const [open, setOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() => monthFromDate(value))
  const fieldRef = useRef(null)
  const today = todayInIndia()
  const todayMonth = monthFromDate(today)
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
      <button aria-controls="availability-calendar" aria-expanded={open} aria-label={value ? `Date, ${formatSelectedDate(value)}` : 'Date, choose a date'} className="availability-calendar-trigger" onClick={() => setOpen(current => !current)} ref={buttonRef} type="button">
        <span data-placeholder={!value}>{formatSelectedDate(value)}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24"><rect height="16" rx="2" width="18" x="3" y="5" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
      </button>
      {open && <div aria-label="Choose availability date" className="availability-calendar" id="availability-calendar" role="group">
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
            disabled={date < today}
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
          <div><p>New schedule</p><h2 id="add-availability-heading">Add availability</h2></div>
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
        <p className="availability-dialog__eyebrow">Confirm removal</p><h2 id="remove-availability-heading">Remove availability?</h2>
        <p className="availability-dialog__copy">Patients will no longer be able to book these open slots.</p>
        {error && <p className="availability-dialog__error" role="alert">{error}</p>}
        <div className="availability-dialog__actions">
          <button className="availability-button availability-button--secondary" disabled={pending} onClick={guardedClose} ref={cancelRef} type="button">Cancel</button>
          <button className="availability-button availability-button--danger" disabled={pending} onClick={remove} type="button">{pending ? 'Removing…' : 'Remove availability'}</button>
        </div>
      </section>
    </div>
  )
}

function AvailabilityBlock({ block, onDelete }) {
  return (
    <article className="availability-block">
      <div className="availability-block__summary">
        <div><strong>{formatAppointmentTime(block.startAt)} – {formatAppointmentTime(block.endAt)}</strong><span>{block.slots.length} × 30-minute slots · IST</span></div>
        <p>{formatFee(block.effectiveFee, 'en-IN', 'Fee not specified')}</p>
      </div>
      <ul className="availability-slots" aria-label={`Slots from ${formatAppointmentTime(block.startAt)} to ${formatAppointmentTime(block.endAt)}`}>
        {block.slots.map(slot => { const state = slotState(slot); return <li key={slot.id}><time dateTime={slot.startAt}>{formatAppointmentTime(slot.startAt)}</time><span data-state={state.toLowerCase()}>{state}</span></li> })}
      </ul>
      {block.isProtected && <p className="availability-block__protected">This availability has appointment history and can’t be removed.</p>}
      {block.canDelete && <button className="availability-block__remove" onClick={() => onDelete(block)} type="button">Remove availability</button>}
    </article>
  )
}

export function DoctorAvailabilityPage() {
  const [requestVersion, setRequestVersion] = useState(0)
  const [state, setState] = useState({ key: null, data: null, error: null })
  const [dialog, setDialog] = useState(null)
  const [notice, setNotice] = useState(null)
  const requestKey = String(requestVersion)
  const refresh = useCallback(() => setRequestVersion(version => version + 1), [])
  const closeDialog = useCallback(() => setDialog(null), [])
  const openAddDialog = useCallback(() => { setNotice(null); setDialog({ type: 'add' }) }, [])

  useEffect(() => {
    const controller = new AbortController()
    const currentKey = requestKey
    listDoctorAvailability(controller.signal)
      .then(data => setState({ key: currentKey, data, error: null }))
      .catch(error => { if (error.name !== 'AbortError') setState({ key: currentKey, data: null, error }) })
    return () => controller.abort()
  }, [requestKey])

  const grouped = useMemo(() => {
    const groups = new Map()
    for (const block of state.data?.items ?? []) {
      const date = isoToIndiaDate(block.startAt)
      if (!groups.has(date)) groups.set(date, [])
      groups.get(date).push(block)
    }
    return [...groups.entries()]
  }, [state.data])
  const loading = state.key !== requestKey

  function created() { setDialog(null); setNotice({ type: 'success', message: 'Availability added.' }); refresh() }
  function deleted() { setDialog(null); setNotice({ type: 'success', message: 'Availability removed.' }); refresh() }
  function protectedDelete(message) { setDialog(null); setNotice({ type: 'error', message }); refresh() }

  return (
    <div className="doctor-availability-page min-h-screen">
      <PublicHeader editorial forceEnglish />
      <main className="doctor-availability-shell">
        <div className="doctor-availability__intro">
          <div><p>Consultation schedule</p><h1>Availability</h1><span>Set the times patients can book for consultation.</span></div>
          <button className="availability-button availability-button--primary" onClick={openAddDialog} type="button"><span aria-hidden="true">+</span> Add availability</button>
        </div>
        {notice && <p className="doctor-availability__notice" data-type={notice.type} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.message}</p>}
        {loading && <div className="doctor-availability__loading animate-pulse" aria-label="Loading availability"><div /><div /></div>}
        {!loading && state.error && <div className="doctor-availability__error"><h2>We couldn’t load your availability</h2><p>{friendlyError(state.error, 'Please try again.')}</p><button onClick={refresh} type="button">Try again</button></div>}
        {!loading && state.data && grouped.length === 0 && <div className="doctor-availability__empty">
          <svg aria-hidden="true" viewBox="0 0 48 48"><rect height="34" rx="5" width="38" x="5" y="9" /><path d="M14 5v8M34 5v8M5 18h38M14 26h8M14 33h14" /></svg>
          <h2>No upcoming availability</h2><p>Add time so patients can book a consultation.</p>
          <button className="availability-button availability-button--secondary" onClick={openAddDialog} type="button">Add availability</button>
        </div>}
        {!loading && grouped.length > 0 && <div className="availability-dates">{grouped.map(([date, blocks]) => (
          <section className="availability-date" key={date} aria-labelledby={`availability-date-${date}`}>
            <h2 id={`availability-date-${date}`}>{formatAvailabilityDate(date)}</h2>
            <div>{blocks.map(block => <AvailabilityBlock block={block} key={block.id} onDelete={selected => { setNotice(null); setDialog({ type: 'delete', block: selected }) }} />)}</div>
          </section>
        ))}</div>}
      </main>
      <PublicFooter />
      {dialog?.type === 'add' && <AvailabilityDialog onClose={closeDialog} onCreated={created} />}
      {dialog?.type === 'delete' && <DeleteDialog block={dialog.block} onClose={closeDialog} onDeleted={deleted} onProtected={protectedDelete} />}
    </div>
  )
}
