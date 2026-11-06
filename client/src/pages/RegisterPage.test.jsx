// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../context/LanguageProvider.jsx'
import { RegisterPage } from './RegisterPage.jsx'

const api = vi.hoisted(() => ({
  listSpecializations: vi.fn(), registerPatientAccount: vi.fn(), registerDoctorAccount: vi.fn(),
}))
vi.mock('../lib/api.js', () => api)
vi.mock('../components/PublicHeader.jsx', () => ({ PublicHeader: () => null }))
vi.mock('../components/PublicFooter.jsx', () => ({ PublicFooter: () => null }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const password = 'secure-password-123'
const account = { fullName: 'Priya Sharma', email: 'priya@example.com', password, confirmPassword: password }
const credentials = { registrationNumber: 'TEST-REG-2026', issuingAuthority: 'Test Medical Council' }
const roots = []
let frames

function LoginDestination() {
  return <p>{useLocation().search}</p>
}

async function renderPage(role = 'patient', query = '') {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  await act(async () => root.render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[`/register?role=${role}${query}`]}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginDestination />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  ))
  return host
}

const field = name => document.getElementById(`register-${name}`)
const error = name => document.getElementById(`register-${name}-error`)

async function input(name, value) {
  await act(async () => {
    const target = field(name)
    Object.getOwnPropertyDescriptor(target.constructor.prototype, 'value').set.call(target, value)
    target.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function fill(values) {
  if (values.qualification !== undefined) values = { ...credentials, ...values }
  for (const [name, value] of Object.entries(values)) await input(name, value)
}

async function blur(name) {
  await act(async () => field(name).dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
}

async function click(target) {
  await act(async () => target.click())
}

async function submit(host) {
  await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  await flushFrames()
}

async function flushFrames() {
  await act(async () => {
    for (const callback of frames.splice(0)) callback()
  })
}

async function profile(host) {
  await fill({ ...account, qualification: 'MBBS, MD', experienceYears: '8' })
  await submit(host)
}

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
  frames = []
  vi.stubGlobal('requestAnimationFrame', callback => { frames.push(callback); return frames.length })
  api.listSpecializations.mockResolvedValue({ items: [{ id: 1, name: 'Cardiology' }, { id: 2, name: 'General medicine' }] })
  api.registerPatientAccount.mockResolvedValue({})
  api.registerDoctorAccount.mockResolvedValue({})
})

afterEach(async () => {
  await act(async () => { for (const root of roots.splice(0)) root.unmount() })
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

describe('Registration validation', () => {
  it('requires medical credentials before continuing Doctor onboarding and rechecks corrections', async () => {
    const host = await renderPage('doctor')
    await fill({ ...account, qualification: 'MBBS', experienceYears: '5' })
    await input('registrationNumber', '')
    await input('issuingAuthority', '')
    await submit(host)
    expect(document.activeElement).toBe(field('registrationNumber'))
    expect(error('registrationNumber')).not.toBeNull()
    expect(error('issuingAuthority')).not.toBeNull()
    await input('registrationNumber', 'x'.repeat(101))
    expect(error('registrationNumber')).not.toBeNull()
    await input('registrationNumber', credentials.registrationNumber)
    await input('issuingAuthority', credentials.issuingAuthority)
    await submit(host)
    expect(field('specializationIds')).not.toBeNull()
    expect(api.registerDoctorAccount).not.toHaveBeenCalled()
  })

  it.each(['patient', 'doctor'])('starts the %s form without errors and labels every input', async role => {
    const host = await renderPage(role)
    expect(host.querySelector('[aria-invalid="true"]')).toBeNull()
    expect(host.querySelector('.form-field-error')).toBeNull()
    expect(host.querySelector('[role="alert"]')).toBeNull()
    for (const control of host.querySelectorAll('input')) {
      expect(control.labels.length).toBe(1)
      expect(control.tabIndex).toBe(0)
    }
    expect(field('password').getAttribute('aria-describedby')).toBe('register-password-hint')
  })

  it.each(['patient', 'doctor'])('validates only visited fields on blur and revalidates corrections for %s', async role => {
    await renderPage(role)
    await input('email', 'invalid')
    expect(error('email')).toBeNull()
    await blur('email')
    expect(error('email').textContent).toContain('valid email')
    expect(error('email').parentElement.getAttribute('aria-live')).toBe('polite')
    expect(field('email').getAttribute('aria-invalid')).toBe('true')
    expect(field('email').getAttribute('aria-describedby')).toBe(error('email').id)
    expect(error('fullName')).toBeNull()
    await input('email', 'still-invalid')
    expect(error('email')).not.toBeNull()
    await input('email', account.email)
    expect(error('email')).toBeNull()
    expect(field('email').getAttribute('aria-invalid')).toBe('false')
    await input('email', '')
    expect(error('email')).not.toBeNull()
  })

  it.each(['patient', 'doctor'])('shows one error per relevant field and focuses the first on empty %s submission', async role => {
    const host = await renderPage(role)
    await submit(host)
    expect(host.querySelectorAll('.form-field-error')).toHaveLength(role === 'doctor' ? 8 : 4)
    expect(host.textContent).not.toContain('Please fix the following')
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(document.activeElement).toBe(field('fullName'))
    expect(error('specializationIds')).toBeNull()
    expect(api.registerPatientAccount).not.toHaveBeenCalled()
    expect(api.registerDoctorAccount).not.toHaveBeenCalled()
    if (role === 'doctor') expect(host.querySelector('[aria-current="step"]').textContent).toContain('Account & credentials')
  })

  it('rechecks a visited confirmation when the password changes and preserves visibility controls', async () => {
    const host = await renderPage()
    await input('password', password)
    await input('confirmPassword', password)
    await blur('confirmPassword')
    await input('password', 'another-secure-password')
    expect(error('confirmPassword').textContent).toContain('match')
    await input('confirmPassword', 'another-secure-password')
    expect(error('confirmPassword')).toBeNull()
    const toggle = host.querySelector('button[aria-label="Show password"]')
    expect(toggle.type).toBe('button')
    await click(toggle)
    expect(field('password').type).toBe('text')
    expect(toggle.getAttribute('aria-label')).toBe('Hide password')
    await click(toggle)
    expect(field('password').type).toBe('password')
    await blur('password')
    await input('password', 'short')
    expect(error('password').textContent).toContain('12')
    await input('password', 'x'.repeat(129))
    expect(error('password').textContent).toContain('128')
  })

  it('blocks invalid doctor credentials until all Step 1 fields are corrected', async () => {
    const host = await renderPage('doctor')
    await fill({ ...account, qualification: 'M', experienceYears: '1.5' })
    await submit(host)
    expect(document.activeElement).toBe(field('qualification'))
    expect(error('experienceYears').textContent).toContain('0 to 80')
    await input('qualification', 'MBBS')
    await input('experienceYears', '81')
    expect(error('experienceYears')).not.toBeNull()
    await input('experienceYears', '0')
    await submit(host)
    expect(document.activeElement.id).toBe('register-form-heading')
    expect(host.querySelector('[aria-current="step"]').textContent).toContain('Professional profile')
    expect(error('specializationIds')).toBeNull()
  })

  it('preserves both steps and multiple specialization selections when navigating back and forward', async () => {
    const host = await renderPage('doctor')
    await profile(host)
    await fill({ bio: 'Patient-centred care', clinicName: 'Care Clinic', defaultFee: '700', clinicCity: 'Delhi', clinicDistrict: 'Central' })
    const checks = host.querySelectorAll('input[type="checkbox"]')
    await click(checks[0])
    await click(checks[1])
    expect([...checks].every(control => control.checked)).toBe(true)
    await click(host.querySelector('.doctor-back'))
    await flushFrames()
    expect(document.activeElement.id).toBe('register-form-heading')
    for (const [name, value] of Object.entries({ ...account, qualification: 'MBBS, MD', experienceYears: '8' })) {
      expect(field(name).value).toBe(value)
    }
    await submit(host)
    expect(field('bio').value).toBe('Patient-centred care')
    expect(field('defaultFee').value).toBe('700')
    expect([...host.querySelectorAll('input[type="checkbox"]')].every(control => control.checked)).toBe(true)
    await submit(host)
    expect(api.registerDoctorAccount).toHaveBeenCalledExactlyOnceWith({
      fullName: account.fullName, email: account.email, password,
      qualification: 'MBBS, MD', experienceYears: 8, specializationIds: [1, 2],
      ...credentials,
      bio: 'Patient-centred care', clinicName: 'Care Clinic', clinicCity: 'Delhi', clinicDistrict: 'Central', defaultFee: 700,
    })
    expect(host.textContent).toBe('?registered=doctor')
  })

  it('validates Step 2 fields, associates group errors and focuses the first invalid control in display order', async () => {
    const host = await renderPage('doctor')
    await profile(host)
    await input('defaultFee', '-1')
    await blur('defaultFee')
    expect(error('defaultFee').textContent).toContain('100,000')
    await input('defaultFee', '100001')
    expect(error('defaultFee')).not.toBeNull()
    await submit(host)
    expect(document.activeElement).toBe(field('defaultFee'))
    await input('defaultFee', '')
    await submit(host)
    const checks = host.querySelectorAll('input[type="checkbox"]')
    expect(document.activeElement).toBe(checks[0])
    expect(checks[0].getAttribute('aria-describedby')).toBe('register-specializationIds-error')
    expect(host.querySelectorAll('#register-specializationIds-error')).toHaveLength(1)
    await click(checks[0])
    expect(error('specializationIds')).toBeNull()
    await click(checks[0])
    expect(error('specializationIds')).not.toBeNull()
    await click(checks[1])
    await submit(host)
    expect(api.registerDoctorAccount.mock.calls[0][0].defaultFee).toBeUndefined()
  })

  it('validates specializations when keyboard focus leaves the group, without interrupting movement inside it', async () => {
    const host = await renderPage('doctor')
    await profile(host)
    const checks = host.querySelectorAll('input[type="checkbox"]')
    await act(async () => checks[0].dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: checks[1] })))
    expect(error('specializationIds')).toBeNull()
    await act(async () => checks[1].dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: host.querySelector('.doctor-back') })))
    expect(error('specializationIds')).not.toBeNull()
    expect(checks[0].labels[0].textContent).toContain('Cardiology')
    expect(checks[0].tabIndex).toBe(0)
  })

  it.each(['patient', 'doctor'])('prevents duplicate %s requests and preserves the return destination', async role => {
    let resolve
    const register = role === 'doctor' ? api.registerDoctorAccount : api.registerPatientAccount
    register.mockImplementation(() => new Promise(done => { resolve = done }))
    const host = await renderPage(role, '&returnTo=%2Fdoctors%2F7%3Fslot%3D12')
    if (role === 'doctor') {
      await profile(host)
      await click(host.querySelector('input[type="checkbox"]'))
    } else {
      await fill(account)
    }
    const form = host.querySelector('form')
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    const payload = { fullName: account.fullName, email: account.email, password }
    expect(register).toHaveBeenCalledTimes(1)
    expect(register.mock.calls[0][0]).toEqual(role === 'patient' ? payload : {
      ...payload, qualification: 'MBBS, MD', experienceYears: 8, specializationIds: [1],
      ...credentials,
      bio: undefined, clinicName: undefined, clinicCity: undefined, clinicDistrict: undefined, defaultFee: undefined,
    })
    expect(form.getAttribute('aria-busy')).toBe('true')
    expect([...form.querySelectorAll('input, textarea, button')].every(control => control.disabled)).toBe(true)
    await act(async () => resolve({}))
    expect(host.textContent).toBe(`?registered=${role}&returnTo=%2Fdoctors%2F7%3Fslot%3D12`)
  })

  it('keeps validation and API feedback with its account type when switching registration roles', async () => {
    api.registerPatientAccount.mockRejectedValueOnce(new Error('Internal details must stay private'))
    const host = await renderPage()
    await fill(account)
    await submit(host)
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(host.textContent).not.toContain('Internal details')
    await click(host.querySelector('.auth-doctor-route a'))
    expect(host.querySelector('[aria-invalid="true"]')).toBeNull()
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(field('email').value).toBe('')
    await click(host.querySelector('.doctor-patient-route a'))
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    await input('email', 'invalid')
    await blur('email')
    await click(host.querySelector('.auth-doctor-route a'))
    expect(host.querySelector('[aria-invalid="true"]')).toBeNull()
    await click(host.querySelector('.doctor-patient-route a'))
    expect(field('email').value).toBe('invalid')
    expect(error('email')).not.toBeNull()
  })

  it('preserves generic API failure feedback and allows retry without losing inputs', async () => {
    api.registerPatientAccount.mockRejectedValueOnce(new Error('Offline'))
    const host = await renderPage()
    await fill(account)
    await submit(host)
    expect(host.querySelector('[role="alert"]').textContent).toContain('try again')
    expect(field('email').value).toBe(account.email)
    expect(host.querySelector('button[type="submit"]').disabled).toBe(false)
    await submit(host)
    expect(api.registerPatientAccount).toHaveBeenCalledTimes(2)
    expect(host.textContent).toBe('?registered=patient')
  })

  it('returns a duplicate doctor email to Step 1, focuses it and keeps API feedback until edited', async () => {
    api.registerDoctorAccount.mockRejectedValue({ code: 'EMAIL_IN_USE' })
    const host = await renderPage('doctor')
    await profile(host)
    await click(host.querySelector('input[type="checkbox"]'))
    await submit(host)
    expect(document.activeElement).toBe(field('email'))
    expect(error('email').textContent).toContain('already exists')
    await blur('email')
    expect(error('email').textContent).toContain('already exists')
    await input('email', 'new@example.com')
    expect(error('email')).toBeNull()
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(field('qualification').value).toBe('MBBS, MD')
  })

  it('presents server field validation in the correct step with accessible textarea feedback', async () => {
    api.registerDoctorAccount.mockRejectedValue({ code: 'VALIDATION_ERROR', details: [{ field: 'bio', message: 'Please shorten your bio.' }] })
    const host = await renderPage('doctor')
    await profile(host)
    await click(host.querySelector('input[type="checkbox"]'))
    await submit(host)
    expect(document.activeElement).toBe(field('bio'))
    expect(field('bio').getAttribute('aria-invalid')).toBe('true')
    expect(field('bio').getAttribute('aria-describedby')).toBe('register-bio-error')
    expect(error('bio').textContent).toContain('shorten your bio')
  })

  it('focuses an invalid specialization returned by the API and retains selections', async () => {
    api.registerDoctorAccount.mockRejectedValue({ code: 'INVALID_SPECIALIZATION' })
    const host = await renderPage('doctor')
    await profile(host)
    const check = host.querySelector('input[type="checkbox"]')
    await click(check)
    await submit(host)
    expect(document.activeElement).toBe(check)
    expect(check.checked).toBe(true)
    expect(error('specializationIds').textContent).toContain('no longer available')
    expect(host.querySelector('[role="alert"]').textContent).toContain('review your specialization')
  })
})
