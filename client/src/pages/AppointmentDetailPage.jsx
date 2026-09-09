import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CancellationDialog } from '../components/CancellationDialog.jsx'
import { DeviceCheck } from '../components/DeviceCheck.jsx'
import { DeviceCheckDialog } from '../components/DeviceCheckDialog.jsx'
import { JaasMeeting } from '../components/JaasMeeting.jsx'
import { ClinicalWorkspace } from '../components/ClinicalWorkspace.jsx'
import { PatientConsultationRecord } from '../components/PatientConsultationRecord.jsx'
import { PublicFooter } from '../components/PublicFooter.jsx'
import { PublicHeader } from '../components/PublicHeader.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { appointmentStatusLabels, getAppointmentDisplayStatus } from '../lib/appointment-display.js'
import { formatAppointmentTime, formatFee } from '../lib/appointment-format.js'
import { beginAppointmentConsultation, cancelAppointment, finishAppointmentConsultation, getAppointment, getAppointmentConsultation, getAppointmentVideoSession, markAppointmentNoShow, markAppointmentReady, openAppointmentRoom, saveAppointmentConsultation } from '../lib/api.js'
import { resolveDoctorPortrait } from '../lib/doctor-portraits.js'
import { useLanguage } from '../hooks/useLanguage.js'
import { specializationDisplayName, translateMessage } from '../i18n/messages.js'

const stateTime = (value, locale = 'en-IN') => new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(value))

function primaryDate(value, locale = 'en-IN') {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).format(new Date(value))
}

function DisplayStatus({ appointment, t }) {
  const status = getAppointmentDisplayStatus(appointment)
  return <span className="patient-appointment-status" data-status={status}>{t ? t(`status.${status}`) : appointmentStatusLabels[status] ?? status}</span>
}

function ConfirmDialog({ heading, message, confirmLabel, pending, onCancel, onConfirm }) {
  return <div className="consultation-dialog-backdrop" role="presentation"><section aria-labelledby="confirm-heading" aria-modal="true" className="consultation-dialog consultation-dialog--confirm" role="dialog">
    <p className="consultation-dialog__eyebrow">Confirm action</p><h2 id="confirm-heading">{heading}</h2><p className="consultation-dialog__intro">{message}</p>
    <div className="consultation-dialog__actions"><button className="consultation-secondary-button" disabled={pending} onClick={onCancel} type="button">Cancel</button><button className="consultation-primary-button" disabled={pending} onClick={onConfirm} type="button">{pending ? 'Please wait…' : confirmLabel}</button></div>
  </section></div>
}

function PreCallDialog({ appointment, pending, error, onClose, onJoin }) {
  return <div className="consultation-dialog-backdrop" role="presentation"><section aria-labelledby="precall-heading" aria-modal="true" className="consultation-dialog consultation-dialog--precall" role="dialog">
    <p className="consultation-dialog__eyebrow">Remote consultation</p><h2 id="precall-heading">Consultation with {appointment.doctor.fullName}</h2>
    <p className="consultation-dialog__intro">Check this device, then enter the private appointment room when you’re ready.</p><DeviceCheck />
    {error && <p className="consultation-action-error" role="alert">{error}</p>}
    <div className="consultation-dialog__actions"><button className="consultation-secondary-button" disabled={pending} onClick={onClose} type="button">Back</button><button className="consultation-primary-button" disabled={pending} onClick={onJoin} type="button">{pending ? 'Authorizing…' : 'Join consultation →'}</button></div>
  </section></div>
}

function VideoRoom({ appointment, clinicalWorkspace, isDoctor, session, localJoined, participantConnected, error, onBegin, onClose, onConferenceLeft, onLocalJoined, onParticipantJoined, onParticipantLeft, onVideoError }) {
  const inProgress = Boolean(appointment.consultationFlow.consultationStartedAt)
  return <div aria-labelledby="room-heading" aria-modal="true" className="consultation-room-shell" role="dialog">
    <header className="consultation-room-header"><div><p>MedReach consultation</p><h2 id="room-heading">{isDoctor ? appointment.patient.fullName : appointment.doctor.fullName}</h2></div><button onClick={onClose} type="button">Leave room</button></header>
    <div aria-live="polite" className="consultation-room-status"><strong>{localJoined ? 'Connected to consultation room' : 'Connecting to consultation room…'}</strong><span>{participantConnected ? (isDoctor ? 'Patient connected' : 'Doctor connected') : (isDoctor ? 'Waiting for patient to connect' : 'Waiting for doctor')}</span></div>
    {error && <p className="consultation-room-error" role="alert">{error}</p>}
    <div className={isDoctor && inProgress ? 'active-consultation-layout' : 'active-consultation-layout active-consultation-layout--video-only'}><JaasMeeting className="consultation-room-frame" onConferenceLeft={onConferenceLeft} onError={onVideoError} onLocalJoined={onLocalJoined} onParticipantJoined={onParticipantJoined} onParticipantLeft={onParticipantLeft} session={session} />{isDoctor && inProgress && clinicalWorkspace}</div>
    {isDoctor && <footer className="consultation-room-footer"><div><strong>{inProgress ? 'Consultation in progress' : 'Clinical consultation not started'}</strong><span>{inProgress ? 'Leaving the video room will not finish this consultation.' : 'Entering the room does not begin the MedReach Consultation.'}</span></div>{!inProgress && appointment.consultationFlow.canBeginConsultation && <button className="consultation-primary-button" onClick={onBegin} type="button">Begin consultation →</button>}</footer>}
  </div>
}

export function AppointmentDetailPage() {
  const languageState = useLanguage()
  const { appointmentId } = useParams()
  const { currentUser } = useAuth()
  const [version, setVersion] = useState(0)
  const [state, setState] = useState({ key: null, appointment: null, error: null })
  const [cancellationOpen, setCancellationOpen] = useState(false)
  const [deviceCheckOpen, setDeviceCheckOpen] = useState(false)
  const [preCallOpen, setPreCallOpen] = useState(false)
  const [videoSession, setVideoSession] = useState(null)
  const [videoError, setVideoError] = useState('')
  const [action, setAction] = useState({ pending: '', error: '' })
  const [confirmation, setConfirmation] = useState(null)
  const [localJoined, setLocalJoined] = useState(false)
  const [participantConnected, setParticipantConnected] = useState(false)
  const [clinicalVersion, setClinicalVersion] = useState(0)
  const [clinicalRevision, setClinicalRevision] = useState(0)
  const [clinicalState, setClinicalState] = useState({ key: null, consultation: null, error: '' })
  const [clinicalPending, setClinicalPending] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())
  const connectedParticipantId = useRef(null)
  const refresh = useCallback(() => setVersion(value => value + 1), [])
  const requestKey = `${appointmentId}:${version}`
  const isDoctor = currentUser.role === 'doctor'
  const t = isDoctor ? (key, values) => translateMessage('en', key, values) : languageState.t
  const locale = isDoctor ? 'en-IN' : languageState.locale

  useEffect(() => {
    const controller = new AbortController()
    const key = requestKey
    getAppointment(appointmentId, controller.signal).then(({ appointment }) => { setNowMs(Date.now()); setState({ key, appointment, error: null }) }).catch(error => {
      if (error.name !== 'AbortError') setState({ key, appointment: null, error })
    })
    return () => controller.abort()
  }, [appointmentId, requestKey])

  const loading = state.key !== requestKey
  const appointment = loading ? null : state.appointment
  const waitingForRoom = !isDoctor && appointment?.status === 'booked' && Boolean(appointment.consultationFlow.readyAt) && !appointment.consultationFlow.roomOpenedAt && !appointment.consultationFlow.consultationStartedAt

  useEffect(() => {
    if (!waitingForRoom) return undefined
    const interval = window.setInterval(refresh, 10_000)
    return () => window.clearInterval(interval)
  }, [refresh, waitingForRoom])

  useEffect(() => {
    if (!appointment || appointment.status !== 'booked') return undefined
    const now = Date.now()
    const next = [appointment.consultationFlow.checkInOpensAt, appointment.consultationFlow.doctorRoomOpensAt, appointment.consultationFlow.noShowAvailableAt, appointment.consultationFlow.startCutoffAt].map(value => new Date(value).getTime()).filter(value => value > now).sort((a, b) => a - b)[0]
    if (!next) return undefined
    const timeout = window.setTimeout(refresh, Math.min(next - now + 100, 2_147_483_647))
    return () => window.clearTimeout(timeout)
  }, [appointment, refresh])

  const consultationId = appointment?.consultationFlow.consultationId
  const shouldLoadClinical = Boolean(consultationId) && (isDoctor || (
    appointment.status === 'completed' && appointment.consultationFlow.consultationFinishedAt
  ))
  const clinicalKey = `${consultationId ?? 'none'}:${clinicalVersion}`
  useEffect(() => {
    if (!shouldLoadClinical) return undefined
    const controller = new AbortController()
    const key = clinicalKey
    getAppointmentConsultation(appointment.id, controller.signal)
      .then(({ consultation }) => setClinicalState({ key, consultation, error: '' }))
      .catch(error => {
        if (error.name !== 'AbortError') setClinicalState({ key, consultation: null, error: error.message })
      })
    return () => controller.abort()
  }, [appointment, clinicalKey, shouldLoadClinical])

  async function runAction(name, request) {
    if (action.pending) return false
    setAction({ pending: name, error: '' })
    try {
      await request(); refresh(); return true
    } catch (error) {
      setAction({ pending: '', error: error.message })
      if (error.status === 409) refresh()
      return false
    } finally {
      setAction(current => current.pending === name ? { ...current, pending: '' } : current)
    }
  }

  async function confirmCancellation(reason) {
    await cancelAppointment(appointment.id, reason); setCancellationOpen(false); refresh(); window.dispatchEvent(new Event('medreach:notifications-changed'))
  }

  async function enterRoom() {
    if (action.pending) return
    setAction({ pending: 'video', error: '' })
    try {
      const session = await getAppointmentVideoSession(appointment.id)
      setVideoSession(session); setPreCallOpen(false); setVideoError(''); setLocalJoined(false); setParticipantConnected(false); connectedParticipantId.current = null
    } catch (error) {
      setAction({ pending: '', error: error.code === 'VIDEO_CONFIGURATION_UNAVAILABLE' ? 'Video consultation is not configured on this environment.' : error.message })
      if (error.status === 409) refresh()
    } finally {
      setAction(current => current.pending === 'video' ? { ...current, pending: '' } : current)
    }
  }

  function participantJoined(event) {
    const expected = String(isDoctor ? appointment.patient.id : appointment.doctor.id)
    if (String(event.userContext?.id) === expected) { connectedParticipantId.current = event.id; setParticipantConnected(true) }
  }

  function participantLeft(event) {
    if (event.id === connectedParticipantId.current) { connectedParticipantId.current = null; setParticipantConnected(false) }
  }

  function leaveRoom() {
    setVideoSession(null); setLocalJoined(false); setParticipantConnected(false); connectedParticipantId.current = null
  }

  async function confirmAction() {
    const kind = confirmation
    setConfirmation(null)
    if (kind === 'begin') await runAction('begin', () => beginAppointmentConsultation(appointment.id))
    if (kind === 'no-show') await runAction('no-show', () => markAppointmentNoShow(appointment.id))
  }

  async function saveClinicalDraft(draft) {
    if (clinicalPending) throw new Error('A clinical action is already in progress.')
    setClinicalPending('save')
    try {
      const { consultation } = await saveAppointmentConsultation(appointment.id, draft)
      setClinicalState({ key: clinicalKey, consultation, error: '' })
      setClinicalRevision(value => value + 1)
    } catch (error) {
      if (error.status === 409) {
        refresh()
        setClinicalVersion(value => value + 1)
      }
      throw error
    } finally {
      setClinicalPending('')
    }
  }

  async function finishClinicalConsultation() {
    if (clinicalPending) throw new Error('A clinical action is already in progress.')
    setClinicalPending('finish')
    try {
      await finishAppointmentConsultation(appointment.id)
      setClinicalVersion(value => value + 1)
      refresh()
    } finally {
      setClinicalPending('')
    }
  }

  const clinicalRecord = shouldLoadClinical && clinicalState.key === clinicalKey && clinicalState.consultation
    ? isDoctor
      ? <ClinicalWorkspace consultation={clinicalState.consultation} error={clinicalState.error} key={`${clinicalKey}:${clinicalRevision}`} onFinish={finishClinicalConsultation} onSave={saveClinicalDraft} pending={clinicalPending} />
      : <PatientConsultationRecord consultation={clinicalState.consultation} doctor={appointment.doctor} />
    : null

  return <div className="appointment-detail-page min-h-screen"><PublicHeader editorial /><main className="appointment-detail-shell">
    <Link className="appointment-detail-back" to={isDoctor ? '/doctor/appointments' : '/appointments'}><span aria-hidden="true">←</span> {t('appointments.back')}</Link>
    {loading && <div aria-label={t('appointments.loadingDetails')} className="appointment-detail-loading animate-pulse"><div /><div /></div>}
    {!loading && state.error && <section className="appointment-detail-error"><h1>{t('appointments.detailError')}</h1><p>{state.error.message}</p><button onClick={refresh} type="button">{t('common.tryAgain')}</button></section>}
    {appointment && <AppointmentWorkspace action={action} appointment={appointment} clinicalWorkspace={videoSession ? null : clinicalRecord} isDoctor={isDoctor} language={isDoctor ? 'en' : languageState.language} locale={locale} nowMs={nowMs} onCancel={() => setCancellationOpen(true)} onDeviceCheck={() => setDeviceCheckOpen(true)} onJoin={() => { setAction({ pending: '', error: '' }); setPreCallOpen(true) }} onMarkNoShow={() => setConfirmation('no-show')} onMarkReady={() => runAction('ready', () => markAppointmentReady(appointment.id))} onOpenRoom={() => runAction('open-room', () => openAppointmentRoom(appointment.id))} t={t} />}
    {shouldLoadClinical && clinicalState.key !== clinicalKey && <p className="clinical-loading">{isDoctor ? 'Loading consultation record…' : t('consultation.loadingRecord')}</p>}
    {shouldLoadClinical && clinicalState.key === clinicalKey && !clinicalState.consultation && <p className="consultation-action-error" role="alert">{isDoctor ? 'We couldn’t load this consultation record. Please try again later.' : t('consultation.recordError')}</p>}
  </main><PublicFooter />
  {cancellationOpen && appointment && <CancellationDialog doctorRequired={isDoctor} onClose={() => setCancellationOpen(false)} onConfirm={confirmCancellation} />}
  {deviceCheckOpen && <DeviceCheckDialog forceEnglish={isDoctor} onClose={() => setDeviceCheckOpen(false)} />}
  {preCallOpen && appointment && <PreCallDialog appointment={appointment} error={action.error} onClose={() => setPreCallOpen(false)} onJoin={enterRoom} pending={action.pending === 'video'} />}
  {videoSession && appointment && <VideoRoom appointment={appointment} clinicalWorkspace={clinicalRecord} error={videoError} isDoctor={isDoctor} localJoined={localJoined} onBegin={() => setConfirmation('begin')} onClose={leaveRoom} onConferenceLeft={leaveRoom} onLocalJoined={() => setLocalJoined(true)} onParticipantJoined={participantJoined} onParticipantLeft={participantLeft} onVideoError={error => setVideoError(error.message)} participantConnected={participantConnected} session={videoSession} />}
  {confirmation === 'begin' && <ConfirmDialog confirmLabel="Begin consultation" heading="Begin clinical consultation?" message="This starts the MedReach consultation record for this appointment." onCancel={() => setConfirmation(null)} onConfirm={confirmAction} pending={action.pending === 'begin'} />}
  {confirmation === 'no-show' && appointment && <ConfirmDialog confirmLabel="Mark as no-show" heading="Mark patient as a no-show?" message={appointment.consultationFlow.readyAt ? `This patient marked themselves ready at ${stateTime(appointment.consultationFlow.readyAt)}. Are you sure you want to mark them as a no-show?` : 'The Patient will be notified that this appointment was marked as a no-show.'} onCancel={() => setConfirmation(null)} onConfirm={confirmAction} pending={action.pending === 'no-show'} />}
  </div>
}

function AppointmentWorkspace({ appointment, action, clinicalWorkspace, isDoctor, language, locale, nowMs, onCancel, onDeviceCheck, onJoin, onMarkNoShow, onMarkReady, onOpenRoom, t }) {
  const portrait = resolveDoctorPortrait(appointment.doctor)
  const flow = appointment.consultationFlow
  const isUpcoming = appointment.status === 'booked' && new Date(appointment.slot.startAt) > new Date()
  const canManage = flow.canCancel || (!isDoctor && flow.canReschedule)
  const initials = appointment.doctor.fullName.replace(/^Dr\.\s*/i, '').split(' ').slice(0, 2).map(part => part[0]).join('')
  return <div className="appointment-detail-workspace"><section aria-labelledby="appointment-detail-heading" className="appointment-detail-summary"><p className="appointment-detail-eyebrow">{isUpcoming ? t('appointments.upcomingConsultation') : t('appointments.pastConsultation')}</p><h1 id="appointment-detail-heading">{primaryDate(appointment.slot.startAt, locale)}</h1><p className="appointment-detail-primary-time">{formatAppointmentTime(appointment.slot.startAt, locale)} IST</p><div className="appointment-detail-doctor"><div className="appointment-detail-doctor__portrait">{portrait ? <img alt={t('doctorCard.portrait', { name: appointment.doctor.fullName })} src={portrait} /> : <span aria-hidden="true">{initials}</span>}</div><div><h2>{appointment.doctor.fullName}</h2><p>{appointment.doctor.specializations.map(item => specializationDisplayName(language, item.name)).join(' · ')}</p>{!isDoctor && <Link to={`/doctors/${appointment.doctor.id}`}>{t('appointments.viewDoctor')} <span aria-hidden="true">→</span></Link>}</div></div></section>
    <aside aria-labelledby="consultation-state-heading" className="appointment-state-panel"><p className="appointment-state-panel__eyebrow">{t('appointments.yourConsultation')}</p><h2 className="sr-only" id="consultation-state-heading">{t('appointments.stateLabel')}</h2><DisplayStatus appointment={appointment} t={t} /><div className="appointment-state-panel__schedule"><strong>{primaryDate(appointment.slot.startAt, locale)}</strong><span>{formatAppointmentTime(appointment.slot.startAt, locale)} IST</span><p>{t('booking.duration')} <span aria-hidden="true">·</span> {t('appointments.remote')}</p></div><p className="appointment-state-panel__fee">{formatFee(appointment.feeSnapshot, locale)}</p>
      <ConsultationActions action={action} appointment={appointment} isDoctor={isDoctor} locale={locale} nowMs={nowMs} onDeviceCheck={onDeviceCheck} onJoin={onJoin} onMarkNoShow={onMarkNoShow} onMarkReady={onMarkReady} onOpenRoom={onOpenRoom} t={t} />
      {canManage && <div className="appointment-state-panel__management"><p>{t('appointments.manage')}</p>{!isDoctor && flow.canReschedule && <Link className="appointment-state-panel__reschedule" to={`/doctors/${appointment.doctor.id}?${new URLSearchParams({ rescheduleFrom: String(appointment.id) })}`}>{t('appointments.reschedule')} <span aria-hidden="true">→</span></Link>}{flow.canCancel && <button className="appointment-state-panel__cancel" onClick={onCancel} type="button">{isDoctor ? 'Cancel appointment' : t('appointments.cancel')}</button>}</div>}
      {appointment.status !== 'booked' && <p className="appointment-state-panel__past-note">{t('appointments.pastNote')}</p>}</aside>
    <p className="appointment-detail-reference">{t('appointments.reference', { id: appointment.id })}</p>{clinicalWorkspace && <div className="appointment-clinical-record">{clinicalWorkspace}</div>}
    {(appointment.cancellation || appointment.rescheduledFromAppointmentId || appointment.replacementAppointmentId) && <section aria-labelledby="history-heading" className="appointment-detail-history"><p className="appointment-detail-eyebrow">{t('appointments.historyTitle')}</p><h2 id="history-heading">{t('appointments.previousActivity')}</h2>{appointment.cancellation && <div><p>{t('appointments.cancelledAt', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(appointment.cancellation.cancelledAt)) })}</p>{appointment.cancellation.reason && <p><strong>{t('appointments.reason')}</strong> {appointment.cancellation.reason}</p>}</div>}{appointment.rescheduledFromAppointmentId && <p>{t('appointments.replaces')} <Link to={`/appointments/${appointment.rescheduledFromAppointmentId}`}>{t('appointments.appointmentNumber', { id: appointment.rescheduledFromAppointmentId })}</Link>.</p>}{appointment.replacementAppointmentId && <p>{t('appointments.replacedBy')} <Link to={`/appointments/${appointment.replacementAppointmentId}`}>{t('appointments.appointmentNumber', { id: appointment.replacementAppointmentId })}</Link>.</p>}</section>}
  </div>
}

export function ConsultationActions({ appointment, action, isDoctor, nowMs, onDeviceCheck, onJoin, onMarkNoShow, onMarkReady, onOpenRoom }) {
  const flow = appointment.consultationFlow
  if (appointment.status !== 'booked') return null
  const active = Boolean(flow.consultationStartedAt && !flow.consultationFinishedAt)
  const beforeEnd = nowMs < new Date(flow.startCutoffAt).getTime()
  const canJoin = Boolean(flow.roomOpenedAt) && (active || beforeEnd)
  if (isDoctor) return <section aria-label="Doctor consultation actions" className="consultation-actions">
    {flow.readyAt && <div className="consultation-state-callout consultation-state-callout--ready"><strong>Patient Waiting</strong><span>Ready since {stateTime(flow.readyAt)}</span></div>}
    {active ? <div className="consultation-state-callout"><strong>Consultation in progress</strong><span>Your clinical workspace is ready below.</span></div> : flow.roomOpenedAt ? <div className="consultation-state-callout"><strong>Room opened</strong><span>Waiting for patient to connect.</span></div> : flow.canOpenRoom ? <button className="consultation-primary-button" disabled={Boolean(action.pending)} onClick={onOpenRoom} type="button">{action.pending === 'open-room' ? 'Opening room…' : 'Open consultation room →'}</button> : beforeEnd ? <div className="consultation-state-callout consultation-state-callout--quiet"><strong>Consultation room opens at {stateTime(flow.doctorRoomOpensAt)}</strong></div> : <div className="consultation-state-callout consultation-state-callout--quiet"><strong>The room-opening window has ended.</strong></div>}
    {canJoin && <button className="consultation-primary-button" disabled={Boolean(action.pending)} onClick={onJoin} type="button">Enter consultation room →</button>}
    {flow.canMarkNoShow && !flow.consultationId && <button className="consultation-text-button" disabled={Boolean(action.pending)} onClick={onMarkNoShow} type="button">Mark patient as no-show</button>}
    {action.error && <p className="consultation-action-error" role="alert">{action.error}</p>}
  </section>
  const beforeCheckIn = nowMs < new Date(flow.checkInOpensAt).getTime()
  return <section aria-label="Patient consultation actions" className="consultation-actions">
    {active && <div className="consultation-state-callout"><strong>Consultation in progress</strong><span>You can re-enter the room if your connection drops.</span></div>}
    {flow.readyAt && <div className="consultation-state-callout consultation-state-callout--ready"><strong>✓ You’re checked in</strong><span>Your doctor can see that you’re waiting.</span><small>Ready since {stateTime(flow.readyAt)}</small></div>}
    {!flow.roomOpenedAt && flow.readyAt && <p className="consultation-waiting-copy">Waiting for your doctor</p>}
    {!flow.readyAt && flow.canMarkReady && <button className="consultation-primary-button" disabled={Boolean(action.pending)} onClick={onMarkReady} type="button">{action.pending === 'ready' ? 'Checking in…' : 'I’m Ready →'}</button>}
    {!flow.readyAt && !flow.canMarkReady && beforeCheckIn && <div className="consultation-state-callout consultation-state-callout--quiet"><strong>Check-in opens at {stateTime(flow.checkInOpensAt)}</strong><span>You’ll be able to let your doctor know you’re ready 15 minutes before the appointment.</span></div>}
    {canJoin && <><div className="consultation-state-callout"><strong>Your doctor has opened the consultation room.</strong></div><button className="consultation-primary-button" disabled={Boolean(action.pending)} onClick={onJoin} type="button">Join consultation →</button></>}
    <button className="consultation-text-button" onClick={onDeviceCheck} type="button">Test camera &amp; microphone</button>
    {action.error && <p className="consultation-action-error" role="alert">{action.error}</p>}
  </section>
}
