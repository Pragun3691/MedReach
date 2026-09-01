import { useCallback, useRef, useState } from 'react'
import { useModalDialog } from '../hooks/useModalDialog.js'

export function CancellationDialog({ doctorRequired, onClose, onConfirm }) {
  const dialogRef = useRef(null)
  const cancelButtonRef = useRef(null)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const guardedClose = useCallback(() => {
    if (!pending) onClose()
  }, [onClose, pending])

  useModalDialog({ open: true, onClose: guardedClose, dialogRef, initialFocusRef: cancelButtonRef })

  async function submit(event) {
    event.preventDefault()
    if (doctorRequired && !reason.trim()) {
      setError('Enter a reason so the Patient understands why this appointment was cancelled.')
      return
    }

    setPending(true)
    setError('')
    try {
      await onConfirm(reason.trim() || undefined)
    } catch (submitError) {
      setError(submitError.message)
      setPending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-6" onMouseDown={event => event.target === event.currentTarget && guardedClose()} role="presentation">
      <section className="w-full rounded-t-2xl bg-white p-6 shadow-2xl sm:max-w-lg sm:rounded-2xl" ref={dialogRef} role="dialog" aria-labelledby="cancel-appointment-heading" aria-modal="true">
        <p className="text-sm font-semibold text-rose-700">Cancel appointment</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950" id="cancel-appointment-heading">Are you sure?</h2>
        <p className="mt-3 leading-7 text-slate-600">
          {doctorRequired
            ? 'This slot will be removed from availability and the Patient will be notified.'
            : 'The Doctor will be notified. If the slot remains active and in the future, another Patient may book it.'}
        </p>

        <form className="mt-5" onSubmit={submit}>
          <label className="block text-sm font-semibold text-slate-800" htmlFor="cancellation-reason">
            Reason {doctorRequired ? '(required)' : '(optional)'}
          </label>
          <textarea
            className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            disabled={pending}
            id="cancellation-reason"
            maxLength={1000}
            onChange={event => setReason(event.target.value)}
            placeholder={doctorRequired ? 'Explain why the appointment cannot go ahead' : 'Add a short note for the Doctor'}
            value={reason}
          />
          {error && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={pending} onClick={guardedClose} ref={cancelButtonRef} type="button">Keep appointment</button>
            <button className="min-h-11 rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 disabled:cursor-wait disabled:opacity-60" disabled={pending} type="submit">{pending ? 'Cancelling…' : 'Cancel appointment'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
