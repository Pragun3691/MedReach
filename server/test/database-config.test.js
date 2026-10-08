import { rootCertificates } from 'node:tls'
import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { createDatabaseConfig } from '../src/config/database.js'
import { parseEnvironment } from '../src/config/env.js'

const localUrl = 'postgresql://fixture:fixture-password@localhost:5432/medreach_fixture'
const privateUrl = 'postgresql://fixture:fixture-password@postgres.railway.internal:5432/medreach_fixture'
const externalUrl = 'postgresql://fixture:fixture-password@db.example.com:5432/medreach_fixture'

describe('database environment and TLS configuration (no connections)', () => {
  it('keeps local development defaults and accepts injected DATABASE_URL', () => {
    const environment = parseEnvironment({ DATABASE_URL: localUrl })
    expect(environment.NODE_ENV).toBe('development')
    expect(environment.DATABASE_SSL).toBe('false')
    expect(createDatabaseConfig(environment)).toEqual({ connectionString: localUrl, ssl: false })
  })

  it('requires DATABASE_URL before creating a connection configuration', () => {
    expect(() => createDatabaseConfig({})).toThrow('DATABASE_URL is required')
  })

  it.each([
    ['DATABASE_URL', ''], ['DATABASE_SSL', 'no-verify'], ['DATABASE_SSL_CA', ''],
    ['NODE_ENV', 'invalid'], ['PORT', '0'], ['SESSION_SECRET', 'short-secret'],
  ])('rejects invalid %s without including its value in validation errors', (field, value) => {
    expect(() => parseEnvironment({ [field]: value })).toThrow(`Invalid server environment fields: ${field}`)
  })

  it.each(['invalid-secret-url', 'https://fixture:secret@db.example.com/db', 'postgresql://fixture:secret@localhost/'])('rejects invalid PostgreSQL URLs without exposing credentials', url => {
    try {
      parseEnvironment({ DATABASE_URL: url })
      throw new Error('Expected invalid URL to fail')
    } catch (error) {
      expect(error.message).toContain('DATABASE_URL')
      expect(error.message).not.toContain('secret')
      expect(error.message).not.toContain(url)
    }
  })

  it.each([privateUrl, localUrl, 'postgresql://fixture:fixture-password@[::1]:5432/medreach_fixture'])('supports private Railway or local PostgreSQL without TLS: %s', DATABASE_URL => {
    expect(createDatabaseConfig(parseEnvironment({ NODE_ENV: 'production', DATABASE_URL })).ssl).toBe(false)
  })

  it('requires TLS for public production endpoints', () => {
    expect(() => parseEnvironment({ NODE_ENV: 'production', DATABASE_URL: externalUrl }))
      .toThrow('require DATABASE_SSL=true')
  })

  it('validates certificates when external TLS is configured', () => {
    const config = createDatabaseConfig(parseEnvironment({ NODE_ENV: 'production', DATABASE_URL: externalUrl, DATABASE_SSL: 'true' }))
    expect(config.ssl).toEqual({ rejectUnauthorized: true })
    // Instantiating a Client only parses options; it does not connect.
    const client = new pg.Client(config)
    expect(client.connectionParameters.ssl).toEqual({ rejectUnauthorized: true })
    expect(client.connectionParameters.host).toBe('db.example.com')
  })

  it('supports a PEM CA without removing hostname or certificate verification', () => {
    const config = createDatabaseConfig(parseEnvironment({ DATABASE_URL: externalUrl, DATABASE_SSL: 'true', DATABASE_SSL_CA: rootCertificates[0] }))
    const client = new pg.Client(config)
    expect(client.connectionParameters.ssl.ca).toBe(rootCertificates[0])
    expect(client.connectionParameters.ssl.rejectUnauthorized).toBe(true)
    expect(client.connectionParameters.ssl.checkServerIdentity).toBeUndefined()
  })

  it('rejects an invalid CA and a CA configured without TLS', () => {
    expect(() => parseEnvironment({ DATABASE_URL: externalUrl, DATABASE_SSL: 'true', DATABASE_SSL_CA: 'not-a-certificate-secret' }))
      .toThrow('DATABASE_SSL_CA must contain a valid PEM CA certificate')
    expect(() => parseEnvironment({ DATABASE_URL: privateUrl, DATABASE_SSL_CA: rootCertificates[0] }))
      .toThrow('DATABASE_SSL_CA requires DATABASE_SSL=true')
  })

  it.each([
    'ssl=no-verify', 'sslmode=no-verify', 'sslmode=require', 'sslmode=disable',
    'sslcert=secret', 'sslkey=secret', 'sslrootcert=secret', 'sslnegotiation=direct',
    'uselibpqcompat=true', 'host=db.example.com',
  ])('refuses URL overrides that could change the connection or TLS policy: %s', query => {
    expect(() => parseEnvironment({ DATABASE_URL: `${privateUrl}?${query}`, DATABASE_SSL: 'true' }))
      .toThrow('Remove connection/TLS overrides from DATABASE_URL')
  })

  it('preserves harmless URL parameters', () => {
    const config = createDatabaseConfig({ DATABASE_URL: `${externalUrl}?application_name=medreach`, DATABASE_SSL: 'true' })
    const client = new pg.Client(config)
    expect(client.connectionParameters.application_name).toBe('medreach')
    expect(client.connectionParameters.ssl.rejectUnauthorized).toBe(true)
  })
})
