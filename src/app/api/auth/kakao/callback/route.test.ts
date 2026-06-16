import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { kakaoOAuthStateCookieName } from "@/auth/kakao-oauth"
import {
  upsertOAuthIdentity,
  type OAuthIdentityProfile,
} from "@/auth/oauth-identity"
import { fetchKakaoOAuthProfile } from "@/auth/oauth-providers"
import type * as OAuthProvidersModule from "@/auth/oauth-providers"
import { onboardingCompleteCookieName } from "@/auth/session"
import { applyMigrations, openDatabase } from "@/server/db/sqlite"
import { GET } from "./route"

vi.mock("@/auth/oauth-providers", async (importOriginal) => {
  const actual = await importOriginal<typeof OAuthProvidersModule>()
  return {
    ...actual,
    fetchKakaoOAuthProfile: vi.fn(),
  }
})

const kakaoProfile: OAuthIdentityProfile = {
  accessToken: "test-kakao-access-token",
  displayName: "Kakao Owner",
  email: "owner@example.com",
  expiresAt: "2026-06-04T01:00:00.000Z",
  provider: "KAKAO",
  refreshToken: "test-kakao-refresh-token",
  scopes: ["profile_nickname", "account_email"],
  subjectId: "kakao-subject-task-4",
}

const mockedFetchKakaoOAuthProfile = vi.mocked(fetchKakaoOAuthProfile)
const tempPaths: string[] = []

async function createDatabasePath(): Promise<string> {
  const tempPath = await mkdtemp(join(tmpdir(), "glocalx-kakao-callback-"))
  tempPaths.push(tempPath)
  const databasePath = join(tempPath, "auth.db")
  const database = openDatabase(databasePath)
  applyMigrations(database)
  database.close()
  return databasePath
}

function configureEnv(databasePath: string): void {
  vi.stubEnv("GLOCALX_DB_PATH", databasePath)
  vi.stubEnv("KAKAO_REST_API_KEY", "test-rest-api-key")
  vi.stubEnv("KAKAO_REDIRECT_URI", "http://localhost:3000/api/auth/kakao/callback")
}

function createCookieHeader(cookies: Readonly<Record<string, string>>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("; ")
}

function createKakaoCallbackRequest(options: {
  readonly code?: string
  readonly cookies?: Readonly<Record<string, string>>
  readonly state?: string
}): NextRequest {
  const url = new URL("http://localhost:3000/api/auth/kakao/callback")
  if (options.code !== undefined) {
    url.searchParams.set("code", options.code)
  }
  if (options.state !== undefined) {
    url.searchParams.set("state", options.state)
  }

  const headers = new Headers()
  if (options.cookies !== undefined) {
    headers.set("Cookie", createCookieHeader(options.cookies))
  }
  return new NextRequest(url, { headers, method: "GET" })
}

function completeExistingStore(
  databasePath: string,
  profile: OAuthIdentityProfile
): void {
  const database = openDatabase(databasePath)
  try {
    const session = upsertOAuthIdentity(
      database,
      profile,
      new Date("2026-06-04T00:00:00.000Z")
    )
    database
      .prepare("UPDATE stores SET onboarding_status = ? WHERE id = ?")
      .run("COMPLETED", session.storeId)
  } finally {
    database.close()
  }
}

afterEach(async () => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()

  for (const tempPath of tempPaths) {
    await rm(tempPath, { force: true, recursive: true })
  }
  tempPaths.length = 0
})

describe("Kakao OAuth callback route", () => {
  it("redirects new incomplete identities to onboarding when a stale completion cookie is present", async () => {
    const databasePath = await createDatabasePath()
    configureEnv(databasePath)
    mockedFetchKakaoOAuthProfile.mockResolvedValue(kakaoProfile)

    const response = await GET(
      createKakaoCallbackRequest({
        code: "test-code",
        cookies: {
          [kakaoOAuthStateCookieName]: "valid-kakao-state",
          [onboardingCompleteCookieName]: "true",
        },
        state: "valid-kakao-state",
      })
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("/onboarding")
    expect(mockedFetchKakaoOAuthProfile).toHaveBeenCalledTimes(1)
  })

  it("redirects existing completed identities to app", async () => {
    const databasePath = await createDatabasePath()
    configureEnv(databasePath)
    completeExistingStore(databasePath, kakaoProfile)
    mockedFetchKakaoOAuthProfile.mockResolvedValue(kakaoProfile)

    const response = await GET(
      createKakaoCallbackRequest({
        code: "test-code",
        cookies: {
          [kakaoOAuthStateCookieName]: "valid-kakao-state",
        },
        state: "valid-kakao-state",
      })
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("/app")
  })

  it("redirects missing state to the Kakao auth error without provider calls", async () => {
    const databasePath = await createDatabasePath()
    configureEnv(databasePath)

    const response = await GET(
      createKakaoCallbackRequest({
        code: "test-code",
        cookies: {
          [kakaoOAuthStateCookieName]: "valid-kakao-state",
        },
      })
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("/?auth_error=kakao_state")
    expect(mockedFetchKakaoOAuthProfile).not.toHaveBeenCalled()
  })

  it("redirects mismatched state to the Kakao auth error without provider calls", async () => {
    const databasePath = await createDatabasePath()
    configureEnv(databasePath)

    const response = await GET(
      createKakaoCallbackRequest({
        code: "test-code",
        cookies: {
          [kakaoOAuthStateCookieName]: "valid-kakao-state",
        },
        state: "tampered-kakao-state",
      })
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("/?auth_error=kakao_state")
    expect(mockedFetchKakaoOAuthProfile).not.toHaveBeenCalled()
  })
})
