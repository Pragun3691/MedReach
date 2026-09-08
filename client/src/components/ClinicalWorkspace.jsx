import { useMemo, useState } from 'react'

const emptyMedicine = () => ({ medicineName: '', dosage: '', frequency: '', duration: '', instructions: '' })

function editableDraft(consultation) {
  return {
    notes: consultation.notes ?? '',
    prescriptionItems: consultation.prescriptionItems.map(item => ({
      medicineName: item.medicineName,
      dosage: item.dosage,
      frequency: item.frequency,
      duration: item.duration,
      instructions: item.instructions ?? '',
    })),
    followUp: consultation.followUp ? {
      interval: consultation.followUp.interval,
      unit: consultation.followUp.unit,
    } : null,
  }
}

function targetDate(value) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
  }).format(new Date(value))
}

export function ClinicalWorkspace({ consultation, pending, error, onSave, onFinish }) {
  const initial = useMemo(() => editableDraft(consultation), [consultation])
  const [draft, setDraft] = useState(initial)
  const [finishOpen, setFinishOpen] = useState(false)
  const [localError, setLocalError] = useState('')
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const editable = consultation.editable

  function updateMedicine(index, field, value) {
    setDraft(current => ({
      ...current,
      prescriptionItems: current.prescriptionItems.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }))
  }

  async function save() {
    setLocalError('')
    try {
      await onSave(draft)
      return true
    } catch (saveError) {
      setLocalError(saveError.message)
      return false
    }
  }

  async function finish() {
    setLocalError('')
    if (dirty && !await save()) return
    try {
      await onFinish()
      setFinishOpen(false)
    } catch (finishError) {
      setLocalError(finishError.message)
    }
  }

  return <section aria-labelledby="clinical-workspace-heading" className="clinical-workspace">
    <header className="clinical-workspace__header"><div><p>Clinical workspace</p><h2 id="clinical-workspace-heading">Consultation record</h2></div>{!editable && <span>Read-only</span>}</header>

    <div className="clinical-workspace__body">
      <section className="clinical-section"><p className="clinical-section__eyebrow">Consultation notes</p><label htmlFor="consultation-notes">Consultation notes</label>
        <textarea disabled={!editable} id="consultation-notes" maxLength={20000} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} placeholder="Document symptoms discussed, observations and care guidance." rows={8} value={draft.notes} />
      </section>

      <section className="clinical-section"><div className="clinical-section__heading"><div><p className="clinical-section__eyebrow">Prescription</p><h3>Medicines</h3></div>{editable && <button onClick={() => setDraft(current => ({ ...current, prescriptionItems: [...current.prescriptionItems, emptyMedicine()] }))} type="button">+ Add medicine</button>}</div>
        {draft.prescriptionItems.length === 0 && <p className="clinical-empty">No medicines added.</p>}
        <div className="prescription-list">{draft.prescriptionItems.map((item, index) => <fieldset className="prescription-item" key={index}><legend>Medicine {index + 1}</legend>
          {['medicineName', 'dosage', 'frequency', 'duration', 'instructions'].map(field => <label key={field}>{field === 'medicineName' ? 'Medicine' : field[0].toUpperCase() + field.slice(1)}<input disabled={!editable} maxLength={field === 'instructions' ? 1000 : field === 'medicineName' ? 200 : 120} onChange={event => updateMedicine(index, field, event.target.value)} required={field !== 'instructions'} value={item[field]} /></label>)}
          {editable && <button className="prescription-item__remove" onClick={() => setDraft(current => ({ ...current, prescriptionItems: current.prescriptionItems.filter((_, itemIndex) => itemIndex !== index) }))} type="button">Remove</button>}
        </fieldset>)}</div>
      </section>

      <section className="clinical-section"><p className="clinical-section__eyebrow">Follow-up</p><label className="follow-up-toggle"><input checked={Boolean(draft.followUp)} disabled={!editable} onChange={event => setDraft(current => ({ ...current, followUp: event.target.checked ? { interval: 1, unit: 'weeks' } : null }))} type="checkbox" /> Recommend follow-up</label>
        {draft.followUp && <div className="follow-up-fields"><span>Follow up in</span><input aria-label="Follow-up interval" disabled={!editable} max="365" min="1" onChange={event => setDraft(current => ({ ...current, followUp: { ...current.followUp, interval: Number(event.target.value) } }))} type="number" value={draft.followUp.interval} /><select aria-label="Follow-up unit" disabled={!editable} onChange={event => setDraft(current => ({ ...current, followUp: { ...current.followUp, unit: event.target.value } }))} value={draft.followUp.unit}><option value="days">days</option><option value="weeks">weeks</option></select></div>}
        {consultation.followUp?.targetAt && <p className="follow-up-target">Target date: {targetDate(consultation.followUp.targetAt)}</p>}
      </section>
    </div>

    {editable && <footer className="clinical-workspace__actions"><span aria-live="polite">{dirty ? 'Unsaved changes' : 'Saved'}</span><div><button className="consultation-secondary-button" disabled={pending || !dirty} onClick={save} type="button">{pending === 'save' ? 'Saving…' : 'Save changes'}</button><button className="consultation-primary-button" disabled={Boolean(pending)} onClick={() => setFinishOpen(true)} type="button">Finish consultation</button></div></footer>}
    {(localError || error) && <p className="consultation-action-error" role="alert">{localError || error}</p>}

    {finishOpen && <div className="consultation-dialog-backdrop" role="presentation"><section aria-labelledby="finish-heading" aria-modal="true" className="consultation-dialog" role="dialog"><p className="consultation-dialog__eyebrow">Complete appointment</p><h2 id="finish-heading">Finish consultation?</h2><p className="consultation-dialog__intro">Finishing will complete this appointment and lock the consultation notes, prescription and follow-up details from further editing.</p><div className="consultation-dialog__actions"><button className="consultation-secondary-button" disabled={Boolean(pending)} onClick={() => setFinishOpen(false)} type="button">Cancel</button><button className="consultation-primary-button" disabled={Boolean(pending)} onClick={finish} type="button">{pending ? 'Please wait…' : 'Finish consultation'}</button></div></section></div>}
  </section>
}
