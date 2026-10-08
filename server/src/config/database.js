import { X509Certificate } from 'node:crypto'

export class DatabaseConfigurationError extends Error {}

export function createDatabaseConfig(environment) {
  if (!environment.DATABASE_URL) {
    throw new DatabaseConfigurationError('DATABASE_URL is required for database operations')
  }

  let url
  try {
    url = new URL(environment.DATABASE_URL)
    decodeURIComponent(url.username)
    decodeURIComponent(url.password)
    decodeURIComponent(url.pathname)
  } catch {
    throw new DatabaseConfigurationError('DATABASE_URL must be a valid PostgreSQL URL')
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) {
    throw new DatabaseConfigurationError('DATABASE_URL must include a PostgreSQL host and database name')
  }

  // pg URL parameters can replace the ssl object, including certificate checks.
  const overrides = ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'sslnegotiation', 'uselibpqcompat', 'host']
  if ([...url.searchParams.keys()].some(key => overrides.includes(key.toLowerCase()))) {
    throw new DatabaseConfigurationError('Remove connection/TLS overrides from DATABASE_URL; use DATABASE_SSL and DATABASE_SSL_CA')
  }

  const sslSetting = environment.DATABASE_SSL ?? 'false'
  if (!['true', 'false'].includes(sslSetting)) {
    throw new DatabaseConfigurationError('DATABASE_SSL must be true or false')
  }
  const hostname = url.hostname.toLowerCase()
  const privateOrLocal = hostname.endsWith('.railway.internal')
    || ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
  if (environment.NODE_ENV === 'production' && sslSetting === 'false' && !privateOrLocal) {
    throw new DatabaseConfigurationError('Production connections outside Railway private networking or localhost require DATABASE_SSL=true')
  }
  if (environment.DATABASE_SSL_CA) {
    if (sslSetting !== 'true') {
      throw new DatabaseConfigurationError('DATABASE_SSL_CA requires DATABASE_SSL=true')
    }
    try {
      new X509Certificate(environment.DATABASE_SSL_CA)
    } catch {
      throw new DatabaseConfigurationError('DATABASE_SSL_CA must contain a valid PEM CA certificate')
    }
  }

  return {
    connectionString: environment.DATABASE_URL,
    ssl: sslSetting === 'true'
      ? { rejectUnauthorized: true, ...(environment.DATABASE_SSL_CA ? { ca: environment.DATABASE_SSL_CA } : {}) }
      : false,
  }
}
