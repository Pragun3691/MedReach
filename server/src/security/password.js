import argon2 from 'argon2'

const passwordHashOptions = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
}

export function hashPassword(password) {
  return argon2.hash(password, passwordHashOptions)
}

export async function verifyPassword(passwordHash, password) {
  try {
    return await argon2.verify(passwordHash, password, { type: argon2.argon2id })
  } catch {
    return false
  }
}
