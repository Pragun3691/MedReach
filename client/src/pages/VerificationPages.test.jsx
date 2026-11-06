// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../context/LanguageProvider.jsx'
import { DoctorVerificationPage } from './DoctorVerificationPage.jsx'
import { AdminDoctorVerificationsPage } from './AdminDoctorVerificationsPage.jsx'
import App from '../App.jsx'

const api = vi.hoisted(() => ({
  getMyVerification: vi.fn(), submitMyVerification: vi.fn(), listDoctorVerifications: vi.fn(),
  getDoctorVerification: vi.fn(), reviewDoctorVerification: vi.fn(),
}))
const auth = vi.hoisted(() => ({ value: null }))
vi.mock('../lib/api.js', () => api)
vi.mock('../hooks/useAuth.js', () => ({ useAuth: () => auth.value }))
vi.mock('../components/PublicHeader.jsx', () => ({ PublicHeader: () => null }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const roots = []
const record = {
  id: '7', doctorId: '9', fullName: 'Dr. Test Doctor', qualification: 'MBBS, MD', experienceYears: 7,
  registrationNumber: 'TEST-123', issuingAuthority: 'Test Council', version: 1, status: 'pending',
  isEnabled: true, specializations: [{ id: 1, name: 'Cardiology' }], submittedAt: '2026-10-16T10:00:00Z',
}

async function render(element, path = '/') {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  await act(async () => root.render(<LanguageProvider><MemoryRouter initialEntries={[path]}>{element}</MemoryRouter></LanguageProvider>))
  return host
}
const button = (host, text) => [...host.querySelectorAll('button')].find(value => value.textContent === text)
async function click(target) { await act(async () => target.click()) }
async function input(target, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(target.constructor.prototype, 'value').set.call(target, value)
    target.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function submit(form) {
  await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
}
beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  auth.value = { status: 'authenticated', currentUser: { id: 1, role: 'admin', fullName: 'Admin' } }
  api.getMyVerification.mockResolvedValue({ verification: { ...record, status: 'missing_credentials', registrationNumber: null, issuingAuthority: null } })
  api.submitMyVerification.mockResolvedValue({ verification: { id: '7', status: 'pending', version: 2 } })
  api.listDoctorVerifications.mockResolvedValue({ items: [record], hasMore: false })
  api.getDoctorVerification.mockResolvedValue({ verification: record })
  api.reviewDoctorVerification.mockResolvedValue({ verification: { ...record, status: 'approved', version: 2 } })
})
afterEach(async () => {
  await act(async () => { for (const root of roots.splice(0)) root.unmount() })
  document.body.replaceChildren()
})

describe('Doctor verification status and resubmission', () => {
  it.each(['pending', 'approved', 'rejected', 'missing_credentials'])('shows %s with the appropriate actions', async status => {
    api.getMyVerification.mockResolvedValue({ verification: { ...record, status, rejectionReason: 'Council needs correction.' } })
    const host = await render(<DoctorVerificationPage />)
    expect(Boolean(host.querySelector('form'))).toBe(['rejected', 'missing_credentials'].includes(status))
    expect(Boolean(host.querySelector('a[href="/doctor/availability"]'))).toBe(status === 'approved')
    if (status === 'rejected') expect(host.textContent).toContain('Council needs correction.')
    if (status !== 'approved') expect(host.textContent).toContain('excluded from public discovery')
  })

  it('validates missing credentials and submits only the owned request version', async () => {
    const host = await render(<DoctorVerificationPage />)
    await submit(host.querySelector('form'))
    expect(api.submitMyVerification).not.toHaveBeenCalled()
    expect(document.activeElement.id).toBe('verification-registrationNumber')
    await input(host.querySelector('#verification-registrationNumber'), ' REG-999 ')
    await input(host.querySelector('#verification-issuingAuthority'), ' Medical Council ')
    await submit(host.querySelector('form'))
    expect(api.submitMyVerification).toHaveBeenCalledExactlyOnceWith({ registrationNumber: 'REG-999', issuingAuthority: 'Medical Council', version: 1 })
    expect(host.querySelector('form')).toBeNull()
    expect(host.textContent).toContain('Credentials submitted for manual review')
  })

  it('renders rejection text safely and resubmits corrected credentials', async () => {
    api.getMyVerification.mockResolvedValue({ verification: { ...record, version: 2, status: 'rejected', rejectionReason: '<img src=x onerror=alert(1)>' } })
    const host = await render(<DoctorVerificationPage />)
    expect(host.querySelector('img')).toBeNull()
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>')
    await input(host.querySelector('#verification-registrationNumber'), 'CORRECTED')
    await submit(host.querySelector('form'))
    expect(api.submitMyVerification).toHaveBeenCalledWith({ registrationNumber: 'CORRECTED', issuingAuthority: 'Test Council', version: 2 })
  })

  it('shows loading, recoverable load errors and stale submission errors', async () => {
    api.getMyVerification.mockRejectedValueOnce(new Error('offline'))
    const host = await render(<DoctorVerificationPage />)
    expect(host.querySelector('[role="alert"]').textContent).toContain('could not be loaded')
    await click(button(host, 'Reload status'))
    await input(host.querySelector('#verification-registrationNumber'), 'REG-222')
    await input(host.querySelector('#verification-issuingAuthority'), 'Test Council')
    api.submitMyVerification.mockRejectedValueOnce({ code: 'VERIFICATION_CONFLICT' })
    await submit(host.querySelector('form'))
    expect(host.querySelector('[role="alert"]').textContent).toContain('Reload the status')
  })
})

describe('Admin doctor verification dashboard', () => {
  it('loads the Pending queue, credential details and all status filters', async () => {
    const host = await render(<AdminDoctorVerificationsPage />)
    expect(api.listDoctorVerifications).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', offset: 0 }))
    expect(host.textContent).toContain('Cardiology')
    await click(button(host, 'Review Dr. Test Doctor'))
    expect(api.getDoctorVerification).toHaveBeenCalledWith('7', expect.any(AbortSignal))
    expect(host.textContent).toContain('self-reported text')
    for (const [label, status] of [['Approved', 'approved'], ['Rejected', 'rejected'], ['Missing credentials', 'missing_credentials']]) {
      await click(button(host, label))
      expect(api.listDoctorVerifications).toHaveBeenLastCalledWith(expect.objectContaining({ status }))
      expect(host.querySelector('.verification-review')).toBeNull()
    }
  })

  it('requires explicit confirmation for approval and prevents duplicate submissions', async () => {
    const host = await render(<AdminDoctorVerificationsPage />)
    await click(button(host, 'Review Dr. Test Doctor'))
    await click(button(host, 'Approve'))
    expect(api.reviewDoctorVerification).not.toHaveBeenCalled()
    expect(document.activeElement.textContent).toBe('Confirm manual approval')
    let resolve
    api.reviewDoctorVerification.mockImplementation(() => new Promise(done => { resolve = done }))
    const form = host.querySelector('form')
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(api.reviewDoctorVerification).toHaveBeenCalledExactlyOnceWith('7', 'approve', { version: 1 })
    expect(button(host, 'Saving…').disabled).toBe(true)
    await act(async () => resolve({}))
    expect(host.textContent).toContain('Request approved for Dr. Test Doctor.')
    expect(host.querySelector('.verification-review')).toBeNull()
  })

  it('requires a reason before rejection and confirms with the displayed request version', async () => {
    const host = await render(<AdminDoctorVerificationsPage />)
    await click(button(host, 'Review Dr. Test Doctor'))
    await click(button(host, 'Reject'))
    expect(button(host, 'Confirm rejection').disabled).toBe(true)
    await submit(host.querySelector('form'))
    expect(api.reviewDoctorVerification).not.toHaveBeenCalled()
    expect(document.activeElement.id).toBe('rejection-reason')
    await input(host.querySelector('textarea'), ' Please correct the council. ')
    await submit(host.querySelector('form'))
    expect(api.reviewDoctorVerification).toHaveBeenCalledExactlyOnceWith('7', 'reject', { version: 1, reason: 'Please correct the council.' })
  })

  it.each([
    { status: 'missing_credentials', registrationNumber: null, issuingAuthority: null },
    { status: 'approved' }, { status: 'rejected' }, { isEnabled: false },
    { registrationNumber: ' ' },
  ])('withholds review actions for an ineligible request: %j', async override => {
    api.getDoctorVerification.mockResolvedValue({ verification: { ...record, ...override } })
    const host = await render(<AdminDoctorVerificationsPage />)
    await click(button(host, 'Review Dr. Test Doctor'))
    expect(button(host, 'Approve')).toBeUndefined()
    expect(button(host, 'Reject')).toBeUndefined()
  })

  it('recovers from conflicts by requiring fresh details', async () => {
    api.reviewDoctorVerification.mockRejectedValueOnce({ status: 409 })
    const host = await render(<AdminDoctorVerificationsPage />)
    await click(button(host, 'Review Dr. Test Doctor'))
    await click(button(host, 'Approve'))
    await submit(host.querySelector('form'))
    expect(host.textContent).toContain('Reload its latest details')
    expect(button(host, 'Approve')).toBeUndefined()
    api.getDoctorVerification.mockResolvedValueOnce({ verification: { ...record, status: 'approved', version: 2 } })
    await click(button(host, 'Reload details'))
    expect(host.textContent).toContain('This review is complete')
  })

  it('shows loading, empty and retry states without stale rows', async () => {
    let resolve
    api.listDoctorVerifications.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const host = await render(<AdminDoctorVerificationsPage />)
    expect(host.textContent).toContain('Loading verification requests')
    await act(async () => resolve({ items: [], hasMore: false }))
    expect(host.textContent).toContain('No pending review requests')
    api.listDoctorVerifications.mockRejectedValueOnce(new Error('offline'))
    await click(button(host, 'Approved'))
    expect(host.querySelector('[role="alert"]').textContent).toContain('could not be loaded')
    await click(button(host, 'Try again'))
    expect(host.textContent).toContain('Dr. Test Doctor')
  })
})

describe('verification route protection', () => {
  it.each(['patient', 'doctor'])('blocks %s from the Admin page before API access', async role => {
    auth.value.currentUser.role = role
    const host = await render(<App />, '/admin/doctor-verifications')
    expect(api.listDoctorVerifications).not.toHaveBeenCalled()
    expect(host.querySelector('.verification-shell')).toBeNull()
  })
  it.each(['patient', 'admin'])('blocks %s from the Doctor page before API access', async role => {
    auth.value.currentUser.role = role
    await render(<App />, '/doctor/verification')
    expect(api.getMyVerification).not.toHaveBeenCalled()
  })
  it('allows the Admin route for an authenticated Admin', async () => {
    await render(<App />, '/admin/doctor-verifications')
    expect(api.listDoctorVerifications).toHaveBeenCalled()
  })
})
