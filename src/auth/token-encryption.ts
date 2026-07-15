import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const tokenEncryptionPrefix = "v1"
const legacyPlaceholderPrefix = "encrypted:"
const tokenEncryptionKeyEnvVar = "TOKEN_ENCRYPTION_KEY"
const missingTokenEncryptionKeyEnvVars = [tokenEncryptionKeyEnvVar] as const
const base64Pattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

function readConfiguredKeyValue(
  env: Readonly<Record<string, string | undefined>>
): string | undefined {
  const configuredValue = env[tokenEncryptionKeyEnvVar]?.trim()
  if (
    configuredValue === undefined ||
    configuredValue === "" ||
    configuredValue.startsWith("replace-with-")
  ) {
    return undefined
  }

  return configuredValue
}

function decodeConfiguredKey(configuredValue: string): Buffer | undefined {
  if (!base64Pattern.test(configuredValue)) {
    return undefined
  }

  const key = Buffer.from(configuredValue, "base64")
  return key.length === 32 ? key : undefined
}

function readConfiguredKey(
  env: Readonly<Record<string, string | undefined>>
): Buffer | undefined {
  const configuredValue = readConfiguredKeyValue(env)
  if (configuredValue === undefined) {
    return undefined
  }

  const key = decodeConfiguredKey(configuredValue)
  if (key === undefined) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be a 32-byte base64 value.")
  }
  return key
}

export function missingTokenEncryptionEnvVars(
  env: Readonly<Record<string, string | undefined>> = process.env
): readonly string[] {
  const configuredValue = readConfiguredKeyValue(env)
  if (configuredValue === undefined) {
    return missingTokenEncryptionKeyEnvVars
  }

  return decodeConfiguredKey(configuredValue) === undefined
    ? missingTokenEncryptionKeyEnvVars
    : []
}

export function encryptToken(
  token: string,
  env: Readonly<Record<string, string | undefined>> = process.env
): string {
  const key = readConfiguredKey(env)
  if (key === undefined) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required for token encryption.")
  }

  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [
    tokenEncryptionPrefix,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":")
}

export function decryptToken(
  encryptedToken: string,
  env: Readonly<Record<string, string | undefined>> = process.env
): string | undefined {
  const productionLike =
    env["NODE_ENV"] === "production" ||
    env["VERCEL"] === "1" ||
    env["VERCEL_ENV"] === "preview" ||
    env["VERCEL_ENV"] === "production"
  if (
    !productionLike &&
    env["PLAYWRIGHT_TEST"] === "true" &&
    encryptedToken.startsWith(legacyPlaceholderPrefix)
  ) {
    const token = encryptedToken.slice(legacyPlaceholderPrefix.length).trim()
    return token === "" ? undefined : token
  }

  const tokenParts = encryptedToken.split(":")
  const [prefix, encodedIv, encodedAuthTag, encodedCiphertext] = tokenParts
  if (
    tokenParts.length !== 4 ||
    prefix !== tokenEncryptionPrefix ||
    encodedIv === undefined ||
    encodedAuthTag === undefined ||
    encodedCiphertext === undefined
  ) {
    return undefined
  }

  const key = readConfiguredKey(env)
  if (key === undefined) {
    return undefined
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(encodedIv, "base64url")
    )
    decipher.setAuthTag(Buffer.from(encodedAuthTag, "base64url"))
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8")
  } catch (error) {
    // Log the cipher library's own error only (never the key or ciphertext) so a
    // wrong key, a rotated key, and tampered ciphertext stay distinguishable in
    // production logs instead of collapsing into a silent `undefined`.
    console.error(
      "Token decryption failed",
      error instanceof Error ? error.message : error
    )
    return undefined
  }
}
