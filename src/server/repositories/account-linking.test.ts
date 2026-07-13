import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { openDatabaseContext } from "@/server/db"
import type { DatabaseContext } from "@/server/db"

import { createDatabaseEmailCredentialsRepository } from "./email-credentials"
import { createDatabaseOAuthIdentityRepository } from "./oauth-identity"

const tempDirectories: string[] = []
const countSchema = z.object({ count: z.number() })

function createTempDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "glocalx-account-linking-"))
  tempDirectories.push(directory)
  return join(directory, "test.db")
}

async function seedOwner(
  context: DatabaseContext,
  options: {
    readonly email: string
    readonly storeId: string
    readonly userId: string
  }
): Promise<void> {
  await context.queryable.execute(
    "INSERT INTO users (id, email, display_name, role, created_at) VALUES (?, ?, ?, ?, ?)",
    [
      options.userId,
      options.email,
      "Existing Owner",
      "OWNER",
      "2026-07-13T00:00:00.000Z",
    ]
  )
  await context.queryable.execute(
    "INSERT INTO stores (id, owner_user_id, name, address, category, onboarding_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      options.storeId,
      options.userId,
      "Existing Store",
      "Seoul",
      "Cafe",
      "COMPLETED",
      "2026-07-13T00:00:00.000Z",
    ]
  )
}

beforeEach(() => {
  vi.stubEnv("DATABASE_PROVIDER", "sqlite")
  vi.stubEnv("GLOCALX_DB_PATH", createTempDatabasePath())
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 11).toString("base64"))
})

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("cross-method account linking", () => {
  it("links a verified OAuth email to the existing owner and store", async () => {
    // Given
    const context = await openDatabaseContext()
    try {
      await seedOwner(context, {
        email: "owner@example.com",
        storeId: "email-store",
        userId: "email-owner",
      })
      await context.queryable.execute(
        "INSERT INTO email_credentials (user_id, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)",
        [
          "email-owner",
          "scrypt$fixture$fixture",
          "2026-07-13T00:00:00.000Z",
          "2026-07-13T00:00:00.000Z",
        ]
      )

      // When
      const repository = createDatabaseOAuthIdentityRepository(
        context.queryable
      )
      const profile = {
        accessToken: "google-access-token",
        displayName: "Verified Google Owner",
        email: "OWNER@example.com",
        emailVerified: true,
        provider: "GOOGLE" as const,
        scopes: ["openid", "email", "profile"],
        subjectId: "google-owner-subject",
      }
      await expect(repository.upsertOAuthIdentity(profile)).rejects.toThrow(
        "Sign in with the existing email account"
      )
      const session = await repository.upsertOAuthIdentity(
        profile,
        new Date("2026-07-13T00:05:00.000Z"),
        "email-owner"
      )

      // Then
      expect(session).toEqual({
        onboardingComplete: true,
        storeId: "email-store",
        userId: "email-owner",
      })
    } finally {
      await context.close()
    }
  })

  it("keeps an unverified provider email separate from an existing owner", async () => {
    // Given
    const context = await openDatabaseContext()
    try {
      await seedOwner(context, {
        email: "owner@example.com",
        storeId: "email-store",
        userId: "email-owner",
      })

      // When
      const session = await createDatabaseOAuthIdentityRepository(
        context.queryable
      ).upsertOAuthIdentity({
        accessToken: "kakao-access-token",
        displayName: "Unverified Kakao Owner",
        email: "owner@example.com",
        emailVerified: false,
        provider: "KAKAO",
        scopes: ["profile_nickname"],
        subjectId: "kakao-owner-subject",
      })

      // Then
      expect(session.userId).not.toBe("email-owner")
      expect(session.storeId).not.toBe("email-store")
    } finally {
      await context.close()
    }
  })

  it("blocks password registration for an existing social-only email", async () => {
    // Given
    const context = await openDatabaseContext()
    try {
      await seedOwner(context, {
        email: "social@example.com",
        storeId: "social-store",
        userId: "social-owner",
      })

      // When
      const result = await createDatabaseEmailCredentialsRepository(
        context.queryable
      ).register({
        displayName: "Password Claimant",
        email: "social@example.com",
        passwordHash: "scrypt$fixture$fixture",
      })

      // Then
      expect(result).toEqual({ kind: "email_taken" })
      const credentialCount = countSchema.parse(
        await context.queryable.queryOne(
          "SELECT COUNT(*) AS count FROM email_credentials"
        )
      )
      expect(credentialCount.count).toBe(0)
    } finally {
      await context.close()
    }
  })
})
