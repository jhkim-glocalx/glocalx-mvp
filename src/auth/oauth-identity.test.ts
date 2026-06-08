import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"

import { applyMigrations, openDatabase } from "@/server/db/sqlite"
import { upsertOAuthIdentity } from "./oauth-identity"
import type { SqliteDatabase } from "@/server/db/sqlite"

const authIdentityCountSchema = z.object({
  count: z.number(),
})

const authIdentityRowSchema = z.object({
  encrypted_access_token: z.string(),
  encrypted_refresh_token: z.string().nullable(),
  provider: z.string(),
  user_id: z.string(),
})

describe("OAuth identity persistence", () => {
  const tempPaths: string[] = []

  afterEach(async () => {
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
    tempPaths.length = 0
  })

  async function createDatabase(): Promise<SqliteDatabase> {
    const tempPath = await mkdtemp(join(tmpdir(), "glocalx-auth-identity-"))
    tempPaths.push(tempPath)
    const database = openDatabase(join(tempPath, "auth.db"))
    applyMigrations(database)
    return database
  }

  it("creates a user, primary store, and idempotent provider identity", async () => {
    const database = await createDatabase()

    const firstSession = upsertOAuthIdentity(
      database,
      {
        accessToken: "first-access-token",
        displayName: "Google Owner",
        email: "owner@example.com",
        expiresAt: "2026-06-04T01:00:00.000Z",
        provider: "GOOGLE",
        refreshToken: "first-refresh-token",
        scopes: ["openid", "email", "profile"],
        subjectId: "google-subject-1",
      },
      new Date("2026-06-04T00:00:00.000Z")
    )
    const secondSession = upsertOAuthIdentity(
      database,
      {
        accessToken: "second-access-token",
        displayName: "Google Owner",
        email: "owner@example.com",
        expiresAt: "2026-06-04T02:00:00.000Z",
        provider: "GOOGLE",
        scopes: ["openid", "email"],
        subjectId: "google-subject-1",
      },
      new Date("2026-06-04T00:10:00.000Z")
    )

    expect(secondSession).toEqual(firstSession)
    expect(firstSession.onboardingComplete).toBe(false)

    const countRow = authIdentityCountSchema.parse(
      database.prepare("SELECT COUNT(*) AS count FROM auth_identities").get()
    )
    expect(countRow.count).toBe(1)

    const identityRow = authIdentityRowSchema.parse(
      database
        .prepare(
          "SELECT provider, user_id, encrypted_access_token, encrypted_refresh_token FROM auth_identities"
        )
        .get()
    )
    expect(identityRow).toEqual({
      encrypted_access_token: "encrypted:second-access-token",
      encrypted_refresh_token: "encrypted:first-refresh-token",
      provider: "GOOGLE",
      user_id: firstSession.userId,
    })

    database.close()
  })

  it("creates a deterministic local email when Kakao does not provide one", async () => {
    const database = await createDatabase()

    const session = upsertOAuthIdentity(
      database,
      {
        accessToken: "kakao-access-token",
        displayName: "Kakao Owner",
        provider: "KAKAO",
        scopes: ["profile_nickname"],
        subjectId: "123456789",
      },
      new Date("2026-06-04T00:00:00.000Z")
    )

    const row = z
      .object({ email: z.string() })
      .parse(
        database
          .prepare("SELECT email FROM users WHERE id = ?")
          .get(session.userId)
      )
    expect(row.email).toMatch(/^kakao-user-.+@auth\.glocalx\.local$/)

    database.close()
  })
})
