import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import {
  buildGoogleOAuthAuthorizationUrl,
  getGoogleRedirectUri,
  missingGoogleOAuthEnvVars,
} from "@/auth/google-oauth"
import { missingTokenEncryptionEnvVars } from "@/auth/token-encryption"
import { hasSameRequestOrigin } from "@/auth/request-origin"
import {
  googleOAuthStateCookieName,
  googleOAuthStateCookieOptions,
} from "@/gbp/oauth-callback"

export async function POST(request: NextRequest) {
  if (!hasSameRequestOrigin(request)) {
    return new NextResponse(null, {
      headers: { Location: "/?auth_error=invalid_request" },
      status: 303,
    })
  }

  if (
    missingGoogleOAuthEnvVars(process.env).length > 0 ||
    missingTokenEncryptionEnvVars(process.env).length > 0
  ) {
    return new NextResponse(null, {
      headers: { Location: "/?auth_error=google_config" },
      status: 303,
    })
  }

  const state = crypto.randomUUID()
  const authorizationUrl = buildGoogleOAuthAuthorizationUrl({
    clientId: process.env["GOOGLE_CLIENT_ID"]?.trim() ?? "",
    redirectUri: getGoogleRedirectUri(request, process.env),
    state,
  })
  const response = new NextResponse(null, {
    headers: {
      Location: authorizationUrl.toString(),
    },
    status: 303,
  })
  response.cookies.set(
    googleOAuthStateCookieName,
    state,
    googleOAuthStateCookieOptions
  )
  return response
}
