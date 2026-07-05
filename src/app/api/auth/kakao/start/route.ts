import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  demoStoreId,
  demoUserId,
  sessionCookieOptions,
} from "@/auth/session"
import {
  buildKakaoOAuthAuthorizationUrl,
  getKakaoRedirectUri,
  kakaoOAuthStateCookieName,
  kakaoOAuthStateCookieOptions,
  missingKakaoOAuthEnvVars,
} from "@/auth/kakao-oauth"
import { withQueryableRouteDatabase } from "@/server/http"

async function createDemoSessionRedirect(): Promise<NextResponse> {
  return withQueryableRouteDatabase(async ({ sessionStore }) => {
    const session = await sessionStore.readSessionFromCookieValues({
      onboardingComplete: undefined,
      storeId: demoStoreId,
      userId: demoUserId,
    })
    const onboardingComplete = session?.onboardingComplete ?? false
    const response = new NextResponse(null, {
      headers: {
        Location: onboardingComplete ? "/app" : "/onboarding",
      },
      status: 303,
    })

    response.cookies.set(
      demoSessionCookieName,
      demoUserId,
      sessionCookieOptions
    )
    response.cookies.set(demoStoreCookieName, demoStoreId, sessionCookieOptions)

    return response
  })
}

function createKakaoConfigErrorRedirect(): NextResponse {
  return new NextResponse(null, {
    headers: {
      Location: "/?auth_error=kakao_config",
    },
    status: 303,
  })
}

export async function POST(request: NextRequest) {
  // Stub mode bypasses Kakao config so local demos do not depend on credentials.
  if (process.env["APP_INTEGRATION_MODE"] === "stub") {
    return await createDemoSessionRedirect()
  }

  const missingEnvVars = missingKakaoOAuthEnvVars(process.env)
  if (missingEnvVars.length > 0) {
    return createKakaoConfigErrorRedirect()
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
  // Provider state is separate from app session cookies and must match later.
  response.cookies.set(
    kakaoOAuthStateCookieName,
    state,
    kakaoOAuthStateCookieOptions
  )
  return response
}
