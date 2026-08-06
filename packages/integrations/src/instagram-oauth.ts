import { z } from "zod"

import { blockedByCredentials, missingEnvVars } from "./credentials"
import type {
  AdapterEnvironment,
  AdapterResult,
  ExternalFetch,
} from "./contracts"
import type {
  InstagramConnectInput,
  InstagramConnectOutcome,
  InstagramOAuthAdapter,
  InstagramOAuthUpstreamReason,
  InstagramRefreshInput,
  InstagramRefreshOutcome,
} from "./instagram-oauth-contracts"

// Instagram Business Login is a per-account grant (see instagram-oauth-contracts).
// The app id/secret here are the *Instagram* app credentials (not the Facebook
// app's), matching the graph.instagram.com publish path in instagram.ts.
export const instagramOAuthEnvVars = [
  "INSTAGRAM_APP_ID",
  "INSTAGRAM_APP_SECRET",
] as const

// Minimal scopes to read identity and publish. Comments/messaging scopes are
// deliberately excluded — this flow only exists to enable content publishing.
export const instagramOAuthScopes =
  "instagram_business_basic,instagram_business_content_publish"

const authorizeUrl = "https://www.instagram.com/oauth/authorize"
const codeExchangeUrl = "https://api.instagram.com/oauth/access_token"
const graphBaseUrl = "https://graph.instagram.com"

// A ~60-day long-lived token; surfaced so the caller can schedule a refresh
// before it lapses.
const longLivedTtlSeconds = 5_184_000

// Meta returns the Instagram user id as a JSON number in some responses and a
// string in others; normalize to the string the publish path stores.
const igUserIdSchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value))

const codeExchangeResponseSchema = z
  .object({ access_token: z.string().min(1), user_id: igUserIdSchema })
  .passthrough()

const longLivedResponseSchema = z
  .object({ access_token: z.string().min(1), expires_in: z.number() })
  .passthrough()

const identityResponseSchema = z
  .object({
    user_id: igUserIdSchema.optional(),
    username: z.string().optional(),
    account_type: z.string().optional(),
  })
  .passthrough()

const refreshResponseSchema = z
  .object({ access_token: z.string().min(1), expires_in: z.number() })
  .passthrough()

// Builds the hosted-consent URL the owner is redirected to. Pure and
// credential-agnostic (the start route blocks on missing creds before calling
// this); `redirectUri` must match the one used at code-exchange time.
export function buildInstagramAuthorizeUrl(
  env: AdapterEnvironment,
  input: { readonly state: string; readonly redirectUri: string }
): string {
  const url = new URL(authorizeUrl)
  url.searchParams.set("client_id", env["INSTAGRAM_APP_ID"] ?? "")
  url.searchParams.set("redirect_uri", input.redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", instagramOAuthScopes)
  url.searchParams.set("state", input.state)
  return url.toString()
}

type JsonRequestResult =
  | { readonly ok: true; readonly body: unknown }
  | { readonly ok: false; readonly reason: InstagramOAuthUpstreamReason }

// One transport helper for every step: a network throw and a non-2xx map to
// distinct reasons (the caller supplies the step-specific HTTP reason), and an
// unreadable body is a malformed response.
async function requestJson(
  fetchImpl: ExternalFetch,
  url: string,
  init: RequestInit,
  httpReason: InstagramOAuthUpstreamReason
): Promise<JsonRequestResult> {
  let response: Response
  try {
    response = await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    return { ok: false, reason: "NETWORK_ERROR" }
  }
  if (!response.ok) {
    return { ok: false, reason: httpReason }
  }
  try {
    return { ok: true, body: await response.json() }
  } catch {
    return { ok: false, reason: "MALFORMED_RESPONSE" }
  }
}

function upstream(
  reason: InstagramOAuthUpstreamReason
): AdapterResult<InstagramConnectOutcome> {
  return { kind: "ok", value: { kind: "upstream_error", reason } }
}

export function createProductionInstagramOAuth(
  env: AdapterEnvironment,
  fetchImpl: ExternalFetch
): InstagramOAuthAdapter {
  return {
    async connect(
      input: InstagramConnectInput
    ): Promise<AdapterResult<InstagramConnectOutcome>> {
      const missing = missingEnvVars(env, instagramOAuthEnvVars)
      if (missing.length > 0) {
        return blockedByCredentials(missing)
      }
      const clientId = env["INSTAGRAM_APP_ID"] ?? ""
      const clientSecret = env["INSTAGRAM_APP_SECRET"] ?? ""

      // 1. authorization code -> short-lived Instagram user token (+ user id)
      const codeResult = await requestJson(
        fetchImpl,
        codeExchangeUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "authorization_code",
            redirect_uri: input.redirectUri,
            code: input.code,
          }).toString(),
        },
        "CODE_EXCHANGE_FAILED"
      )
      if (!codeResult.ok) {
        return upstream(codeResult.reason)
      }
      const shortLived = codeExchangeResponseSchema.safeParse(codeResult.body)
      if (!shortLived.success) {
        return upstream("MALFORMED_RESPONSE")
      }

      // 2. short-lived -> long-lived (~60 day) token
      const longLivedUrl = new URL(`${graphBaseUrl}/access_token`)
      longLivedUrl.searchParams.set("grant_type", "ig_exchange_token")
      longLivedUrl.searchParams.set("client_secret", clientSecret)
      longLivedUrl.searchParams.set(
        "access_token",
        shortLived.data.access_token
      )
      const longResult = await requestJson(
        fetchImpl,
        longLivedUrl.toString(),
        { method: "GET" },
        "LONG_LIVED_EXCHANGE_FAILED"
      )
      if (!longResult.ok) {
        return upstream(longResult.reason)
      }
      const longLived = longLivedResponseSchema.safeParse(longResult.body)
      if (!longLived.success) {
        return upstream("MALFORMED_RESPONSE")
      }

      // 3. identity — proves the token works and gates on account type
      const identityUrl = new URL(`${graphBaseUrl}/me`)
      identityUrl.searchParams.set("fields", "user_id,username,account_type")
      identityUrl.searchParams.set("access_token", longLived.data.access_token)
      const identityResult = await requestJson(
        fetchImpl,
        identityUrl.toString(),
        { method: "GET" },
        "IDENTITY_FAILED"
      )
      if (!identityResult.ok) {
        return upstream(identityResult.reason)
      }
      const identity = identityResponseSchema.safeParse(identityResult.body)
      if (!identity.success) {
        return upstream("MALFORMED_RESPONSE")
      }

      const accountType = identity.data.account_type ?? ""
      // Only Business/Creator accounts can publish; a personal account routes to
      // the owner-facing "switch to professional" guidance, not an error.
      if (accountType.toUpperCase() === "PERSONAL") {
        return {
          kind: "ok",
          value: {
            kind: "needs_professional_account",
            username: identity.data.username,
            accountType,
          },
        }
      }

      const accountRef = identity.data.user_id ?? shortLived.data.user_id
      return {
        kind: "ok",
        value: {
          kind: "linked",
          account: {
            accessToken: longLived.data.access_token,
            accountRef,
            username: identity.data.username ?? "",
            accountType,
            expiresInSeconds: longLived.data.expires_in,
          },
        },
      }
    },

    async refresh(
      input: InstagramRefreshInput
    ): Promise<AdapterResult<InstagramRefreshOutcome>> {
      // ig_refresh_token needs only the long-lived token, no app secret, so
      // there is no credential gate here.
      const refreshUrl = new URL(`${graphBaseUrl}/refresh_access_token`)
      refreshUrl.searchParams.set("grant_type", "ig_refresh_token")
      refreshUrl.searchParams.set("access_token", input.accessToken)
      const result = await requestJson(
        fetchImpl,
        refreshUrl.toString(),
        { method: "GET" },
        "REFRESH_FAILED"
      )
      if (!result.ok) {
        return {
          kind: "ok",
          value: { kind: "upstream_error", reason: result.reason },
        }
      }
      const parsed = refreshResponseSchema.safeParse(result.body)
      if (!parsed.success) {
        return {
          kind: "ok",
          value: { kind: "upstream_error", reason: "MALFORMED_RESPONSE" },
        }
      }
      return {
        kind: "ok",
        value: {
          kind: "refreshed",
          accessToken: parsed.data.access_token,
          expiresInSeconds: parsed.data.expires_in,
        },
      }
    },
  }
}

// Deterministic connect/refresh for stub mode and tests. Sentinel `code` values
// drive the non-happy branches so the onboarding flow can be demoed end to end
// without Meta: `oauth-fail` -> upstream error, `personal-account` -> the
// professional-account guidance.
export function createStubInstagramOAuth(): InstagramOAuthAdapter {
  return {
    async connect(input) {
      if (input.code === "oauth-fail") {
        return upstream("CODE_EXCHANGE_FAILED")
      }
      if (input.code === "personal-account") {
        return {
          kind: "ok",
          value: {
            kind: "needs_professional_account",
            username: "stub_personal",
            accountType: "PERSONAL",
          },
        }
      }
      return {
        kind: "ok",
        value: {
          kind: "linked",
          account: {
            accessToken: "stub-instagram-long-lived-token",
            accountRef: "17841400000000000",
            username: "stub_business",
            accountType: "BUSINESS",
            expiresInSeconds: longLivedTtlSeconds,
          },
        },
      }
    },

    async refresh(input) {
      if (input.accessToken === "refresh-fail") {
        return {
          kind: "ok",
          value: { kind: "upstream_error", reason: "REFRESH_FAILED" },
        }
      }
      return {
        kind: "ok",
        value: {
          kind: "refreshed",
          accessToken: "stub-instagram-long-lived-token",
          expiresInSeconds: longLivedTtlSeconds,
        },
      }
    },
  }
}
