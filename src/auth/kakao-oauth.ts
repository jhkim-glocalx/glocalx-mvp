import type { AdapterEnvironment } from "@/integrations/contracts"

const kakaoOAuthEndpoint = "https://kauth.kakao.com/oauth/authorize"
const kakaoOAuthEnvVars = ["KAKAO_REST_API_KEY"] as const

export const kakaoOAuthStateCookieName = "glocalx_kakao_oauth_state"
export const kakaoOAuthStateCookieOptions = {
  httpOnly: true,
  maxAge: 60 * 10,
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
} as const
export const expiredKakaoOAuthStateCookieOptions = {
  ...kakaoOAuthStateCookieOptions,
  maxAge: 0,
} as const

type KakaoOAuthAuthorizationUrlOptions = {
  readonly clientId: string
  readonly redirectUri: string
  readonly state: string
}

type KakaoOAuthCallbackOptions = {
  readonly code: string
  readonly expectedState: string
  readonly state: string
}

function isConfiguredEnvValue(value: string | undefined): boolean {
  const trimmedValue = value?.trim()
  return Boolean(trimmedValue && !trimmedValue.startsWith("replace-with-"))
}

export function missingKakaoOAuthEnvVars(
  env: AdapterEnvironment
): readonly string[] {
  return kakaoOAuthEnvVars.filter((name) => !isConfiguredEnvValue(env[name]))
}

export function buildKakaoOAuthAuthorizationUrl(
  options: KakaoOAuthAuthorizationUrlOptions
): URL {
  const authorizationUrl = new URL(kakaoOAuthEndpoint)
  authorizationUrl.searchParams.set("client_id", options.clientId)
  authorizationUrl.searchParams.set("redirect_uri", options.redirectUri)
  authorizationUrl.searchParams.set("response_type", "code")
  authorizationUrl.searchParams.set("state", options.state)
  return authorizationUrl
}

export function isValidKakaoOAuthCallback(
  options: KakaoOAuthCallbackOptions
): boolean {
  return (
    options.code.trim() !== "" &&
    options.state.trim() !== "" &&
    options.expectedState.trim() !== "" &&
    options.state === options.expectedState
  )
}
