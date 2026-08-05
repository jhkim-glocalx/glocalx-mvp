import { z } from "zod"

import { blockedByCredentials, missingEnvVars } from "./credentials"
import type {
  AdapterEnvironment,
  AdapterResult,
  ExternalFetch,
} from "./contracts"

// Org-account GBP model: one GlocalX-managed Google account (with manager
// access to every store's location) supplies the token for all GBP writes.
// A long-lived refresh token is issued once out-of-band and stored as an env
// secret; the server exchanges it for short-lived access tokens on demand. No
// per-owner Google OAuth is threaded through the setup/publish paths.
export const googleOrgAuthEnvVars = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_ORG_REFRESH_TOKEN",
] as const

const googleTokenEndpoint = "https://oauth2.googleapis.com/token"

const tokenResponseSchema = z
  .object({ access_token: z.string().min(1) })
  .passthrough()

export type GoogleOrgAccessToken = { readonly accessToken: string }

export interface GoogleOrgTokenProvider {
  getAccessToken(): Promise<AdapterResult<GoogleOrgAccessToken>>
}

// Thrown when credentials are present but the refresh exchange itself fails
// (revoked/expired refresh token, wrong client secret, upstream outage). The
// caller distinguishes this from a missing-credential block so the owner sees
// "reconnect" rather than "not configured".
export class GoogleOrgTokenError extends Error {
  readonly name = "GoogleOrgTokenError"

  constructor(readonly status: number | undefined = undefined) {
    super(
      status === undefined
        ? "Google org token refresh failed."
        : `Google org token refresh failed with ${status}.`
    )
  }
}

// GOOGLE_BUSINESS_ACCOUNT_ID may be given as a bare id or already-qualified
// "accounts/{id}" resource name; both normalize to the resource name the GBP
// APIs expect. Returns undefined when unset or still a placeholder so the
// setup path can block on it exactly like a missing credential.
export function resolveGoogleOrgAccountName(
  env: AdapterEnvironment
): string | undefined {
  const raw = env["GOOGLE_BUSINESS_ACCOUNT_ID"]?.trim()
  if (raw === undefined || raw === "" || raw.startsWith("replace-with-")) {
    return undefined
  }
  return raw.startsWith("accounts/") ? raw : `accounts/${raw}`
}

export function createGoogleOrgTokenProvider(
  env: AdapterEnvironment,
  fetchImpl: ExternalFetch
): GoogleOrgTokenProvider {
  return {
    async getAccessToken() {
      const missing = missingEnvVars(env, googleOrgAuthEnvVars)
      if (missing.length > 0) {
        return blockedByCredentials(missing)
      }

      const response = await fetchImpl(googleTokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env["GOOGLE_CLIENT_ID"] ?? "",
          client_secret: env["GOOGLE_CLIENT_SECRET"] ?? "",
          refresh_token: env["GOOGLE_ORG_REFRESH_TOKEN"] ?? "",
          grant_type: "refresh_token",
        }).toString(),
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) {
        throw new GoogleOrgTokenError(response.status)
      }

      const payload = tokenResponseSchema.parse(await response.json())
      return { kind: "ok", value: { accessToken: payload.access_token } }
    },
  }
}
