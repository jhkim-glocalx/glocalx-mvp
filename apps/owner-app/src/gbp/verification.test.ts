import type {
  GbpVerificationsAdapter,
  HttpRequestSpec,
} from "@glocalx/integrations/contracts"
import { describe, expect, it, vi } from "vitest"

import {
  readGbpVerificationSnapshot,
  runGbpVerificationAttempt,
} from "./verification"

const locationName = "locations/123"

function fakeVerifications(): GbpVerificationsAdapter {
  const ok = (value: HttpRequestSpec) => ({ kind: "ok" as const, value })
  return {
    fetchVerificationOptions: ({ locationName: name }) =>
      ok({
        method: "POST",
        url: `test://${name}:fetchVerificationOptions`,
        headers: {},
      }),
    verify: ({ locationName: name, method }) =>
      ok({
        method: "POST",
        url: `test://${name}:verify`,
        headers: {},
        body: { method },
      }),
    getVoiceOfMerchantState: ({ locationName: name }) =>
      ok({
        method: "GET",
        url: `test://${name}/VoiceOfMerchantState`,
        headers: {},
      }),
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body))
}

// Routes each best-effort call by URL. `optionsResponses` are consumed in order
// so a test can return AUTO first and an empty list on the post-attempt re-read.
function fetchRouter(config: {
  optionsResponses: readonly unknown[]
  voiceOfMerchant: unknown
}) {
  let optionsCall = 0
  return vi.fn(async (url: string) => {
    if (url.endsWith(":fetchVerificationOptions")) {
      const body = config.optionsResponses[optionsCall] ?? { options: [] }
      optionsCall += 1
      return jsonResponse(body)
    }
    if (url.endsWith("/VoiceOfMerchantState")) {
      return jsonResponse(config.voiceOfMerchant)
    }
    return jsonResponse({})
  })
}

describe("runGbpVerificationAttempt", () => {
  it("attempts AUTO, then reports PENDING_REVIEW from the re-read state", async () => {
    const fetchImpl = fetchRouter({
      optionsResponses: [
        { options: [{ verificationMethod: "AUTO" }] },
        { options: [] },
      ],
      voiceOfMerchant: {
        hasVoiceOfMerchant: false,
        waitForVoiceOfMerchant: {},
      },
    })

    const result = await runGbpVerificationAttempt({
      verifications: fakeVerifications(),
      accessToken: "token",
      locationName,
      fetchImpl,
    })

    expect(result).toEqual({
      state: "PENDING_REVIEW",
      offeredMethods: [],
      autoAttempted: true,
    })
    // options (initial) + verify + VoM + options (re-read) = 4 calls.
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    expect(fetchImpl).toHaveBeenCalledWith(
      "test://locations/123:verify",
      expect.objectContaining({ method: "POST" })
    )
  })

  it("skips the verify call and reports NEEDS_VERIFICATION when only an API method is offered", async () => {
    const fetchImpl = fetchRouter({
      optionsResponses: [{ options: [{ verificationMethod: "ADDRESS" }] }],
      voiceOfMerchant: { hasVoiceOfMerchant: false, verify: {} },
    })

    const result = await runGbpVerificationAttempt({
      verifications: fakeVerifications(),
      accessToken: "token",
      locationName,
      fetchImpl,
    })

    expect(result).toEqual({
      state: "NEEDS_VERIFICATION",
      offeredMethods: ["ADDRESS"],
      autoAttempted: false,
    })
    // No AUTO → no verify call and no re-read: options + VoM = 2 calls.
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("reports VERIFIED when Google already granted voice of merchant", async () => {
    const fetchImpl = fetchRouter({
      optionsResponses: [{ options: [] }],
      voiceOfMerchant: { hasVoiceOfMerchant: true },
    })

    const result = await runGbpVerificationAttempt({
      verifications: fakeVerifications(),
      accessToken: "token",
      locationName,
      fetchImpl,
    })

    expect(result.state).toBe("VERIFIED")
  })

  it("degrades to UNKNOWN when the verification reads fail", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 500 }))

    const result = await runGbpVerificationAttempt({
      verifications: fakeVerifications(),
      accessToken: "token",
      locationName,
      fetchImpl,
    })

    expect(result).toEqual({
      state: "UNKNOWN",
      offeredMethods: [],
      autoAttempted: false,
    })
  })

  it("never throws when fetch itself rejects", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down")
    })

    await expect(
      runGbpVerificationAttempt({
        verifications: fakeVerifications(),
        accessToken: "token",
        locationName,
        fetchImpl,
      })
    ).resolves.toEqual({
      state: "UNKNOWN",
      offeredMethods: [],
      autoAttempted: false,
    })
  })
})

describe("readGbpVerificationSnapshot", () => {
  it("reads and interprets state without ever calling verify, even if AUTO is offered", async () => {
    const fetchImpl = fetchRouter({
      optionsResponses: [{ options: [{ verificationMethod: "AUTO" }] }],
      voiceOfMerchant: { hasVoiceOfMerchant: false, verify: {} },
    })

    const result = await readGbpVerificationSnapshot({
      verifications: fakeVerifications(),
      accessToken: "token",
      locationName,
      fetchImpl,
    })

    // AUTO-only + verify affordance → concierge, and no verify write was made.
    expect(result).toEqual({
      state: "NEEDS_CONCIERGE",
      offeredMethods: ["AUTO"],
    })
    expect(fetchImpl).not.toHaveBeenCalledWith(
      "test://locations/123:verify",
      expect.anything()
    )
    // options + VoM = 2 reads only.
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
