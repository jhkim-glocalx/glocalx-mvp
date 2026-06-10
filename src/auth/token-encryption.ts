import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const tokenEncryptionPrefix = "v1"
const legacyPlaceholderPrefix = "encrypted:"

function readConfiguredKey(
  env: Readonly<Record<string, string | undefined>>
): Buffer | undefined {
  const configuredValue = env["TOKEN_ENCRYPTION_KEY"]?.trim()
  if (
    configuredValue === undefined ||
    configuredValue === "" ||
    configuredValue.startsWith("replace-with-")
  ) {
    return undefined
  }

  const key = Buffer.from(configuredValue, "base64")
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be a 32-byte base64 value.")
  }
  return key
}

export function encryptToken(
  token: string,
  env: Readonly<Record<string, string | undefined>> = process.env
): string {
  const key = readConfiguredKey(env)
  if (key === undefined) {
    if (env["NODE_ENV"] === "production") {
      throw new Error("TOKEN_ENCRYPTION_KEY is required in production.")
    }

    return `${legacyPlaceholderPrefix}${token}`
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
  if (encryptedToken.startsWith(legacyPlaceholderPrefix)) {
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
  } catch {
    return undefined
  }
}
