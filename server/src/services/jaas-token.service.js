import { createPrivateKey } from 'node:crypto'
import { SignJWT } from 'jose'
import { env } from '../config/env.js'

const defaultDomain = '8x8.vc'
const defaultTokenTtlSeconds = 600
const clockSkewSeconds = 5
const appIdPattern = /^[A-Za-z0-9_-]+$/

export class JaasConfigurationError extends Error {
  constructor() {
    super('JaaS video authorization is not configured')
    this.name = 'JaasConfigurationError'
  }
}

function decodePrivateKey(value) {
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new JaasConfigurationError()
  }

  const pem = Buffer.from(value, 'base64').toString('utf8')
  const isPkcs8 = pem.includes('-----BEGIN PRIVATE KEY-----')
    && pem.includes('-----END PRIVATE KEY-----')
  const isPkcs1 = pem.includes('-----BEGIN RSA PRIVATE KEY-----')
    && pem.includes('-----END RSA PRIVATE KEY-----')
  if (!isPkcs8 && !isPkcs1) {
    throw new JaasConfigurationError()
  }
  return pem
}

function validatedConfiguration(configuration) {
  const appId = configuration.JAAS_APP_ID?.trim()
  const keyId = configuration.JAAS_API_KEY_ID?.trim()
  const ttlSeconds = configuration.JAAS_TOKEN_TTL_SECONDS === undefined
    ? defaultTokenTtlSeconds
    : Number(configuration.JAAS_TOKEN_TTL_SECONDS)

  if (
    !appId
    || !appIdPattern.test(appId)
    || !keyId
    || !Number.isInteger(ttlSeconds)
    || ttlSeconds < 60
    || ttlSeconds > 3600
  ) throw new JaasConfigurationError()

  return {
    appId,
    keyId,
    ttlSeconds,
    privateKeyPem: decodePrivateKey(configuration.JAAS_PRIVATE_KEY_BASE64?.trim()),
  }
}

export function appointmentRoom(appointmentId) {
  const id = Number(appointmentId)
  if (!Number.isSafeInteger(id) || id < 1) throw new TypeError('A valid appointment ID is required')
  return `medreach-appointment-${id}`
}

export function createJaasTokenService(configuration = env, clock = () => new Date()) {
  let signingConfigurationPromise

  async function getSigningConfiguration() {
    if (!signingConfigurationPromise) {
      signingConfigurationPromise = (async () => {
        const validated = validatedConfiguration(configuration)
        try {
          const privateKey = createPrivateKey(validated.privateKeyPem)
          if (privateKey.type !== 'private' || privateKey.asymmetricKeyType !== 'rsa') {
            throw new JaasConfigurationError()
          }
          return {
            appId: validated.appId,
            keyId: validated.keyId,
            ttlSeconds: validated.ttlSeconds,
            privateKey,
          }
        } catch {
          throw new JaasConfigurationError()
        }
      })()
    }
    return signingConfigurationPromise
  }

  return {
    async createVideoSession({ appointmentId, user }) {
      const config = await getSigningConfiguration()
      const room = appointmentRoom(appointmentId)
      const issuedAt = Math.floor(new Date(clock()).getTime() / 1000)
      const expiresAt = issuedAt + config.ttlSeconds
      const moderator = user.role === 'doctor'
      const jwt = await new SignJWT({
        aud: 'jitsi',
        iss: 'chat',
        sub: config.appId,
        room,
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
        .setProtectedHeader({ alg: 'RS256', kid: config.keyId, typ: 'JWT' })
        .setNotBefore(issuedAt - clockSkewSeconds)
        .setExpirationTime(expiresAt)
        .sign(config.privateKey)

      return {
        domain: defaultDomain,
        roomName: `${config.appId}/${room}`,
        jwt,
        expiresAt: new Date(expiresAt * 1000).toISOString(),
        role: user.role,
      }
    },
  }
}

export const jaasTokenService = createJaasTokenService()
