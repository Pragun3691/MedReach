import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { getDoctorSlots } from '../lib/api.js'
import { addCalendarDays, todayInIndia } from '../lib/date.js'
import { BookingBoundaryDialog } from './BookingBoundaryDialog.jsx'

function formatDay(value, selectedDate) {
  const date = new Date(`${value}T12:00:00+05:30`)
  const today = todayInIndia()
  const tomorrow = addCalendarDays(today, 1)
  const weekday = value === today ? 'Today' : value === tomorrow ? 'Tomorrow' : new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(date)
  const calendarDate = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(date)
  return { weekday, calendarDate, selected: value === selectedDate }
}

function formatTime(value) {
  return new Intl.DateTimeFormat('en-IN', {
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
  const [requestVersion, setRequestVersion] = useState(0)
  const [slotState, setSlotState] = useState({ key: null, data: null, error: null })
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

  const loading = slotState.key !== requestKey
  const slots = loading ? [] : (slotState.data?.items ?? [])
  const error = loading ? null : slotState.error
  const selectedSlotId = selection?.date === selectedDate ? selection.slotId : requestedSlotId
  const selectedSlot = slots.find(slot => slot.id === selectedSlotId) ?? null

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-34px_rgba(15,23,42,0.45)] sm:p-6" aria-labelledby="availability-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-700">{rescheduleFrom ? 'Choose a new time' : 'Book a consultation'}</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950" id="availability-heading">Choose a date and time</h2>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">30 min</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">Available times are shown in Indian Standard Time.</p>

      <div className="mt-6 grid grid-cols-5 gap-2" aria-label="Choose an appointment date">
        {dates.map(date => {
          const label = formatDay(date, selectedDate)
          return (
            <button
              className={`min-h-16 rounded-lg border px-1.5 py-2 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${label.selected ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'}`}
              key={date}
              onClick={() => onDateChange(date)}
              type="button"
              aria-pressed={label.selected}
            >
              <span className="block whitespace-nowrap text-[10px] font-semibold uppercase tracking-normal">{label.weekday}</span>
              <span className="mt-1 block text-xs font-medium">{label.calendarDate}</span>
            </button>
          )
        })}
      </div>

      <label className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-3 py-2">
        <span className="text-sm font-medium text-slate-700">Another date</span>
        <input
          className="min-h-9 min-w-0 rounded-md border-0 bg-transparent text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-600"
          min={todayInIndia()}
          onChange={event => onDateChange(event.target.value)}
          type="date"
          value={selectedDate}
        />
      </label>

      <div className="mt-6 border-t border-slate-200 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-slate-950">Available times</h3>
          {!loading && slots.length > 0 && <span className="text-xs text-slate-500">{slots.length} slots</span>}
        </div>

        {loading && (
          <div className="mt-4 grid grid-cols-2 gap-2" aria-label="Loading available slots">
            {[1, 2, 3, 4].map(item => <span className="h-12 animate-pulse rounded-lg bg-slate-100" key={item} />)}
          </div>
        )}

        {!loading && error && (
          <div className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            <p>Available times could not be loaded.</p>
            <button className="mt-2 font-semibold underline underline-offset-2" onClick={() => setRequestVersion(version => version + 1)} type="button">Try again</button>
          </div>
        )}

        {!loading && !error && slots.length === 0 && (
          <div className="mt-4 rounded-lg bg-slate-50 p-5 text-center">
            <p className="font-semibold text-slate-900">No slots on this date</p>
            <p className="mt-1 text-sm text-slate-600">Choose another available date to continue.</p>
          </div>
        )}

        {!loading && !error && slots.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {slots.map(slot => {
              const selected = selectedSlot?.id === slot.id
              return (
                <button
                  className={`min-h-12 rounded-lg border px-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${selected ? 'border-blue-700 bg-blue-50 text-blue-800 ring-1 ring-blue-700' : 'border-slate-200 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50'}`}
                  key={slot.id}
                  onClick={() => setSelection({ date: selectedDate, slotId: slot.id })}
                  type="button"
                  aria-pressed={selected}
                >
                  {formatTime(slot.startAt)}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-slate-200 pt-5">
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-slate-600">Consultation fee</span>
          <strong className="text-base text-slate-950">
            {selectedSlot?.fee === null || (!selectedSlot && doctor.defaultFee === null)
              ? 'Shown at confirmation'
              : `₹${selectedSlot?.fee ?? doctor.defaultFee}`}
          </strong>
        </div>
        <button
          className="mt-4 min-h-12 w-full rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          disabled={!selectedSlot}
          onClick={() => {
            setActiveSlot({ ...selectedSlot, date: selectedDate })
            setBookingOpen(true)
          }}
          type="button"
        >
          {selectedSlot ? rescheduleFrom ? 'Continue to reschedule' : 'Continue to booking' : 'Select a time to continue'}
        </button>
        <p className="mt-3 text-center text-xs leading-5 text-slate-500">
          {status === 'authenticated'
            ? rescheduleFrom ? 'Your current appointment stays unchanged until you confirm.' : 'No appointment is created until you confirm.'
            : 'You’ll sign in before confirming the appointment.'}
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
