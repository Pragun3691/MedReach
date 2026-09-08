// @vitest-environment jsdom

import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClinicalWorkspace } from './ClinicalWorkspace.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const activeConsultation = {
  consultationId: 9000,
  startedAt: '2030-01-01T09:56:00.000Z',
  finishedAt: null,
  notes: '',
  prescriptionItems: [],
  followUp: null,
  editable: true,
}

function Harness({ initial = activeConsultation, save = vi.fn(), finish = vi.fn() }) {
  const [consultation, setConsultation] = useState(initial)
  async function onSave(draft) {
    await save(draft)
    setConsultation(current => ({
      ...current,
      ...draft,
      prescriptionItems: draft.prescriptionItems.map((item, index) => ({ id: index + 1, ...item })),
      followUp: draft.followUp ? { ...draft.followUp, targetAt: null } : null,
    }))
  }
  return <ClinicalWorkspace consultation={consultation} onFinish={finish} onSave={onSave} pending="" />
}

async function renderWorkspace(props = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => { root.render(<Harness {...props} />) })
  return { host, root }
}

function button(host, text) {
  return [...host.querySelectorAll('button')].find(item => item.textContent.includes(text))
}

async function click(element) {
  await act(async () => { element.click(); await Promise.resolve(); await Promise.resolve() })
}

async function input(element, value) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value').set
    setter.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

afterEach(() => document.body.replaceChildren())

describe('ClinicalWorkspace', () => {
  it('renders active notes, dirty state, structured add/remove, and optional follow-up controls', async () => {
    const { host, root } = await renderWorkspace()
    expect(host.textContent).toContain('No medicines added.')
    await input(host.querySelector('#consultation-notes'), 'Updated note')
    expect(host.textContent).toContain('Unsaved changes')
    await click(button(host, 'Add medicine'))
    expect(host.querySelectorAll('.prescription-item')).toHaveLength(1)
    expect([...host.querySelectorAll('.prescription-item label')].map(item => item.textContent)).toEqual(['Medicine', 'Dosage', 'Frequency', 'Duration', 'Instructions'])
    await click(button(host, 'Remove'))
    expect(host.querySelectorAll('.prescription-item')).toHaveLength(0)
    await click(host.querySelector('.follow-up-toggle input'))
    expect(host.querySelector('[aria-label="Follow-up interval"]')).not.toBeNull()
    await click(host.querySelector('.follow-up-toggle input'))
    expect(host.querySelector('[aria-label="Follow-up interval"]')).toBeNull()
    await act(async () => root.unmount())
  })

  it('saves the complete draft explicitly and returns to Saved', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { host, root } = await renderWorkspace({ save })
    await input(host.querySelector('#consultation-notes'), 'Care guidance')
    await click(button(host, 'Save changes'))
    expect(save).toHaveBeenCalledWith({ notes: 'Care guidance', prescriptionItems: [], followUp: null })
    expect(host.textContent).toContain('Saved')
    await act(async () => root.unmount())
  })

  it('preserves entered form values when Save fails', async () => {
    const save = vi.fn().mockRejectedValue(new Error('Draft could not be saved'))
    const { host, root } = await renderWorkspace({ save })
    await input(host.querySelector('#consultation-notes'), 'Keep this note')
    await click(button(host, 'Save changes'))
    expect(host.querySelector('#consultation-notes').value).toBe('Keep this note')
    expect(host.textContent).toContain('Draft could not be saved')
    expect(host.textContent).toContain('Unsaved changes')
    await act(async () => root.unmount())
  })

  it('shows confirmation and saves dirty data before Finish', async () => {
    const calls = []
    const save = vi.fn(async () => { calls.push('save') })
    const finish = vi.fn(async () => { calls.push('finish') })
    const { host, root } = await renderWorkspace({ save, finish })
    await input(host.querySelector('#consultation-notes'), 'Final note')
    await click(button(host, 'Finish consultation'))
    expect(host.textContent).toContain('Finishing will complete this appointment and lock the consultation notes')
    expect(finish).not.toHaveBeenCalled()
    await click([...host.querySelectorAll('button')].filter(item => item.textContent === 'Finish consultation').at(-1))
    expect(calls).toEqual(['save', 'finish'])
    await act(async () => root.unmount())
  })

  it('blocks Finish when the dirty draft cannot be saved', async () => {
    const save = vi.fn().mockRejectedValue(new Error('Save failed'))
    const finish = vi.fn()
    const { host, root } = await renderWorkspace({ save, finish })
    await input(host.querySelector('#consultation-notes'), 'Unsaved note')
    await click(button(host, 'Finish consultation'))
    await click([...host.querySelectorAll('button')].filter(item => item.textContent === 'Finish consultation').at(-1))
    expect(finish).not.toHaveBeenCalled()
    expect(host.querySelector('#consultation-notes').value).toBe('Unsaved note')
    expect(host.textContent).toContain('Save failed')
    await act(async () => root.unmount())
  })

  it('renders a finished record and target date read-only without Save or Finish', async () => {
    const finished = {
      ...activeConsultation,
      editable: false,
      finishedAt: '2030-01-01T10:30:00.000Z',
      notes: 'Finished note',
      prescriptionItems: [{ id: 1, medicineName: 'Medicine A', dosage: '10 mg', frequency: 'Daily', duration: '5 days', instructions: '' }],
      followUp: { interval: 2, unit: 'weeks', targetAt: '2030-01-15T10:30:00.000Z' },
    }
    const { host, root } = await renderWorkspace({ initial: finished })
    expect(host.textContent).toContain('Read-only')
    expect(host.textContent).toContain('15 January 2030')
    expect(host.querySelectorAll('input:disabled, textarea:disabled, select:disabled').length).toBeGreaterThan(0)
    expect(button(host, 'Save changes')).toBeUndefined()
    expect(button(host, 'Finish consultation')).toBeUndefined()
    await act(async () => root.unmount())
  })
})
