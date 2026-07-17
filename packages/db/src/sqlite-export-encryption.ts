import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

import { z } from "zod"

import { MigrationInputError } from "./sqlite-to-postgres-errors.ts"

const encryptionKeyEnvVar = "MIGRATION_EXPORT_ENCRYPTION_KEY"
const encryptedExportSchema = z.object({
  algorithm: z.literal("aes-256-gcm"),
  authTag: z.string().min(1),
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  version: z.literal(1),
})

function readEncryptionKey(
  env: Readonly<Record<string, string | undefined>>
): Buffer {
  const encodedKey = env[encryptionKeyEnvVar]?.trim()
  if (
    encodedKey === undefined ||
    encodedKey === "" ||
    encodedKey.startsWith("replace-with-")
  ) {
    throw new MigrationInputError(
      `${encryptionKeyEnvVar} is required for SQLite export files.`
    )
  }
  const key = Buffer.from(encodedKey, "base64")
  if (key.length !== 32) {
    throw new MigrationInputError(
      `${encryptionKeyEnvVar} must be a 32-byte base64 value.`
    )
  }
  return key
}

export function encryptSqliteExport(
  plaintext: string,
  env: Readonly<Record<string, string | undefined>> = process.env
): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", readEncryptionKey(env), iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  return JSON.stringify({
    algorithm: "aes-256-gcm",
    authTag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    version: 1,
  })
}

export function decryptSqliteExport(
  encrypted: string,
  env: Readonly<Record<string, string | undefined>> = process.env
): string {
  try {
    const envelope = encryptedExportSchema.parse(JSON.parse(encrypted))
    const decipher = createDecipheriv(
      "aes-256-gcm",
      readEncryptionKey(env),
      Buffer.from(envelope.iv, "base64url")
    )
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64url"))
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8")
  } catch (error) {
    if (error instanceof MigrationInputError) {
      throw error
    }
    throw new MigrationInputError("Invalid encrypted SQLite export file.")
  }
}
