import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import {
  buildKakaoOAuthAuthorizationUrl,
  kakaoOAuthStateCookieName,
  kakaoOAuthStateCookieOptions,
  missingKakaoOAuthEnvVars,
} from "@/auth/kakao-oauth"
import type { AdapterEnvironment } from "@/integrations/contracts"

export function getKakaoRedirectUri(
  request: NextRequest,
  env: AdapterEnvironment
): string {
  const configuredRedirectUri = env["KAKAO_REDIRECT_URI"]?.trim()
  if (configuredRedirectUri) {
    return configuredRedirectUri
  }
  return new URL("/api/auth/kakao/callback", request.nextUrl.origin).toString()
}

export async function POST(request: NextRequest) {
  const missingEnvVars = missingKakaoOAuthEnvVars(process.env)
  if (missingEnvVars.length > 0) {
    return Response.json(
      {
        code: "BLOCKED_BY_CREDENTIALS",
        missingEnvVars,
        message: "Kakao OAuth credentials are not configured.",
      },
      { status: 500 }
    )
  }

  const state = crypto.randomUUID()
  const authorizationUrl = buildKakaoOAuthAuthorizationUrl({
    clientId: process.env["KAKAO_REST_API_KEY"]?.trim() ?? "",
    redirectUri: getKakaoRedirectUri(request, process.env),
    state,
  })

  const response = new NextResponse(null, {
    headers: {
      Location: authorizationUrl.toString(),
    },
    status: 303,
  })
  response.cookies.set(
    kakaoOAuthStateCookieName,
    state,
    kakaoOAuthStateCookieOptions
  )
  return response
}
