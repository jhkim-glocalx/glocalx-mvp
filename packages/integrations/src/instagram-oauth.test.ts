import { describe, expect, it } from "vitest"

import type { ExternalFetch } from "./contracts"
import {
  buildInstagramAuthorizeUrl,
  createProductionInstagramOAuth,
  createStubInstagramOAuth,
} from "./instagram-oauth"

const configuredEnv = {
  INSTAGRAM_APP_ID: "ig-app-id",
  INSTAGRAM_APP_SECRET: "ig-app-secret",
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

type Call = { url: string; init: RequestInit | undefined }

// Returns each queued response in call order and records the request, so a test
// can both drive a multi-step flow and assert the exact URLs/bodies sent. A
// queued function is invoked (used to simulate a network throw).
function sequencedFetch(
  responses: ReadonlyArray<Response | (() => Response)>
): {
  fetchImpl: ExternalFetch
  calls: Call[]
} {
  const calls: Call[] = []
  let index = 0
  const fetchImpl: ExternalFetch = async (url, init) => {
    calls.push({ url, init })
    const next = responses[index++]
    if (next === undefined) {
      throw new Error(`unexpected fetch call #${index} to ${url}`)
    }
    return typeof next === "function" ? next() : next
  }
  return { fetchImpl, calls }
}

// Real ids exceed 2^53, so identity returns user_id as a string (Graph's form);
// the flow prefers it over the numeric code-exchange fallback.
const happyPath: ReadonlyArray<Response> = [
  jsonResponse({ access_token: "short-tok", user_id: "17841441013510719" }),
  jsonResponse({ access_token: "long-tok", expires_in: 5184000 }),
  jsonResponse({
    user_id: "17841441013510719",
    username: "glocalx_ai",
    account_type: "BUSINESS",
  }),
]

describe("buildInstagramAuthorizeUrl", () => {
  it("targets Instagram's consent screen with the publish scopes and state", () => {
    const url = new URL(
      buildInstagramAuthorizeUrl(configuredEnv, {
        state: "state-123",
        redirectUri: "https://app.example/api/instagram/oauth/callback",
      })
    )

    expect(url.origin + url.pathname).toBe(
      "https://www.instagram.com/oauth/authorize"
    )
    expect(url.searchParams.get("client_id")).toBe("ig-app-id")
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example/api/instagram/oauth/callback"
    )
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("scope")).toBe(
      "instagram_business_basic,instagram_business_content_publish"
    )
    expect(url.searchParams.get("state")).toBe("state-123")
  })
})

describe("createProductionInstagramOAuth.connect", () => {
  it("blocks without printing secrets when credentials are missing", async () => {
    const adapter = createProductionInstagramOAuth({}, async () => {
      throw new Error("fetch must not run without credentials")
    })

    const result = await adapter.connect({ code: "c", redirectUri: "r" })

    expect(result).toEqual({
      kind: "blocked_by_credentials",
      code: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"],
    })
  })

  it("exchanges code -> long-lived token and links the professional account", async () => {
    const { fetchImpl, calls } = sequencedFetch(happyPath)
    const adapter = createProductionInstagramOAuth(configuredEnv, fetchImpl)

    const result = await adapter.connect({
      code: "auth-code",
      redirectUri: "https://app.example/cb",
    })

    expect(result).toEqual({
      kind: "ok",
      value: {
        kind: "linked",
        account: {
          accessToken: "long-tok",
          accountRef: "17841441013510719",
          username: "glocalx_ai",
          accountType: "BUSINESS",
          expiresInSeconds: 5184000,
        },
      },
    })

    // 1. code exchange POSTs the authorization_code grant as form-encoded body.
    expect(calls[0]?.url).toBe("https://api.instagram.com/oauth/access_token")
    expect(calls[0]?.init?.method).toBe("POST")
    const codeBody = new URLSearchParams(String(calls[0]?.init?.body))
    expect(codeBody.get("grant_type")).toBe("authorization_code")
    expect(codeBody.get("code")).toBe("auth-code")
    expect(codeBody.get("redirect_uri")).toBe("https://app.example/cb")
    expect(codeBody.get("client_secret")).toBe("ig-app-secret")

    // 2. long-lived exchange GETs graph.instagram.com with the short token.
    const longUrl = new URL(String(calls[1]?.url))
    expect(longUrl.origin + longUrl.pathname).toBe(
      "https://graph.instagram.com/access_token"
    )
    expect(longUrl.searchParams.get("grant_type")).toBe("ig_exchange_token")
    expect(longUrl.searchParams.get("access_token")).toBe("short-tok")

    // 3. identity GET carries the long token.
    const meUrl = new URL(String(calls[2]?.url))
    expect(meUrl.origin + meUrl.pathname).toBe("https://graph.instagram.com/me")
    expect(meUrl.searchParams.get("fields")).toBe(
      "user_id,username,account_type"
    )
    expect(meUrl.searchParams.get("access_token")).toBe("long-tok")
  })

  it("routes a personal account to the professional-account guidance", async () => {
    const { fetchImpl } = sequencedFetch([
      jsonResponse({ access_token: "short-tok", user_id: "1784100" }),
      jsonResponse({ access_token: "long-tok", expires_in: 5184000 }),
      jsonResponse({
        user_id: "1784100",
        username: "cozy_cafe",
        account_type: "PERSONAL",
      }),
    ])
    const adapter = createProductionInstagramOAuth(configuredEnv, fetchImpl)

    const result = await adapter.connect({ code: "c", redirectUri: "r" })

    expect(result).toEqual({
      kind: "ok",
      value: {
        kind: "needs_professional_account",
        username: "cozy_cafe",
        accountType: "PERSONAL",
      },
    })
  })

  it("maps a failed code exchange to CODE_EXCHANGE_FAILED", async () => {
    const { fetchImpl } = sequencedFetch([
      jsonResponse({ error_type: "OAuthException" }, 400),
    ])
    const adapter = createProductionInstagramOAuth(configuredEnv, fetchImpl)

    const result = await adapter.connect({ code: "bad", redirectUri: "r" })

    expect(result).toEqual({
      kind: "ok",
      value: { kind: "upstream_error", reason: "CODE_EXCHANGE_FAILED" },
    })
  })

  it("maps a failed long-lived exchange to LONG_LIVED_EXCHANGE_FAILED", async () => {
    const { fetchImpl } = sequencedFetch([
      jsonResponse({ access_token: "short-tok", user_id: "1" }),
      jsonResponse({ error: "nope" }, 400),
    ])
    const adapter = createProductionInstagramOAuth(configuredEnv, fetchImpl)

    const result = await adapter.connect({ code: "c", redirectUri: "r" })

    expect(result).toEqual({
      kind: "ok",
      value: { kind: "upstream_error", reason: "LONG_LIVED_EXCHANGE_FAILED" },
    })
  })

  it("maps a failed identity read to IDENTITY_FAILED", async () => {
    const { fetchImpl } = sequencedFetch([
      jsonResponse({ access_token: "short-tok", user_id: "1" }),
      jsonResponse({ access_token: "long-tok", expires_in: 5184000 }),
      jsonResponse({ error: "expired" }, 401),
    ])
    const adapter = createProductionInstagramOAuth(configuredEnv, fetchImpl)

    const result = await adapter.connect({ code: "c", redirectUri: "r" })

    expect(result).toEqual({
      kind: "ok",
      value: { kind: "upstream_error", reason: "IDENTITY_FAILED" },
    })
  })

  it("maps a network throw to NETWORK_ERROR", async () => {
    const { fetchImpl } = sequencedFetch([
      () => {
        throw new TypeError("network down")
      },
    ])
    const adapter = createProductionInstagramOAuth(configuredEnv, fetchImpl)

    const result = await adapter.connect({ code: "c", redirectUri: "r" })

    expect(result).toEqual({
      kind: "ok",
      value: { kind: "upstream_error", reason: "NETWORK_ERROR" },
    })
  })

  it("maps an unparsable body to MALFORMED_RESPONSE", async () => {
    const { fetchImpl } = sequencedFetch([
      new Response("<html>not json</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    ])
    const adapter = createProductionInstagramOAuth(configuredEnv, fetchImpl)

    const result = await adapter.connect({ code: "c", redirectUri: "r" })

    expect(result).toEqual({
      kind: "ok",
      value: { kind: "upstream_error", reason: "MALFORMED_RESPONSE" },
    })
  })
})

describe("createProductionInstagramOAuth.refresh", () => {
  it("returns the refreshed long-lived token", async () => {
    const { fetchImpl, calls } = sequencedFetch([
      jsonResponse({ access_token: "long-tok-2", expires_in: 5184000 }),
    ])
    const adapter = createProductionInstagramOAuth(configuredEnv, fetchImpl)

    const result = await adapter.refresh({ accessToken: "long-tok" })

    expect(result).toEqual({
      kind: "ok",
      value: {
        kind: "refreshed",
        accessToken: "long-tok-2",
        expiresInSeconds: 5184000,
      },
    })
    const refreshUrl = new URL(String(calls[0]?.url))
    expect(refreshUrl.origin + refreshUrl.pathname).toBe(
      "https://graph.instagram.com/refresh_access_token"
    )
    expect(refreshUrl.searchParams.get("grant_type")).toBe("ig_refresh_token")
    expect(refreshUrl.searchParams.get("access_token")).toBe("long-tok")
  })

  it("maps a failed refresh to REFRESH_FAILED", async () => {
    const { fetchImpl } = sequencedFetch([jsonResponse({ error: "x" }, 400)])
    const adapter = createProductionInstagramOAuth(configuredEnv, fetchImpl)

    const result = await adapter.refresh({ accessToken: "long-tok" })

    expect(result).toEqual({
      kind: "ok",
      value: { kind: "upstream_error", reason: "REFRESH_FAILED" },
    })
  })
})

describe("createStubInstagramOAuth", () => {
  it("links a deterministic business account for ordinary input", async () => {
    const result = await createStubInstagramOAuth().connect({
      code: "any",
      redirectUri: "r",
    })

    expect(result).toMatchObject({
      kind: "ok",
      value: {
        kind: "linked",
        account: { accountType: "BUSINESS", accountRef: "17841400000000000" },
      },
    })
  })

  it("drives the non-happy branches via sentinel codes", async () => {
    const stub = createStubInstagramOAuth()

    await expect(
      stub.connect({ code: "personal-account", redirectUri: "r" })
    ).resolves.toMatchObject({
      value: { kind: "needs_professional_account", accountType: "PERSONAL" },
    })

    await expect(
      stub.connect({ code: "oauth-fail", redirectUri: "r" })
    ).resolves.toEqual({
      kind: "ok",
      value: { kind: "upstream_error", reason: "CODE_EXCHANGE_FAILED" },
    })
  })

  it("refreshes deterministically and fails on the sentinel token", async () => {
    const stub = createStubInstagramOAuth()

    await expect(
      stub.refresh({ accessToken: "whatever" })
    ).resolves.toMatchObject({ value: { kind: "refreshed" } })

    await expect(
      stub.refresh({ accessToken: "refresh-fail" })
    ).resolves.toEqual({
      kind: "ok",
      value: { kind: "upstream_error", reason: "REFRESH_FAILED" },
    })
  })
})
