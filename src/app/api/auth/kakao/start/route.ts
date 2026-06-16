import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  demoStoreId,
  demoUserId,
  ensureDemoOwnerStore,
  getStoredSessionFromCookieValues,
  sessionCookieOptions,
} from "@/auth/session"
import {
  buildKakaoOAuthAuthorizationUrl,
  getKakaoRedirectUri,
  kakaoOAuthStateCookieName,
  kakaoOAuthStateCookieOptions,
  missingKakaoOAuthEnvVars,
} from "@/auth/kakao-oauth"
import type { AdapterEnvironment } from "@/integrations/contracts"

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.toLowerCase() === "localhost"
  )
}

function shouldUseDemoFallback(
  request: NextRequest,
  env: AdapterEnvironment
): boolean {
  return (
    env["APP_INTEGRATION_MODE"] === "stub" ||
    env["NODE_ENV"] !== "production" ||
    isLoopbackHost(request.nextUrl.hostname)
  )
}

function createDemoSessionRedirect(): NextResponse {
  ensureDemoOwnerStore()

  const session = getStoredSessionFromCookieValues({
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

  response.cookies.set(demoSessionCookieName, demoUserId, sessionCookieOptions)
  response.cookies.set(demoStoreCookieName, demoStoreId, sessionCookieOptions)

  return response
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
  if (process.env["APP_INTEGRATION_MODE"] === "stub") {
    return createDemoSessionRedirect()
  }

  const missingEnvVars = missingKakaoOAuthEnvVars(process.env)
  if (missingEnvVars.length > 0) {
    if (shouldUseDemoFallback(request, process.env)) {
      return createDemoSessionRedirect()
    }

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
  response.cookies.set(
    kakaoOAuthStateCookieName,
    state,
    kakaoOAuthStateCookieOptions
  )
  return response
}
