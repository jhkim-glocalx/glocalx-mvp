import { describe, expect, it } from "vitest"

import { createPostMediaUrl, isValidPostMediaSignature } from "./post-media"

const env = {
  POST_MEDIA_SIGNING_KEY: "test-media-signing-key",
  PUBLIC_APP_URL: "https://app.example.com",
}

describe("signed post media URLs", () => {
  it("binds a short-lived signature to the draft, asset, and expiry", () => {
    const url = new URL(createPostMediaUrl("draft-1", "asset-1", env) ?? "")
    const signature = url.searchParams.get("signature") ?? ""
    const expires = url.searchParams.get("expires") ?? ""

    expect(Number(expires)).toBeGreaterThan(Math.floor(Date.now() / 1000))
    expect(
      isValidPostMediaSignature("draft-1", "asset-1", signature, expires, env)
    ).toBe(true)
    expect(
      isValidPostMediaSignature("draft-1", "asset-2", signature, expires, env)
    ).toBe(false)
  })
})
