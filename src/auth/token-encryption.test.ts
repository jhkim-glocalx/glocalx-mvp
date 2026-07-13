import { describe, expect, it } from "vitest"

import * as tokenEncryption from "./token-encryption"
import { decryptToken, encryptToken } from "./token-encryption"

const validKey = Buffer.alloc(32, 7).toString("base64")
const missingTokenEncryptionKey = ["TOKEN_ENCRYPTION_KEY"]

function getMissingTokenEncryptionEnvVars(): typeof tokenEncryption.missingTokenEncryptionEnvVars {
  expect(tokenEncryption).toHaveProperty("missingTokenEncryptionEnvVars")
  expect(typeof tokenEncryption.missingTokenEncryptionEnvVars).toBe("function")
  return tokenEncryption.missingTokenEncryptionEnvVars
}

describe("token encryption", () => {
  it("encrypts tokens without storing the plaintext when a key is configured", () => {
    const encrypted = encryptToken("access-token-value", {
      TOKEN_ENCRYPTION_KEY: validKey,
    })

    expect(encrypted).toMatch(/^v1:/)
    expect(encrypted).not.toContain("access-token-value")
    expect(
      decryptToken(encrypted, {
        TOKEN_ENCRYPTION_KEY: validKey,
      })
    ).toBe("access-token-value")
  })

  it("can still read legacy placeholder tokens", () => {
    expect(decryptToken("encrypted:legacy-token")).toBe("legacy-token")
  })

  it("requires a configured encryption key in every environment", () => {
    expect(() => encryptToken("live-token", { NODE_ENV: "test" })).toThrow(
      "TOKEN_ENCRYPTION_KEY is required for token encryption."
    )
  })
})

describe("missingTokenEncryptionEnvVars", () => {
  it("returns TOKEN_ENCRYPTION_KEY when the key is missing", () => {
    const missingTokenEncryptionEnvVars = getMissingTokenEncryptionEnvVars()

    expect(missingTokenEncryptionEnvVars({ NODE_ENV: "test" })).toEqual(
      missingTokenEncryptionKey
    )
  })

  it("returns TOKEN_ENCRYPTION_KEY when production key is blank", () => {
    const missingTokenEncryptionEnvVars = getMissingTokenEncryptionEnvVars()

    expect(
      missingTokenEncryptionEnvVars({
        NODE_ENV: "production",
        TOKEN_ENCRYPTION_KEY: " \t\n ",
      })
    ).toEqual(missingTokenEncryptionKey)
  })

  it("returns TOKEN_ENCRYPTION_KEY when production key is a replace-with- placeholder", () => {
    const missingTokenEncryptionEnvVars = getMissingTokenEncryptionEnvVars()

    expect(
      missingTokenEncryptionEnvVars({
        NODE_ENV: "production",
        TOKEN_ENCRYPTION_KEY: "replace-with-32-byte-base64-key",
      })
    ).toEqual(missingTokenEncryptionKey)
  })

  it("returns TOKEN_ENCRYPTION_KEY when production key is invalid-length base64", () => {
    const missingTokenEncryptionEnvVars = getMissingTokenEncryptionEnvVars()

    expect(
      missingTokenEncryptionEnvVars({
        NODE_ENV: "production",
        TOKEN_ENCRYPTION_KEY: Buffer.alloc(31, 7).toString("base64"),
      })
    ).toEqual(missingTokenEncryptionKey)
  })

  it("returns TOKEN_ENCRYPTION_KEY when production key is invalid base64", () => {
    const missingTokenEncryptionEnvVars = getMissingTokenEncryptionEnvVars()

    expect(
      missingTokenEncryptionEnvVars({
        NODE_ENV: "production",
        TOKEN_ENCRYPTION_KEY: "invalid",
      })
    ).toEqual(missingTokenEncryptionKey)
  })

  it("returns no missing env vars when production key is valid 32-byte base64", () => {
    const missingTokenEncryptionEnvVars = getMissingTokenEncryptionEnvVars()

    expect(
      missingTokenEncryptionEnvVars({
        NODE_ENV: "production",
        TOKEN_ENCRYPTION_KEY: validKey,
      })
    ).toEqual([])
  })
})
