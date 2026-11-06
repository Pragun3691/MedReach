import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'

const html = '<!doctype html><html><body>MedReach fixture</body></html>'
let fixtureDirectory
let frontendDirectory
let app
let doctors

beforeAll(async () => {
  fixtureDirectory = await mkdtemp(join(tmpdir(), 'medreach-frontend-'))
  frontendDirectory = join(fixtureDirectory, 'dist')
  await mkdir(join(frontendDirectory, 'assets'), { recursive: true })
  await mkdir(join(frontendDirectory, 'api'), { recursive: true })
  await Promise.all([
    writeFile(join(frontendDirectory, 'index.html'), html),
    writeFile(join(frontendDirectory, 'assets', 'app.js'), 'console.log("fixture")'),
    writeFile(join(frontendDirectory, 'assets', 'app.css'), 'body { color: blue; }'),
    writeFile(join(frontendDirectory, 'api', 'unknown'), html),
    writeFile(join(frontendDirectory, '.env'), 'fixture-only-secret'),
    writeFile(join(fixtureDirectory, 'package.json'), '{"private":true}'),
  ])
})

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production')
  doctors = { search: vi.fn().mockResolvedValue({ items: [], total: 0, limit: 10, offset: 0 }) }
  // Routing tests inject a session boundary and service fixture; no database is used.
  app = createApp({
    frontendDirectory,
    doctors,
    sessionMiddleware: (_request, _response, next) => next(),
  })
})

afterEach(() => vi.unstubAllEnvs())
afterAll(async () => {
  if (fixtureDirectory) await rm(fixtureDirectory, { recursive: true, force: true })
})

describe('production frontend serving', () => {
  it.each([
    '/', '/doctors', '/doctors/1?date=2026-10-08', '/login', '/register',
    '/appointments', '/appointments/1', '/doctor/appointments', '/doctor/availability',
    '/notifications', '/doctors/', '/doctor/verification', '/admin/doctor-verifications',
    '/doctor/verification/', '/admin/doctor-verifications/',
    '/doctor/verification?returnTo=availability', '/admin/doctor-verifications?status=pending',
  ])('serves the React shell for HTML navigation to %s', async pathname => {
    const response = await request(app).get(pathname)
      .set('Accept', 'text/html').set('Sec-Fetch-Mode', 'navigate').set('Sec-Fetch-Dest', 'document')
    expect(response.status).toBe(200)
    expect(response.type).toBe('text/html')
    expect(response.text).toBe(html)
  })

  it('supports HEAD page navigation without a response body', async () => {
    const response = await request(app).head('/doctors/1').set('Accept', 'text/html')
    expect(response.status).toBe(200)
    expect(response.type).toBe('text/html')
    expect(response.text).toBeUndefined()
  })

  it.each(['/assets/app.js', '/assets/app.css'])('serves generated asset %s', async pathname => {
    const response = await request(app).get(pathname)
    expect(response.status).toBe(200)
    expect(response.type).not.toBe('text/html')
  })

  it('preserves existing health and public doctor API routes', async () => {
    const health = await request(app).get('/api/health').set('Accept', 'text/html')
    expect(health.status).toBe(200)
    expect(health.body).toEqual({ status: 'ok' })
    const response = await request(app).get('/api/doctors').set('Accept', 'text/html')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ items: [], total: 0, limit: 10, offset: 0 })
    expect(doctors.search).toHaveBeenCalledOnce()
  })

  it('preserves authentication errors and API validation', async () => {
    const auth = await request(app).get('/api/auth/me').set('Accept', 'text/html')
    expect(auth.status).toBe(401)
    expect(auth.body.error.code).toBe('AUTHENTICATION_REQUIRED')
    const invalid = await request(app).get('/api/doctors?limit=invalid').set('Accept', 'text/html')
    expect(invalid.status).toBe(400)
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR')
    expect(doctors.search).not.toHaveBeenCalled()
  })

  it.each(['/api', '/api/unknown', '/API/unknown', '/api/unknown/', '/api/doctor/verification', '/api/admin/unknown'])('keeps %s a JSON API 404, even with a matching fixture file', async pathname => {
    const response = await request(app).get(pathname).set('Accept', 'text/html')
    expect(response.status).toBe(404)
    expect(response.type).toBe('application/json')
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND')
  })

  it.each([
    '/assets/missing.js', '/assets/missing.css', '/assets/missing', '/favicon.ico',
    '/doctors/missing.js', '/doctors/missing%2Ecss', '/unknown', '/.env',
    '/server/.env', '/server/src/app.js', '/client/src/App.jsx', '/package.json',
    '/assets/%2e%2e/%2e%2e/package.json',
  ])('returns 404 instead of the React shell for %s', async pathname => {
    const response = await request(app).get(pathname).set('Accept', 'text/html')
    expect(response.status).toBe(404)
    expect(response.type).not.toBe('text/html')
    expect(response.text).not.toContain('fixture-only-secret')
    expect(response.text).not.toContain('"private":true')
  })

  it.each(['post', 'put', 'patch', 'delete', 'options'])('does not serve the React shell for %s requests', async method => {
    const response = await request(app)[method]('/doctors').set('Accept', 'text/html')
    expect(response.status).toBe(404)
    expect(response.type).not.toBe('text/html')
  })

  it.each(['application/json', '*/*', 'text/html;q=0,application/json'])('does not fall back for Accept: %s', async accept => {
    const response = await request(app).get('/doctors').set('Accept', accept)
    expect(response.status).toBe(404)
  })

  it.each([['Sec-Fetch-Dest', 'script'], ['Sec-Fetch-Mode', 'cors']])('does not fall back for %s: %s', async (header, value) => {
    const response = await request(app).get('/doctors').set('Accept', 'text/html').set(header, value)
    expect(response.status).toBe(404)
  })

  it('returns 404 when the frontend has not been built', async () => {
    const unbuiltApp = createApp({
      frontendDirectory: join(fixtureDirectory, 'unbuilt'),
      sessionMiddleware: (_request, _response, next) => next(),
    })
    const response = await request(unbuiltApp).get('/').set('Accept', 'text/html')
    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND')
  })

  it.each(['/', '/doctors/1', '/assets/app.js', '/index.html'])('does not serve production files in development at %s', async pathname => {
    vi.stubEnv('NODE_ENV', 'development')
    const developmentApp = createApp({
      frontendDirectory,
      sessionMiddleware: (_request, _response, next) => next(),
    })
    const response = await request(developmentApp).get(pathname).set('Accept', 'text/html')
    expect(response.status).toBe(404)
    expect(response.type).not.toBe('text/html')
    expect(developmentApp.get('trust proxy')).toBe(false)
    expect((await request(developmentApp).get('/api/health')).body).toEqual({ status: 'ok' })
  })

  it('keeps the existing production proxy setting', () => {
    expect(app.get('trust proxy')).toBe(1)
  })
})
