import { describe, expect, it } from "vitest"

import { createIntegrationAdapters } from "./index"

// Regression: the default clock used to be a hard-coded 2026-06-04, which
// production route handlers persisted as real row timestamps — a freshly
// created record rendered as months old in the operator console.
describe("integration adapter clock", () => {
  it("reads real time when no clock is injected", () => {
    const before = Date.now()
    const adapters = createIntegrationAdapters({ env: {} })
    const now = adapters.clock.now().getTime()
    const after = Date.now()

    expect(now).toBeGreaterThanOrEqual(before)
    expect(now).toBeLessThanOrEqual(after)
  })

  it("reads real time in production mode too, since the default was never stub-only", () => {
    const adapters = createIntegrationAdapters({
      env: { APP_INTEGRATION_MODE: "production" },
    })

    expect(adapters.mode).toBe("production")
    expect(Date.now() - adapters.clock.now().getTime()).toBeLessThan(60_000)
  })

  it("advances between calls so a slow request stamps completion at completion time", async () => {
    const adapters = createIntegrationAdapters({ env: {} })

    const first = adapters.clock.now().getTime()
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = adapters.clock.now().getTime()

    expect(second).toBeGreaterThan(first)
  })

  it("freezes at the injected instant so tests stay deterministic", () => {
    const pinned = new Date("2026-06-04T00:00:00.000Z")
    const adapters = createIntegrationAdapters({ env: {}, now: pinned })

    expect(adapters.clock.now().toISOString()).toBe("2026-06-04T00:00:00.000Z")
    expect(adapters.clock.now().toISOString()).toBe("2026-06-04T00:00:00.000Z")
  })
})
