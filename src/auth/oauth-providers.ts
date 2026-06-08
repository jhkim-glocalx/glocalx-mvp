import type { OAuthIdentityProfile } from "./oauth-identity"

export type OAuthFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response>

export const googleOAuthTokenEndpoint = "https://oauth2.googleapis.com/token"
export const googleOAuthUserInfoEndpoint =
  "https://www.googleapis.com/oauth2/v3/userinfo"
export const kakaoOAuthTokenEndpoint = "https://kauth.kakao.com/oauth/token"
export const kakaoOAuthUserInfoEndpoint = "https://kapi.kakao.com/v2/user/me"

type GoogleOAuthProfileOptions = {
  readonly clientId: string
  readonly clientSecret: string
  readonly code: string
  readonly fetchImpl?: OAuthFetch
  readonly now?: Date
  readonly redirectUri: string
}

type KakaoOAuthProfileOptions = {
  readonly clientId: string
  readonly clientSecret?: string
  readonly code: string
  readonly fetchImpl?: OAuthFetch
  readonly now?: Date
  readonly redirectUri: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readRequiredString(
  payload: Record<string, unknown>,
  field: string,
  provider: string
): string {
  const value = payload[field]
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${provider} OAuth response is missing ${field}.`)
  }
  return value
}

function readOptionalString(
  payload: Record<string, unknown>,
  field: string
): string | undefined {
  const value = payload[field]
  if (typeof value !== "string" || value.trim() === "") {
    return undefined
  }
  return value
}

function readOptionalNumber(
  payload: Record<string, unknown>,
  field: string
): number | undefined {
  const value = payload[field]
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined
  }
  return value
}

function splitScopes(scope: string | undefined): readonly string[] {
  if (scope === undefined) {
    return []
  }
  return scope.split(" ").filter((value) => value.trim() !== "")
}

function expiresAtFromSeconds(
  expiresIn: number | undefined,
  now: Date
): string | undefined {
  if (expiresIn === undefined) {
    return undefined
  }
  return new Date(now.getTime() + expiresIn * 1000).toISOString()
}

async function readJsonResponse(
  response: Response,
  provider: string,
  action: string
): Promise<Record<string, unknown>> {
  if (!response.ok) {
    throw new Error(
      `${provider} OAuth ${action} failed with ${response.status}.`
    )
  }

  const payload: unknown = await response.json()
  if (!isRecord(payload)) {
    throw new Error(`${provider} OAuth ${action} returned invalid JSON.`)
  }
  return payload
}

async function postForm(
  fetchImpl: OAuthFetch,
  url: string,
  body: URLSearchParams,
  provider: string
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(url, {
    body,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    method: "POST",
  })
  return readJsonResponse(response, provider, "token exchange")
}

async function getWithBearerToken(
  fetchImpl: OAuthFetch,
  url: string,
  accessToken: string,
  provider: string
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    method: "GET",
  })
  return readJsonResponse(response, provider, "profile fetch")
}

export async function fetchGoogleOAuthProfile(
  options: GoogleOAuthProfileOptions
): Promise<OAuthIdentityProfile> {
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? new Date()
  const tokenPayload = await postForm(
    fetchImpl,
    googleOAuthTokenEndpoint,
    new URLSearchParams({
      client_id: options.clientId,
      client_secret: options.clientSecret,
      code: options.code,
      grant_type: "authorization_code",
      redirect_uri: options.redirectUri,
    }),
    "Google"
  )
  const accessToken = readRequiredString(tokenPayload, "access_token", "Google")
  const profilePayload = await getWithBearerToken(
    fetchImpl,
    googleOAuthUserInfoEndpoint,
    accessToken,
    "Google"
  )
  const subjectId = readRequiredString(profilePayload, "sub", "Google")
  const displayName =
    readOptionalString(profilePayload, "name") ??
    readOptionalString(profilePayload, "email") ??
    "Google User"
  const expiresAt = expiresAtFromSeconds(
    readOptionalNumber(tokenPayload, "expires_in"),
    now
  )
  const email = readOptionalString(profilePayload, "email")
  const refreshToken = readOptionalString(tokenPayload, "refresh_token")

  return {
    accessToken,
    displayName,
    provider: "GOOGLE",
    scopes: splitScopes(readOptionalString(tokenPayload, "scope")),
    subjectId,
    ...(email === undefined ? {} : { email }),
    ...(expiresAt === undefined ? {} : { expiresAt }),
    ...(refreshToken === undefined ? {} : { refreshToken }),
  }
}

export async function fetchKakaoOAuthProfile(
  options: KakaoOAuthProfileOptions
): Promise<OAuthIdentityProfile> {
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? new Date()
  const form = new URLSearchParams({
    client_id: options.clientId,
    code: options.code,
    grant_type: "authorization_code",
    redirect_uri: options.redirectUri,
  })
  if (
    options.clientSecret !== undefined &&
    options.clientSecret.trim() !== ""
  ) {
    form.set("client_secret", options.clientSecret)
  }

  const tokenPayload = await postForm(
    fetchImpl,
    kakaoOAuthTokenEndpoint,
    form,
    "Kakao"
  )
  const accessToken = readRequiredString(tokenPayload, "access_token", "Kakao")
  const profilePayload = await getWithBearerToken(
    fetchImpl,
    kakaoOAuthUserInfoEndpoint,
    accessToken,
    "Kakao"
  )
  const subjectValue = profilePayload["id"]
  if (
    (typeof subjectValue !== "number" || !Number.isFinite(subjectValue)) &&
    (typeof subjectValue !== "string" || subjectValue.trim() === "")
  ) {
    throw new Error("Kakao OAuth response is missing id.")
  }

  const kakaoAccount = profilePayload["kakao_account"]
  const accountRecord = isRecord(kakaoAccount) ? kakaoAccount : {}
  const profileRecord = isRecord(accountRecord["profile"])
    ? accountRecord["profile"]
    : {}
  const displayName =
    readOptionalString(profileRecord, "nickname") ??
    readOptionalString(accountRecord, "email") ??
    "Kakao User"
  const expiresAt = expiresAtFromSeconds(
    readOptionalNumber(tokenPayload, "expires_in"),
    now
  )
  const email = readOptionalString(accountRecord, "email")
  const refreshToken = readOptionalString(tokenPayload, "refresh_token")

  return {
    accessToken,
    displayName,
    provider: "KAKAO",
    scopes: splitScopes(readOptionalString(tokenPayload, "scope")),
    subjectId: String(subjectValue),
    ...(email === undefined ? {} : { email }),
    ...(expiresAt === undefined ? {} : { expiresAt }),
    ...(refreshToken === undefined ? {} : { refreshToken }),
  }
}
