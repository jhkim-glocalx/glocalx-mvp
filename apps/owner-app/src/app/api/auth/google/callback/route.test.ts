import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import {
  upsertOAuthIdentity,
  type OAuthIdentityProfile,
} from "@/auth/oauth-identity"
import { fetchGoogleOAuthProfile } from "@/auth/oauth-providers"
import type * as OAuthProvidersModule from "@/auth/oauth-providers"
import { onboardingCompleteCookieName } from "@/auth/session"
import { googleOAuthStateCookieName } from "@/gbp/oauth-callback"
import { applyMigrations, openDatabase } from "@glocalx/db/sqlite"
import { GET } from "./route"

vi.mock("@/auth/oauth-providers", async (importOriginal) => {
  const actual = await importOriginal<typeof OAuthProvidersModule>()
  return {
    ...actual,
    fetchGoogleOAuthProfile: vi.fn(),
  }
})

const googleProfile: OAuthIdentityProfile = {
  accessToken: "test-google-access-token",
  displayName: "Google Owner",
  email: "owner@example.com",
  emailVerified: true,
  expiresAt: "2026-06-04T01:00:00.000Z",
  provider: "GOOGLE",
  refreshToken: "test-google-refresh-token",
  scopes: ["openid", "email", "profile"],
  subjectId: "google-subject-task-4",
}

const mockedFetchGoogleOAuthProfile = vi.mocked(fetchGoogleOAuthProfile)
const tempPaths: string[] = []
const originalTokenEncryptionKey = process.env["TOKEN_ENCRYPTION_KEY"]
const countRowSchema = z.object({ count: z.number() })
const guardedTableCountQueries = {
  authIdentities: "SELECT COUNT(*) AS count FROM auth_identities",
  stores: "SELECT COUNT(*) AS count FROM stores",
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

async function createDatabasePath(): Promise<string> {
  const tempPath = await mkdtemp(join(tmpdir(), "glocalx-google-callback-"))
  tempPaths.push(tempPath)
  const databasePath = join(tempPath, "auth.db")
  const database = openDatabase(databasePath)
  applyMigrations(database)
  database.close()
  return databasePath
}

function configureEnv(databasePath: string): void {
  vi.stubEnv("GLOCALX_DB_PATH", databasePath)
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id")
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret")
  vi.stubEnv(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:3000/api/auth/google/callback"
  )
}

function configureProductionTokenEncryptionKey(
  tokenEncryptionKey: string | undefined
): void {
  vi.stubEnv("NODE_ENV", "production")
  if (tokenEncryptionKey === undefined) {
    delete process.env["TOKEN_ENCRYPTION_KEY"]
    return
  }

  process.env["TOKEN_ENCRYPTION_KEY"] = tokenEncryptionKey
}

function createCookieHeader(cookies: Readonly<Record<string, string>>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("; ")
}

function createGoogleCallbackRequest(options: {
  readonly code?: string
  readonly cookies?: Readonly<Record<string, string>>
  readonly state?: string
}): NextRequest {
  const url = new URL("http://localhost:3000/api/auth/google/callback")
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

function expectGoogleStateCookieCleared(response: Response): void {
  const setCookie = response.headers.get("Set-Cookie")
  expect(setCookie).toContain(`${googleOAuthStateCookieName}=`)
  expect(setCookie).toContain("Max-Age=0")
}

afterEach(async () => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  if (originalTokenEncryptionKey === undefined) {
    delete process.env["TOKEN_ENCRYPTION_KEY"]
  } else {
    process.env["TOKEN_ENCRYPTION_KEY"] = originalTokenEncryptionKey
  }

  for (const tempPath of tempPaths) {
    await rm(tempPath, { force: true, recursive: true })
  }
  tempPaths.length = 0
})

describe("Google OAuth callback route", () => {
  it("redirects new incomplete identities to onboarding when a stale completion cookie is present", async () => {
    const databasePath = await createDatabasePath()
    configureEnv(databasePath)
    mockedFetchGoogleOAuthProfile.mockResolvedValue(googleProfile)

    const response = await GET(
      createGoogleCallbackRequest({
        code: "test-code",
        cookies: {
          [googleOAuthStateCookieName]: "valid-google-state",
          [onboardingCompleteCookieName]: "true",
        },
        state: "valid-google-state",
      })
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("/onboarding")
    expect(mockedFetchGoogleOAuthProfile).toHaveBeenCalledTimes(1)
  })

  it("redirects existing completed identities to app", async () => {
    const databasePath = await createDatabasePath()
    configureEnv(databasePath)
    completeExistingStore(databasePath, googleProfile)
    mockedFetchGoogleOAuthProfile.mockResolvedValue(googleProfile)

    const response = await GET(
      createGoogleCallbackRequest({
        code: "test-code",
        cookies: {
          [googleOAuthStateCookieName]: "valid-google-state",
        },
        state: "valid-google-state",
      })
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("/app")
  })

  it.each(unusableProductionTokenEncryptionKeys)(
    "redirects production callbacks to Google config before provider calls when TOKEN_ENCRYPTION_KEY is $name",
    async ({ tokenEncryptionKey }) => {
      const databasePath = await createDatabasePath()
      configureEnv(databasePath)
      configureProductionTokenEncryptionKey(tokenEncryptionKey)
      mockedFetchGoogleOAuthProfile.mockResolvedValue(googleProfile)

      const response = await GET(
        createGoogleCallbackRequest({
          code: "test-code",
          cookies: {
            [googleOAuthStateCookieName]: "valid-google-state",
          },
          state: "valid-google-state",
        })
      )

      expect.soft(response.status).toBe(303)
      expect
        .soft(response.headers.get("Location"))
        .toBe("/?auth_error=google_config")
      expectGoogleStateCookieCleared(response)
      expect.soft(mockedFetchGoogleOAuthProfile).not.toHaveBeenCalled()
      expect.soft(countRows(databasePath, "users")).toBe(0)
      expect.soft(countRows(databasePath, "stores")).toBe(0)
      expect.soft(countRows(databasePath, "authIdentities")).toBe(0)
    }
  )

  it("redirects missing state to the Google auth error without provider calls", async () => {
    const databasePath = await createDatabasePath()
    configureEnv(databasePath)

    const response = await GET(
      createGoogleCallbackRequest({
        code: "test-code",
        cookies: {
          [googleOAuthStateCookieName]: "valid-google-state",
        },
      })
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("/?auth_error=google_state")
    expect(mockedFetchGoogleOAuthProfile).not.toHaveBeenCalled()
  })

  it("redirects mismatched state to the Google auth error without provider calls", async () => {
    const databasePath = await createDatabasePath()
    configureEnv(databasePath)

    const response = await GET(
      createGoogleCallbackRequest({
        code: "test-code",
        cookies: {
          [googleOAuthStateCookieName]: "valid-google-state",
        },
        state: "tampered-google-state",
      })
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("/?auth_error=google_state")
    expect(mockedFetchGoogleOAuthProfile).not.toHaveBeenCalled()
  })
})
