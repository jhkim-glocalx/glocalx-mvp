import { describe, expect, it } from "vitest"

import { hashPassword, verifyPassword } from "./email-password"

describe("email password hashing", () => {
  it("accepts only the password that created an encoded credential", async () => {
    // Given: a password supplied during account registration.
    const passwordHash = await hashPassword("correct-horse-battery-staple")

    // When: the login path checks the valid and invalid password values.
    const valid = await verifyPassword(
      "correct-horse-battery-staple",
      passwordHash
    )
    const invalid = await verifyPassword("different-password", passwordHash)

    // Then: the stored value is encoded and only the original password works.
    expect(passwordHash).toMatch(/^scrypt\$/)
    expect(valid).toBe(true)
    expect(invalid).toBe(false)
  })
})
