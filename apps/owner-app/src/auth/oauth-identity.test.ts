import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"

import { applyMigrations, openDatabase } from "@glocalx/db/sqlite"
import { upsertOAuthIdentity } from "./oauth-identity"
import type { SqliteDatabase } from "@glocalx/db/sqlite"

const authIdentityCountSchema = z.object({
  count: z.number(),
})

const authIdentityRowSchema = z.object({
  encrypted_access_token: z.string(),
  encrypted_refresh_token: z.string().nullable(),
  provider: z.string(),
  user_id: z.string(),
})

const storeProfileRowSchema = z.object({
  address: z.string(),
  category: z.string(),
  hours: z.string().nullable(),
  id: z.string(),
  name: z.string(),
  onboarding_status: z.string(),
  owner_user_id: z.string(),
  phone: z.string().nullable(),
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
        emailVerified: true,
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
        emailVerified: true,
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
    const storeCountRow = authIdentityCountSchema.parse(
      database
        .prepare("SELECT COUNT(*) AS count FROM stores WHERE owner_user_id = ?")
        .get(firstSession.userId)
    )
    expect(storeCountRow.count).toBe(1)

    const identityRow = authIdentityRowSchema.parse(
      database
        .prepare(
          "SELECT provider, user_id, encrypted_access_token, encrypted_refresh_token FROM auth_identities"
        )
        .get()
    )
    expect(identityRow).toMatchObject({
      provider: "GOOGLE",
      user_id: firstSession.userId,
    })
    expect(identityRow.encrypted_access_token).toMatch(/^v1:/)
    expect(identityRow.encrypted_refresh_token).toMatch(/^v1:/)

    database.close()
  })

  it("keeps an email-only account separate from a new provider identity", async () => {
    // Given
    const database = await createDatabase()
    const createdAt = "2026-06-04T00:00:00.000Z"
    database
      .prepare(
        "INSERT INTO users (id, email, display_name, role, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(
        "returning-owner",
        "returning@example.com",
        "Returning Owner",
        "OWNER",
        createdAt
      )
    database
      .prepare(
        "INSERT INTO email_credentials (user_id, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)"
      )
      .run("returning-owner", "scrypt$fixture$fixture", createdAt, createdAt)
    database
      .prepare(
        "INSERT INTO stores (id, owner_user_id, name, address, phone, category, hours, onboarding_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        "returning-store",
        "returning-owner",
        "서울식당 강남점",
        "서울 강남구 테헤란로 101",
        "02-321-9876",
        "한식",
        "10:00 ~ 22:00",
        "IN_PROGRESS",
        createdAt
      )

    // When
    const insertedSession = upsertOAuthIdentity(
      database,
      {
        accessToken: "returning-access-token",
        displayName: "Returning Owner From Google",
        email: "RETURNING@example.com",
        emailVerified: true,
        expiresAt: "2026-06-04T01:00:00.000Z",
        provider: "GOOGLE",
        refreshToken: "returning-refresh-token",
        scopes: ["openid", "email", "profile"],
        subjectId: "returning-google-subject",
      },
      new Date("2026-06-04T00:05:00.000Z")
    )
    database
      .prepare("UPDATE stores SET onboarding_status = ? WHERE id = ?")
      .run("COMPLETED", insertedSession.storeId)
    const updatedSession = upsertOAuthIdentity(
      database,
      {
        accessToken: "updated-returning-access-token",
        displayName: "Returning Owner Updated",
        email: "returning@example.com",
        emailVerified: true,
        expiresAt: "2026-06-04T02:00:00.000Z",
        provider: "GOOGLE",
        scopes: ["openid", "email"],
        subjectId: "returning-google-subject",
      },
      new Date("2026-06-04T00:10:00.000Z")
    )

    // Then
    expect(insertedSession.onboardingComplete).toBe(false)
    expect(updatedSession.onboardingComplete).toBe(true)
    expect(updatedSession.storeId).toBe(insertedSession.storeId)
    expect(updatedSession.userId).toBe(insertedSession.userId)
    expect(insertedSession.userId).not.toBe("returning-owner")
    expect(insertedSession.storeId).not.toBe("returning-store")

    const storeCountRow = authIdentityCountSchema.parse(
      database
        .prepare("SELECT COUNT(*) AS count FROM stores WHERE owner_user_id = ?")
        .get(insertedSession.userId)
    )
    expect(storeCountRow.count).toBe(1)

    const storeRow = storeProfileRowSchema.parse(
      database
        .prepare(
          "SELECT id, owner_user_id, name, address, phone, category, hours, onboarding_status FROM stores WHERE id = ?"
        )
        .get("returning-store")
    )
    expect(storeRow).toEqual({
      address: "서울 강남구 테헤란로 101",
      category: "한식",
      hours: "10:00 ~ 22:00",
      id: "returning-store",
      name: "서울식당 강남점",
      onboarding_status: "IN_PROGRESS",
      owner_user_id: "returning-owner",
      phone: "02-321-9876",
    })

    const identityRow = authIdentityRowSchema.parse(
      database
        .prepare(
          "SELECT provider, user_id, encrypted_access_token, encrypted_refresh_token FROM auth_identities WHERE provider = ? AND provider_subject_id = ?"
        )
        .get("GOOGLE", "returning-google-subject")
    )
    expect(identityRow).toMatchObject({
      provider: "GOOGLE",
      user_id: insertedSession.userId,
    })
    expect(identityRow.encrypted_access_token).toMatch(/^v1:/)
    expect(identityRow.encrypted_refresh_token).toMatch(/^v1:/)

    database.close()
  })

  it("creates a deterministic local email when Kakao does not provide one", async () => {
    const database = await createDatabase()

    const session = upsertOAuthIdentity(
      database,
      {
        accessToken: "kakao-access-token",
        displayName: "Kakao Owner",
        emailVerified: false,
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
