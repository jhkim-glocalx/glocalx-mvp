import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"

const passwordHashAlgorithm = "scrypt"
const passwordHashKeyLength = 64
const passwordHashSaltLength = 16
export const passwordVerificationDecoyHash =
  "scrypt$DQ0NDQ0NDQ0NDQ0NDQ0NDQ$ATzAmMbWSwnxQpL4KT0Bu9QoHjtn3CfoAdESDpNq9lMpW0r5uGN3BPMU8D6yb4nPDcGlqIKsMLKprISG7XiKTA"
const scryptOptions = {
  blockSize: 8,
  cost: 32_768,
  maxmem: 64 * 1024 * 1024,
  parallelization: 1,
} as const

async function derivePasswordKey(
  password: string,
  salt: Buffer
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      passwordHashKeyLength,
      scryptOptions,
      (error, key) => {
        if (error !== null) {
          reject(error)
          return
        }
        resolve(key)
      }
    )
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(passwordHashSaltLength)
  const derivedKey = await derivePasswordKey(password, salt)
  return `${passwordHashAlgorithm}$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  const [algorithm, encodedSalt, encodedKey, ...unexpectedParts] =
    passwordHash.split("$")
  if (
    algorithm !== passwordHashAlgorithm ||
    encodedSalt === undefined ||
    encodedKey === undefined ||
    unexpectedParts.length > 0
  ) {
    return false
  }

  const salt = Buffer.from(encodedSalt, "base64url")
  const expectedKey = Buffer.from(encodedKey, "base64url")
  if (
    salt.length !== passwordHashSaltLength ||
    expectedKey.length !== passwordHashKeyLength
  ) {
    return false
  }

  const derivedKey = await derivePasswordKey(password, salt)
  return timingSafeEqual(derivedKey, expectedKey)
}
