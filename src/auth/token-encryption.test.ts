import { describe, expect, it } from "vitest"

import { decryptToken, encryptToken } from "./token-encryption"

const validKey = Buffer.alloc(32, 7).toString("base64")

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

  it("keeps legacy placeholder writes outside production when no key is set", () => {
    expect(encryptToken("dev-token", { NODE_ENV: "test" })).toBe(
      "encrypted:dev-token"
    )
  })

  it("requires a configured encryption key in production", () => {
    expect(() =>
      encryptToken("live-token", { NODE_ENV: "production" })
    ).toThrow("TOKEN_ENCRYPTION_KEY is required in production.")
  })
})
