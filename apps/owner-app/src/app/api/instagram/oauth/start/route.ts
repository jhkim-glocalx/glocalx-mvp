import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { buildInstagramAuthorizeUrl } from "@glocalx/integrations/instagram-oauth"

import { hasSameRequestOrigin } from "@/auth/request-origin"
import { missingTokenEncryptionEnvVars } from "@/auth/token-encryption"
import {
  encodeInstagramOAuthState,
  getInstagramOAuthRedirectUri,
  instagramConnectRedirectLocation,
  instagramOAuthStateCookieName,
  instagramOAuthStateCookieOptions,
  missingInstagramOAuthEnvVars,
  stubInstagramConnectCode,
} from "@/instagram/oauth-link"
import { readDatabaseSession, withQueryableRouteDatabase } from "@/server/http"

function redirectToOnboardingError(): NextResponse {
  return new NextResponse(null, {
    headers: { Location: instagramConnectRedirectLocation("error") },
    status: 303,
  })
}

export async function POST(request: NextRequest) {
  // Same-origin guard: this POST starts a state-changing OAuth flow, so reject
  // cross-site form submissions before touching the session.
  if (!hasSameRequestOrigin(request)) {
    return redirectToOnboardingError()
  }

  return withQueryableRouteDatabase(async ({ adapters, sessionStore }) => {
    const session = await readDatabaseSession(request, sessionStore)
    if (session === undefined || session.storeId === "") {
      // Linking requires an authenticated owner with a resolved store; an
      // unauthenticated caller goes back to the entry point, not onboarding.
      return new NextResponse(null, {
        headers: { Location: "/" },
        status: 303,
      })
    }

    const nonce = crypto.randomUUID()
    const stateCookieValue = encodeInstagramOAuthState({
      nonce,
      storeId: session.storeId,
    })

    // Stub mode stays fully demoable: skip the Meta hop and drive our own
    // callback with a deterministic code so the stub adapter links the store
    // end-to-end with no external redirect or real credentials.
    if (adapters.mode !== "production") {
      const response = new NextResponse(null, {
        headers: {
          Location: `/api/instagram/oauth/callback?code=${encodeURIComponent(
            stubInstagramConnectCode
          )}&state=${encodeURIComponent(nonce)}`,
        },
        status: 303,
      })
      response.cookies.set(
        instagramOAuthStateCookieName,
        stateCookieValue,
        instagramOAuthStateCookieOptions
      )
      return response
    }

    // Production needs real credentials before it can build a valid authorize
    // URL or encrypt the token the callback will store.
    if (
      missingInstagramOAuthEnvVars(process.env).length > 0 ||
      missingTokenEncryptionEnvVars(process.env).length > 0
    ) {
      return redirectToOnboardingError()
    }

    const authorizeUrl = buildInstagramAuthorizeUrl(process.env, {
      state: nonce,
      redirectUri: getInstagramOAuthRedirectUri(request, process.env),
    })
    const response = new NextResponse(null, {
      headers: { Location: authorizeUrl },
      status: 303,
    })
    response.cookies.set(
      instagramOAuthStateCookieName,
      stateCookieValue,
      instagramOAuthStateCookieOptions
    )
    return response
  })
}
