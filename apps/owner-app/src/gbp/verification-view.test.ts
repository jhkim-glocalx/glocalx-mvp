import type {
  GbpVerificationStore,
  RefreshGbpVerificationInput,
  StoreGbpVerification,
} from "@glocalx/db/support/gbp-verification-store"
import type {
  GbpVerificationsAdapter,
  HttpRequestSpec,
} from "@glocalx/integrations/contracts"
import { describe, expect, it, vi } from "vitest"

import { resolveOwnerGbpVerification } from "./verification-view"

const storeId = "store-1"
const now = new Date("2026-08-12T00:00:00.000Z")

function seededRow(
  overrides: Partial<StoreGbpVerification> = {}
): StoreGbpVerification {
  return {
    storeId,
    googleLocationId: "locations/123",
    state: "NEEDS_CONCIERGE",
    offeredMethods: [],
    autoAttempted: true,
    lastCheckedAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    ...overrides,
  }
}

// A store seeded with one row that records refresh writes and re-reads the
// updated state, so the tests can assert both the persisted write and the view.
function fakeStore(initial: StoreGbpVerification | undefined): {
  store: GbpVerificationStore
  refresh: ReturnType<typeof vi.fn>
} {
  let row = initial
  const refresh = vi.fn(async (input: RefreshGbpVerificationInput) => {
    if (row !== undefined) {
      row = {
        ...row,
        state: input.state,
        offeredMethods: input.offeredMethods,
        lastCheckedAt: input.now.toISOString(),
        updatedAt: input.now.toISOString(),
      }
    }
  })
  return {
    refresh,
    store: {
      upsertVerificationState: vi.fn(async () => {}),
      refreshVerificationState: refresh,
      readVerificationState: async () => row,
      listVerificationStates: async () => (row === undefined ? [] : [row]),
    },
  }
}

function verifications(): GbpVerificationsAdapter {
  const ok = (value: HttpRequestSpec) => ({ kind: "ok" as const, value })
  return {
    fetchVerificationOptions: ({ locationName }) =>
      ok({ method: "POST", url: `test://${locationName}:opts`, headers: {} }),
    verify: ({ locationName }) =>
      ok({ method: "POST", url: `test://${locationName}:verify`, headers: {} }),
    getVoiceOfMerchantState: ({ locationName }) =>
      ok({ method: "GET", url: `test://${locationName}/vom`, headers: {} }),
  }
}

const okCredentials = async () => ({
  kind: "ok" as const,
  credentials: { accessToken: "token", accountName: "accounts/1" },
})

describe("resolveOwnerGbpVerification", () => {
  it("returns null when no verification row exists", async () => {
    const { store } = fakeStore(undefined)
    const result = await resolveOwnerGbpVerification({
      store,
      verifications: verifications(),
      mode: "production",
      storeId,
      env: {},
      fetchImpl: vi.fn(),
      now,
    })
    expect(result).toBeNull()
  })

  it("returns the persisted row without refreshing in stub mode", async () => {
    const { store, refresh } = fakeStore(seededRow())
    const fetchImpl = vi.fn()

    const result = await resolveOwnerGbpVerification({
      store,
      verifications: verifications(),
      mode: "stub",
      storeId,
      env: {},
      fetchImpl,
      now,
    })

    expect(result).toEqual({
      state: "NEEDS_CONCIERGE",
      phase: "attention",
      offeredMethods: [],
      updatedAt: "2026-08-11T00:00:00.000Z",
    })
    expect(refresh).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("live-refreshes and persists a decisive re-read in production", async () => {
    const { store, refresh } = fakeStore(seededRow())
    // VoM now grants voice of merchant → VERIFIED.
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith("/vom")
        ? new Response(JSON.stringify({ hasVoiceOfMerchant: true }))
        : new Response(JSON.stringify({ options: [] }))
    )

    const result = await resolveOwnerGbpVerification({
      store,
      verifications: verifications(),
      mode: "production",
      storeId,
      env: {},
      fetchImpl,
      now,
      resolveCredentials: okCredentials,
    })

    expect(refresh).toHaveBeenCalledWith(
      expect.objectContaining({ storeId, state: "VERIFIED" })
    )
    expect(result).toEqual({
      state: "VERIFIED",
      phase: "verified",
      offeredMethods: [],
      updatedAt: now.toISOString(),
    })
  })

  it("keeps the prior verdict when the live re-read is UNKNOWN", async () => {
    const { store, refresh } = fakeStore(seededRow())
    // Every read 500s → snapshot UNKNOWN → must not overwrite NEEDS_CONCIERGE.
    const fetchImpl = vi.fn(async () => new Response("", { status: 500 }))

    const result = await resolveOwnerGbpVerification({
      store,
      verifications: verifications(),
      mode: "production",
      storeId,
      env: {},
      fetchImpl,
      now,
      resolveCredentials: okCredentials,
    })

    expect(refresh).not.toHaveBeenCalled()
    expect(result?.state).toBe("NEEDS_CONCIERGE")
  })

  it("falls back to the persisted row when credentials are unavailable", async () => {
    const { store, refresh } = fakeStore(seededRow())

    const result = await resolveOwnerGbpVerification({
      store,
      verifications: verifications(),
      mode: "production",
      storeId,
      env: {},
      fetchImpl: vi.fn(),
      now,
      resolveCredentials: async () => ({
        kind: "blocked_by_credentials",
        missingEnvVars: ["GOOGLE_CLIENT_ID"],
      }),
    })

    expect(refresh).not.toHaveBeenCalled()
    expect(result?.state).toBe("NEEDS_CONCIERGE")
  })
})
