import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

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
  emailVerified: true,
  expiresAt: "2026-06-04T01:00:00.000Z",
  provider: "KAKAO",
  refreshToken: "test-kakao-refresh-token",
  scopes: ["profile_nickname", "account_email"],
  subjectId: "kakao-subject-task-4",
}

const mockedFetchKakaoOAuthProfile = vi.mocked(fetchKakaoOAuthProfile)
const tempPaths: string[] = []
const routeEnvKeys = ["TOKEN_ENCRYPTION_KEY"] as const
type RouteEnvKey = (typeof routeEnvKeys)[number]
const originalRouteEnv = new Map(
  routeEnvKeys.map((key) => [key, process.env[key]] as const)
)
const countRowSchema = z.object({ count: z.number() })
const guardedTableCountQueries = {
  authIdentities: "SELECT COUNT(*) AS count FROM auth_identities",
  users: "SELECT COUNT(*) AS count FROM users",
} as const
const unusableProductionTokenEncryptionKeys = [
  { name: "missing", tokenEncryptionKey: undefined },
  { name: "blank", tokenEncryptionKey: " \t\n " },
  {
    name: "replace-with placeholder",
    tokenEncryptionKey: "replace-with-32-byte-base64-key",
  },
  {
    name: "invalid-length base64",
    tokenEncryptionKey: Buffer.alloc(31, 7).toString("base64"),
  },
  { name: "invalid base64", tokenEncryptionKey: "not-base64!!" },
] as const

function setRouteEnvValue(key: RouteEnvKey, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}

function restoreRouteEnv(): void {
  for (const key of routeEnvKeys) {
    setRouteEnvValue(key, originalRouteEnv.get(key))
  }
}

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
  vi.stubEnv(
    "KAKAO_REDIRECT_URI",
    "http://localhost:3000/api/auth/kakao/callback"
  )
}

function configureProductionTokenEncryptionKey(
  tokenEncryptionKey: string | undefined
): void {
  vi.stubEnv("NODE_ENV", "production")
  setRouteEnvValue("TOKEN_ENCRYPTION_KEY", tokenEncryptionKey)
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

function countRows(
  databasePath: string,
  tableName: keyof typeof guardedTableCountQueries
): number {
  const database = openDatabase(databasePath)
  try {
    return countRowSchema.parse(
      database.prepare(guardedTableCountQueries[tableName]).get()
    ).count
  } finally {
    database.close()
  }
}

function expectKakaoStateCookieCleared(response: Response): void {
  const setCookie = response.headers.get("Set-Cookie")
  expect(setCookie).toContain(`${kakaoOAuthStateCookieName}=`)
  expect(setCookie).toContain("Max-Age=0")
}

afterEach(async () => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  restoreRouteEnv()

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

  it.each(unusableProductionTokenEncryptionKeys)(
    "redirects production callbacks to Kakao config before provider calls when TOKEN_ENCRYPTION_KEY is $name",
    async ({ tokenEncryptionKey }) => {
      const databasePath = await createDatabasePath()
      configureEnv(databasePath)
      configureProductionTokenEncryptionKey(tokenEncryptionKey)
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

      expect.soft(response.status).toBe(303)
      expect
        .soft(response.headers.get("Location"))
        .toBe("/?auth_error=kakao_config")
      expectKakaoStateCookieCleared(response)
      expect.soft(mockedFetchKakaoOAuthProfile).not.toHaveBeenCalled()
      expect.soft(countRows(databasePath, "users")).toBe(0)
      expect.soft(countRows(databasePath, "authIdentities")).toBe(0)
    }
  )

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
