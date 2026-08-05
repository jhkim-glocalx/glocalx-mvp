import { describe, expect, it } from "vitest"

import type { ExternalFetch } from "./contracts"
import {
  GoogleOrgTokenError,
  createGoogleOrgTokenProvider,
  resolveGoogleOrgAccountName,
} from "./google-org-auth"

const configuredEnv = {
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  GOOGLE_ORG_REFRESH_TOKEN: "refresh-token",
  GOOGLE_BUSINESS_ACCOUNT_ID: "117964535166689865393",
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("resolveGoogleOrgAccountName", () => {
  it("qualifies a bare account id into the accounts/{id} resource name", () => {
    expect(resolveGoogleOrgAccountName(configuredEnv)).toBe(
      "accounts/117964535166689865393"
    )
  })

  it("passes through an already-qualified resource name", () => {
    expect(
      resolveGoogleOrgAccountName({
        GOOGLE_BUSINESS_ACCOUNT_ID: "accounts/117964535166689865393",
      })
    ).toBe("accounts/117964535166689865393")
  })

  it("returns undefined when unset or still a placeholder", () => {
    expect(resolveGoogleOrgAccountName({})).toBeUndefined()
    expect(
      resolveGoogleOrgAccountName({
        GOOGLE_BUSINESS_ACCOUNT_ID: "replace-with-account-id",
      })
    ).toBeUndefined()
  })
})

describe("createGoogleOrgTokenProvider", () => {
  it("exchanges the refresh token for an access token", async () => {
    let capturedUrl: string | undefined
    let capturedBody: string | undefined
    const fetchImpl: ExternalFetch = async (url, init) => {
      capturedUrl = url
      capturedBody = init?.body?.toString()
      return jsonResponse({
        access_token: "org-access-token",
        expires_in: 3599,
      })
    }

    const result = await createGoogleOrgTokenProvider(
      configuredEnv,
      fetchImpl
    ).getAccessToken()

    expect(result).toEqual({
      kind: "ok",
      value: { accessToken: "org-access-token" },
    })
    expect(capturedUrl).toBe("https://oauth2.googleapis.com/token")
    expect(capturedBody).toContain("grant_type=refresh_token")
    expect(capturedBody).toContain("refresh_token=refresh-token")
    expect(capturedBody).toContain("client_secret=client-secret")
  })

  it("blocks with the missing env var names when credentials are absent", async () => {
    const fetchImpl: ExternalFetch = async () => {
      throw new Error("fetch should not run when credentials are missing")
    }

    const result = await createGoogleOrgTokenProvider(
      { GOOGLE_CLIENT_ID: "client-id" },
      fetchImpl
    ).getAccessToken()

    expect(result).toEqual({
      kind: "blocked_by_credentials",
      code: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: ["GOOGLE_CLIENT_SECRET", "GOOGLE_ORG_REFRESH_TOKEN"],
    })
  })

  it("throws GoogleOrgTokenError when the exchange is rejected", async () => {
    const fetchImpl: ExternalFetch = async () =>
      jsonResponse({ error: "invalid_grant" }, 400)

    await expect(
      createGoogleOrgTokenProvider(configuredEnv, fetchImpl).getAccessToken()
    ).rejects.toBeInstanceOf(GoogleOrgTokenError)
  })
})
