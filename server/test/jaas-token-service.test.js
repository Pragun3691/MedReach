import { generateKeyPairSync } from 'node:crypto'
import { decodeProtectedHeader, jwtVerify } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  appointmentRoom,
  createJaasTokenService,
  JaasConfigurationError,
} from '../src/services/jaas-token.service.js'

const now = new Date('2030-01-01T09:00:00.000Z')
const appId = 'vpaas-magic-cookie-test-app'
const keyId = `${appId}/test-key`
let privateKeyBase64
let publicKey
let legacyPrivateKeyBase64
let legacyPrivateKeyPem
let legacyPublicKey
let nonRsaPrivateKeyBase64

beforeAll(() => {
  const pkcs8Pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const pkcs8Pem = pkcs8Pair.privateKey.export({ format: 'pem', type: 'pkcs8' })
  publicKey = pkcs8Pair.publicKey
  privateKeyBase64 = Buffer.from(pkcs8Pem).toString('base64')

  const pkcs1Pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
  legacyPrivateKeyPem = pkcs1Pair.privateKey.export({ format: 'pem', type: 'pkcs1' })
  legacyPublicKey = pkcs1Pair.publicKey
  legacyPrivateKeyBase64 = Buffer.from(legacyPrivateKeyPem).toString('base64')

  const ecPair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  nonRsaPrivateKeyBase64 = Buffer.from(ecPair.privateKey.export({ format: 'pem', type: 'pkcs8' })).toString('base64')
})

function service(ttl = '600', encodedPrivateKey = privateKeyBase64) {
  return createJaasTokenService({
    JAAS_APP_ID: appId,
    JAAS_API_KEY_ID: keyId,
    JAAS_PRIVATE_KEY_BASE64: encodedPrivateKey,
    JAAS_TOKEN_TTL_SECONDS: ttl,
  }, () => now)
}

describe('JaaS token service', () => {
  it.each([
    ['doctor', { id: 10, fullName: 'Dr. Aditi Sharma', email: 'doctor@example.test', role: 'doctor' }, true],
    ['patient', { id: 1, fullName: 'Ananya Rao', email: 'patient@example.test', role: 'patient' }, false],
  ])('signs a literal appointment token for %s', async (_role, user, moderator) => {
    const session = await service().createVideoSession({ appointmentId: 42, user })
    const verified = await jwtVerify(session.jwt, publicKey, {
      algorithms: ['RS256'],
      audience: 'jitsi',
      issuer: 'chat',
      subject: appId,
      currentDate: now,
    })

    expect(decodeProtectedHeader(session.jwt)).toEqual({ alg: 'RS256', kid: keyId, typ: 'JWT' })
    expect(verified.payload).toMatchObject({
      aud: 'jitsi',
      iss: 'chat',
      sub: appId,
      room: 'medreach-appointment-42',
      nbf: Math.floor(now.getTime() / 1000) - 5,
      exp: Math.floor(now.getTime() / 1000) + 600,
      context: {
        user: {
          id: String(user.id),
          name: user.fullName,
          email: user.email,
          moderator,
        },
        features: {
          recording: false,
          livestreaming: false,
          transcription: false,
          'outbound-call': false,
          'sip-outbound-call': false,
          'file-upload': false,
          'send-groupchat': false,
          'create-polls': false,
        },
        room: { regex: false },
      },
    })
    expect(session).toMatchObject({
      domain: '8x8.vc',
      roomName: `${appId}/medreach-appointment-42`,
      expiresAt: '2030-01-01T09:10:00.000Z',
      role: user.role,
    })
    expect(session).not.toHaveProperty('privateKey')
    expect(session).not.toHaveProperty('keyId')
    expect(JSON.stringify(session)).not.toContain(privateKeyBase64)
  })

  it('signs with a Base64-encoded legacy PKCS#1 RSA PEM', async () => {
    const user = { id: 10, fullName: 'Dr. Aditi Sharma', email: 'doctor@example.test', role: 'doctor' }
    const session = await service('600', legacyPrivateKeyBase64).createVideoSession({ appointmentId: 42, user })
    await expect(jwtVerify(session.jwt, legacyPublicKey, {
      algorithms: ['RS256'],
      currentDate: now,
    })).resolves.toMatchObject({ payload: { room: 'medreach-appointment-42' } })
    expect(JSON.stringify(session)).not.toContain(legacyPrivateKeyBase64)
    expect(JSON.stringify(session)).not.toContain(legacyPrivateKeyPem)
  })

  it('keeps rooms stable per appointment and distinct between appointments', async () => {
    const user = { id: 1, fullName: 'Ananya Rao', email: 'patient@example.test', role: 'patient' }
    const first = await service().createVideoSession({ appointmentId: 42, user })
    const repeated = await service().createVideoSession({ appointmentId: 42, user })
    const different = await service().createVideoSession({ appointmentId: 43, user })
    expect(first.roomName).toBe(repeated.roomName)
    expect(first.roomName).not.toBe(different.roomName)
    expect(appointmentRoom(42)).toBe('medreach-appointment-42')
  })

  it('uses the configured short token lifetime', async () => {
    const user = { id: 1, fullName: 'Ananya Rao', email: 'patient@example.test', role: 'patient' }
    const session = await service('120').createVideoSession({ appointmentId: 42, user })
    const verified = await jwtVerify(session.jwt, publicKey, { currentDate: now })
    expect(verified.payload.exp - Math.floor(now.getTime() / 1000)).toBe(120)
    expect(session.expiresAt).toBe('2030-01-01T09:02:00.000Z')
  })

  it('validates missing or invalid configuration only when video authorization is used', async () => {
    const missing = createJaasTokenService({}, () => now)
    await expect(missing.createVideoSession({
      appointmentId: 42,
      user: { id: 1, fullName: 'Ananya Rao', email: 'patient@example.test', role: 'patient' },
    })).rejects.toBeInstanceOf(JaasConfigurationError)

    const malformed = service('600', Buffer.from('not a PEM private key').toString('base64'))
    await expect(malformed.createVideoSession({
      appointmentId: 42,
      user: { id: 1, fullName: 'Ananya Rao', email: 'patient@example.test', role: 'patient' },
    })).rejects.toBeInstanceOf(JaasConfigurationError)

    const nonRsa = service('600', nonRsaPrivateKeyBase64)
    await expect(nonRsa.createVideoSession({
      appointmentId: 42,
      user: { id: 1, fullName: 'Ananya Rao', email: 'patient@example.test', role: 'patient' },
    })).rejects.toBeInstanceOf(JaasConfigurationError)
  })
})
