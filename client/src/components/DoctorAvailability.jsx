import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { getDoctorSlots } from '../lib/api.js'
import { addCalendarDays, todayInIndia } from '../lib/date.js'
import { BookingBoundaryDialog } from './BookingBoundaryDialog.jsx'
import { DiscoveryDatePicker } from './DiscoveryControls.jsx'
import { useLanguage } from '../hooks/useLanguage.js'

function formatDay(value, selectedDate, locale, t) {
  const date = new Date(`${value}T12:00:00+05:30`)
  const today = todayInIndia()
  const tomorrow = addCalendarDays(today, 1)
  const weekday = value === today ? t('booking.today') : value === tomorrow ? t('booking.tomorrow') : new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(date)
  const calendarDate = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(date)
  return { weekday, calendarDate, selected: value === selectedDate }
}

function formatTime(value, locale) {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))
}

function visibleDates(selectedDate) {
  const today = todayInIndia()
  const endOfInitialRange = addCalendarDays(today, 4)
  const start = selectedDate > endOfInitialRange ? selectedDate : today
  return Array.from({ length: 5 }, (_, index) => addCalendarDays(start, index))
}

export function DoctorAvailability({ doctor, selectedDate, requestedSlotId, rescheduleFrom, onDateChange }) {
  const { status } = useAuth()
  const { locale, t } = useLanguage()
  const [requestVersion, setRequestVersion] = useState(0)
  const [slotState, setSlotState] = useState({ key: null, data: null, error: null })
  const [dateAvailabilityState, setDateAvailabilityState] = useState({ key: null, values: {} })
  const [selection, setSelection] = useState(null)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [activeSlot, setActiveSlot] = useState(null)
  const closeBooking = useCallback(() => {
    setBookingOpen(false)
    setActiveSlot(null)
  }, [])
  const refreshUnavailable = useCallback(() => {
    setSelection(null)
    setRequestVersion(version => version + 1)
  }, [])
  const requestKey = `${doctor.id}:${selectedDate}:${requestVersion}`
  const dates = useMemo(() => visibleDates(selectedDate), [selectedDate])
  const dateAvailabilityKey = `${doctor.id}:${dates.join(',')}:${requestVersion}`

  useEffect(() => {
    const controller = new AbortController()
    const currentRequestKey = requestKey

    getDoctorSlots(doctor.id, selectedDate, controller.signal)
      .then(data => setSlotState({ key: currentRequestKey, data, error: null }))
      .catch(error => {
        if (error.name !== 'AbortError') setSlotState({ key: currentRequestKey, data: null, error: error.message })
      })

    return () => controller.abort()
  }, [doctor.id, requestKey, selectedDate])

  useEffect(() => {
    const controller = new AbortController()
    const currentKey = dateAvailabilityKey

    Promise.all(dates.map(async date => {
      const data = await getDoctorSlots(doctor.id, date, controller.signal)
      return [date, (data.items?.length ?? 0) > 0]
    }))
      .then(entries => setDateAvailabilityState({ key: currentKey, values: Object.fromEntries(entries) }))
      .catch(error => {
        if (error.name !== 'AbortError') setDateAvailabilityState({ key: currentKey, values: {} })
      })

    return () => controller.abort()
  }, [dateAvailabilityKey, dates, doctor.id])

  const loading = slotState.key !== requestKey
  const slots = loading ? [] : (slotState.data?.items ?? [])
  const error = loading ? null : slotState.error
  const selectedSlotId = selection?.date === selectedDate ? selection.slotId : requestedSlotId
  const selectedSlot = slots.find(slot => slot.id === selectedSlotId) ?? null

  return (
    <aside className="booking-workspace" aria-labelledby="availability-heading">
      <div className="booking-workspace__heading">
        <div>
          <p className="profile-eyebrow">{rescheduleFrom ? t('booking.chooseNew') : t('booking.book')}</p>
          <h2 id="availability-heading">{t('booking.chooseDateTime')}</h2>
        </div>
        <span className="booking-workspace__duration">{t('booking.duration')}</span>
      </div>
      <p className="booking-workspace__timezone">{t('booking.timezone')}</p>

      <div className="booking-date-strip" aria-label={t('booking.chooseAppointmentDate')}>
        {dates.map(date => {
          const label = formatDay(date, selectedDate, locale, t)
          const availability = dateAvailabilityState.key === dateAvailabilityKey
            ? dateAvailabilityState.values[date]
            : undefined
          return (
            <button
              className={`booking-date-option ${label.selected ? 'is-selected' : ''} ${availability === true ? 'is-available' : availability === false ? 'is-unavailable' : ''}`}
              key={date}
              onClick={() => onDateChange(date)}
              type="button"
              aria-pressed={label.selected}
              aria-label={`${label.weekday}, ${label.calendarDate}${availability === true ? `, ${t('booking.available')}` : availability === false ? `, ${t('booking.unavailable')}` : ''}`}
            >
              <span>{label.weekday}</span>
              <strong>{label.calendarDate}</strong>
            </button>
          )
        })}
      </div>

      <div className="booking-another-date">
        <span>{t('booking.anotherDate')}</span>
        <DiscoveryDatePicker allowClear={false} ariaLabel={t('booking.chooseAnotherDate')} className="booking-date-picker" minDate={todayInIndia()} onChange={onDateChange} preferSidePlacement value={selectedDate} variant="field" />
      </div>

      <div className="booking-times">
        <div className="booking-times__heading">
          <h3>{t('booking.availableTimes')}</h3>
          {!loading && slots.length > 0 && <span>{t(slots.length === 1 ? 'booking.oneSlot' : 'booking.manySlots', { count: new Intl.NumberFormat(locale).format(slots.length) })}</span>}
        </div>

        {loading && (
          <div className="booking-slot-grid" aria-label={t('booking.loadingSlots')}>
            {[1, 2, 3, 4].map(item => <span className="booking-slot-skeleton animate-pulse" key={item} />)}
          </div>
        )}

        {!loading && error && (
          <div className="booking-times__error">
            <p>{t('booking.timesError')}</p>
            <button onClick={() => setRequestVersion(version => version + 1)} type="button">{t('common.tryAgain')}</button>
          </div>
        )}

        {!loading && !error && slots.length === 0 && (
          <div className="booking-empty-state">
            <p>{t('booking.noSlots')}</p>
            <span>{t('booking.noSlotsCopy')}</span>
          </div>
        )}

        {!loading && !error && slots.length > 0 && (
          <div className="booking-slot-grid">
            {slots.map(slot => {
              const selected = selectedSlot?.id === slot.id
              return (
                <button
                  className={`booking-slot ${selected ? 'is-selected' : ''}`}
                  key={slot.id}
                  onClick={() => setSelection({ date: selectedDate, slotId: slot.id })}
                  type="button"
                  aria-pressed={selected}
                >
                  {formatTime(slot.startAt, locale)}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="booking-summary">
        <div className="booking-summary__fee">
          <span>{t('booking.fee')}</span>
          <strong>
            {selectedSlot?.fee === null || (!selectedSlot && doctor.defaultFee === null)
              ? t('booking.shownAtConfirmation')
              : new Intl.NumberFormat(locale, { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(selectedSlot?.fee ?? doctor.defaultFee)}
          </strong>
        </div>
        <button
          className="booking-primary-action"
          disabled={!selectedSlot}
          onClick={() => {
            setActiveSlot({ ...selectedSlot, date: selectedDate })
            setBookingOpen(true)
          }}
          type="button"
        >
          {selectedSlot ? t(rescheduleFrom ? 'booking.rescheduleTo' : 'booking.continueWith', { time: formatTime(selectedSlot.startAt, locale) }) : t('booking.selectTime')}
          {selectedSlot && <span aria-hidden="true">→</span>}
        </button>
        <p className="booking-summary__safety">
          {status === 'authenticated'
            ? rescheduleFrom ? t('booking.unchanged') : t('booking.notCreated')
            : t('booking.signInFirst')}
        </p>
      </div>

      {bookingOpen && activeSlot && (
        <BookingBoundaryDialog
          doctor={doctor}
          onClose={closeBooking}
          onUnavailable={refreshUnavailable}
          rescheduleFrom={rescheduleFrom}
          slot={activeSlot}
        />
      )}
    </aside>
  )
}
