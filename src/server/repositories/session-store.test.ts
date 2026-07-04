import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { demoStoreId, demoUserId } from "@/auth/session"
import { openDatabaseContext } from "@/server/db"
import type { Queryable } from "@/server/db"

import { createDatabaseSessionStore } from "./session-store"

const tempDirectories: string[] = []

function createTempDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "glocalx-session-store-"))
  tempDirectories.push(directory)
  return join(directory, "test.db")
}

async function createSessionFixture(
  queryable: Queryable,
  onboardingStatus: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED"
): Promise<void> {
  await queryable.execute(
    "CREATE TEMP TABLE stores (id text PRIMARY KEY, owner_user_id text NOT NULL, onboarding_status text NOT NULL)"
  )
  await queryable.execute(
    "INSERT INTO stores (id, owner_user_id, onboarding_status) VALUES (?, ?, ?)",
    [demoStoreId, demoUserId, onboardingStatus]
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("database session store", () => {
  it("reads session state through the queryable when cookies identify a store owner", async () => {
    // Given: a SQLite queryable with a matching owner/store row.
    vi.stubEnv("DATABASE_PROVIDER", "sqlite")
    vi.stubEnv("GLOCALX_DB_PATH", createTempDatabasePath())
    const context = await openDatabaseContext()

    try {
      await context.queryable.transaction(async (transaction) => {
        await createSessionFixture(transaction, "IN_PROGRESS")
        const sessionStore = createDatabaseSessionStore(transaction)

        // When: cookie values are resolved through the repository boundary.
        const session = await sessionStore.readSessionFromCookieValues({
          onboardingComplete: "true",
          storeId: ` ${demoStoreId} `,
          userId: ` ${demoUserId} `,
        })

        // Then: the database row, not the cookie, determines onboarding state.
        expect(session).toEqual({
          onboardingComplete: false,
          storeId: demoStoreId,
          userId: demoUserId,
        })
      })
    } finally {
      await context.close()
    }
  })

  it("completes onboarding through the queryable after the owner/store match", async () => {
    // Given: a SQLite queryable with a store still in onboarding.
    vi.stubEnv("DATABASE_PROVIDER", "sqlite")
    vi.stubEnv("GLOCALX_DB_PATH", createTempDatabasePath())
    const context = await openDatabaseContext()

    try {
      await context.queryable.transaction(async (transaction) => {
        await createSessionFixture(transaction, "NOT_STARTED")
        const sessionStore = createDatabaseSessionStore(transaction)

        // When: the session store completes onboarding for the owner.
        const completed = await sessionStore.completeOnboarding({
          storeId: demoStoreId,
          userId: demoUserId,
        })
        const session = await sessionStore.readSessionFromCookieValues({
          onboardingComplete: "false",
          storeId: demoStoreId,
          userId: demoUserId,
        })

        // Then: completion succeeds and fresh reads observe the database update.
        expect(completed).toBe(true)
        expect(session).toEqual({
          onboardingComplete: true,
          storeId: demoStoreId,
          userId: demoUserId,
        })
      })
    } finally {
      await context.close()
    }
  })

  it("rejects missing store ownership through the queryable", async () => {
    // Given: a SQLite queryable with only the demo owner/store row.
    vi.stubEnv("DATABASE_PROVIDER", "sqlite")
    vi.stubEnv("GLOCALX_DB_PATH", createTempDatabasePath())
    const context = await openDatabaseContext()

    try {
      await context.queryable.transaction(async (transaction) => {
        await createSessionFixture(transaction, "COMPLETED")
        const sessionStore = createDatabaseSessionStore(transaction)

        // When: cookies reference a store that is not owned by the user.
        const session = await sessionStore.readSessionFromCookieValues({
          onboardingComplete: "true",
          storeId: "missing-store",
          userId: demoUserId,
        })
        const completed = await sessionStore.completeOnboarding({
          storeId: "missing-store",
          userId: demoUserId,
        })

        // Then: reads and writes are both denied at the repository boundary.
        expect(session).toBeUndefined()
        expect(completed).toBe(false)
      })
    } finally {
      await context.close()
    }
  })

  it("runs Postgres session checks when local Postgres env is configured", async () => {
    // Given: live Postgres integration is intentionally gated by both URLs.
    const missingEnvNames = ["DATABASE_URL", "DATABASE_URL_DIRECT"].filter(
      (name) => !process.env[name]
    )
    if (missingEnvNames.length > 0) {
      console.info(`BLOCKED_BY_ENV missing ${missingEnvNames.join(",")}`)
      return
    }

    vi.stubEnv("DATABASE_PROVIDER", "postgres")
    const context = await openDatabaseContext()

    try {
      await context.queryable.transaction(async (transaction) => {
        await createSessionFixture(transaction, "IN_PROGRESS")
        const sessionStore = createDatabaseSessionStore(transaction)

        // When: the same repository boundary runs on the Postgres queryable.
        const session = await sessionStore.readSessionFromCookieValues({
          onboardingComplete: "true",
          storeId: demoStoreId,
          userId: demoUserId,
        })

        // Then: Postgres returns the same cookie-independent session state.
        expect(session).toEqual({
          onboardingComplete: false,
          storeId: demoStoreId,
          userId: demoUserId,
        })
      })
    } finally {
      await context.close()
    }
  })
})
