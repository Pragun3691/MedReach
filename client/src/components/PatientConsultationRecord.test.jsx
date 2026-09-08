// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { PatientConsultationRecord } from './PatientConsultationRecord.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const doctor = { id: 10, fullName: 'Dr. Aditi Sharma' }
const consultation = {
  consultationId: 9000,
  startedAt: '2030-09-08T09:30:00.000Z',
  finishedAt: '2030-09-08T10:00:00.000Z',
  notes: 'First line\nSecond line',
  prescriptionItems: [
    { id: 1, medicineName: 'Medicine A', dosage: '10 mg', frequency: 'Once daily', duration: '5 days', instructions: 'After food' },
    { id: 2, medicineName: 'Medicine B', dosage: '5 ml', frequency: 'Twice daily', duration: '3 days', instructions: '' },
  ],
  followUp: { interval: 2, unit: 'weeks', targetAt: '2030-09-22T10:00:00.000Z' },
  editable: false,
}

async function renderRecord(value = consultation) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(<MemoryRouter><PatientConsultationRecord consultation={value} doctor={doctor} /></MemoryRouter>))
  return { host, root }
}

afterEach(() => document.body.replaceChildren())

describe('PatientConsultationRecord', () => {
  it('renders notes and every structured prescription item as escaped read-only text', async () => {
    const { host, root } = await renderRecord()
    expect(host.querySelector('.patient-record-notes').textContent).toBe('First line\nSecond line')
    expect([...host.querySelectorAll('.patient-prescription-item h4')].map(item => item.textContent)).toEqual(['Medicine A', 'Medicine B'])
    expect(host.textContent).toContain('10 mg')
    expect(host.textContent).toContain('After food')
    expect(host.querySelector('textarea, input, select')).toBeNull()
    expect(host.innerHTML).not.toContain('dangerouslySetInnerHTML')
    await act(async () => root.unmount())
  })

  it('shows the server target date and links to the same doctor with date preselection', async () => {
    const { host, root } = await renderRecord()
    expect(host.textContent).toContain('Follow up in 2 weeks')
    expect(host.textContent).toContain('22 September 2030')
    expect(host.querySelector('a').getAttribute('href')).toBe('/doctors/10?date=2030-09-22')
    await act(async () => root.unmount())
  })

  it('renders calm empty states without a follow-up booking action', async () => {
    const { host, root } = await renderRecord({ ...consultation, notes: '', prescriptionItems: [], followUp: null })
    expect(host.textContent).toContain('No consultation notes were added.')
    expect(host.textContent).toContain('No medicines were prescribed during this consultation.')
    expect(host.textContent).toContain('No follow-up was recommended for this consultation.')
    expect(host.querySelector('a')).toBeNull()
    await act(async () => root.unmount())
  })
})
