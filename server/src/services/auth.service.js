import { authRepository } from '../data-access/auth.repository.js'
import { AppError } from '../errors/app-error.js'
import { hashPassword, verifyPassword } from '../security/password.js'

const invalidCredentials = () => new AppError(
  401,
  'INVALID_CREDENTIALS',
  'The email or password is incorrect',
)

let dummyPasswordHash

async function getDummyPasswordHash() {
  if (!dummyPasswordHash) {
    dummyPasswordHash = await hashPassword('MedReach timing-only password')
  }

  return dummyPasswordHash
}

function mapPublicUser(row) {
  return {
    id: Number(row.id),
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    isEnabled: row.is_enabled,
  }
}

function translateRegistrationError(error) {
  if (error?.code === '23505') {
    throw new AppError(409, 'EMAIL_IN_USE', 'An account with this email already exists')
  }

  if (error?.code === '23503') {
    throw new AppError(400, 'INVALID_SPECIALIZATION', 'One or more specializations are invalid')
  }

  throw error
}

export function createAuthService(repository = authRepository) {
  return {
    async registerPatient(input) {
      const passwordHash = await hashPassword(input.password)

      try {
        const user = await repository.createPatient({ ...input, passwordHash })
        return mapPublicUser(user)
      } catch (error) {
        translateRegistrationError(error)
      }
    },

    async registerDoctor(input) {
      const passwordHash = await hashPassword(input.password)

      try {
        const user = await repository.createDoctor({ ...input, passwordHash })

        if (!user) {
          throw new AppError(400, 'INVALID_SPECIALIZATION', 'One or more specializations are invalid')
        }

        return mapPublicUser(user)
      } catch (error) {
        if (error instanceof AppError) throw error
        translateRegistrationError(error)
      }
    },

    async authenticate(email, password) {
      const user = await repository.findByEmailForAuthentication(email)
      const usableHash = user?.password_hash?.startsWith('$argon2id$')
        ? user.password_hash
        : await getDummyPasswordHash()
      const passwordMatches = await verifyPassword(usableHash, password)

      if (!user || !passwordMatches) {
        throw invalidCredentials()
      }

      if (!user.is_enabled) {
        throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is disabled')
      }

      return mapPublicUser(user)
    },

    async getSessionUser(userId) {
      const user = await repository.findSafeUserById(userId)

      if (!user) return null
      return mapPublicUser(user)
    },
  }
}

export const authService = createAuthService()
