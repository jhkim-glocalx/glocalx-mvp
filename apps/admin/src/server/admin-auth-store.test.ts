import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

import { afterEach, describe, expect, it, vi } from "vitest"

import { openDatabaseContext } from "@glocalx/db"
import type { DatabaseContext, Queryable } from "@glocalx/db"
import { hashPassword } from "@glocalx/domain/password-hash"

import { createAdminAuthStore } from "./admin-auth-store"

const tempDirectories: string[] = []

function createTempDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "glocalx-admin-auth-"))
  tempDirectories.push(directory)
  return join(directory, "test.db")
}

async function openTestDatabase(): Promise<DatabaseContext> {
  vi.stubEnv("DATABASE_PROVIDER", "sqlite")
  vi.stubEnv("GLOCALX_DB_PATH", createTempDatabasePath())
  return openDatabaseContext()
}

async function seedAdmin(
  queryable: Queryable,
  options: {
    readonly email?: string
    readonly password?: string
    readonly status?: "ACTIVE" | "DISABLED"
  } = {}
): Promise<{ readonly adminUserId: string; readonly email: string }> {
  const adminUserId = randomUUID()
  const email = options.email ?? "ops@glocalx.dev"
  await queryable.execute(
    "INSERT INTO admin_users (id, email, password_hash, display_name, role, status, created_at) VALUES (?, ?, ?, ?, 'OPERATOR', ?, ?)",
    [
      adminUserId,
      email,
      await hashPassword(options.password ?? "operator-passphrase"),
      "Test Operator",
      options.status ?? "ACTIVE",
      new Date().toISOString(),
    ]
  )
  return { adminUserId, email }
}

async function seedOwnerSession(queryable: Queryable): Promise<string> {
  const now = new Date()
  const ownerSessionId = randomUUID()
  await queryable.execute(
    "INSERT INTO users (id, email, display_name, role, created_at) VALUES ('owner-1', 'owner@glocalx.dev', 'Owner', 'OWNER', ?)",
    [now.toISOString()]
  )
  await queryable.execute(
    "INSERT INTO stores (id, owner_user_id, name, address, category, onboarding_status, created_at) VALUES ('store-1', 'owner-1', 'Store', 'Seoul', 'cafe', 'COMPLETED', ?)",
    [now.toISOString()]
  )
  await queryable.execute(
    "INSERT INTO user_sessions (id, user_id, store_id, expires_at, created_at) VALUES (?, 'owner-1', 'store-1', ?, ?)",
    [
      ownerSessionId,
      new Date(now.getTime() + 60_000).toISOString(),
      now.toISOString(),
    ]
  )
  return ownerSessionId
}

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("admin auth store", () => {
  it("round-trips credential lookup, session create, resolve, and delete", async () => {
    const databaseContext = await openTestDatabase()
    try {
      const store = createAdminAuthStore(databaseContext.queryable)
      const { adminUserId } = await seedAdmin(databaseContext.queryable)

      const credential = await store.readCredentialByEmail("OPS@glocalx.dev")
      expect(credential?.adminUserId).toBe(adminUserId)

      const sessionId = await store.createSession(adminUserId)
      const session = await store.readSession(sessionId)
      expect(session).toEqual({
        adminUserId,
        displayName: "Test Operator",
        email: "ops@glocalx.dev",
        role: "OPERATOR",
      })

      await store.deleteSession(sessionId)
      expect(await store.readSession(sessionId)).toBeUndefined()
    } finally {
      await databaseContext.close()
    }
  })

  it("does not resolve expired sessions", async () => {
    const databaseContext = await openTestDatabase()
    try {
      const store = createAdminAuthStore(databaseContext.queryable)
      const { adminUserId } = await seedAdmin(databaseContext.queryable)
      const expiredSessionId = randomUUID()
      await databaseContext.queryable.execute(
        "INSERT INTO admin_sessions (id, admin_user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
        [
          expiredSessionId,
          adminUserId,
          new Date(Date.now() - 1000).toISOString(),
          new Date().toISOString(),
        ]
      )

      expect(await store.readSession(expiredSessionId)).toBeUndefined()
    } finally {
      await databaseContext.close()
    }
  })

  it("locks out disabled admins, including their live sessions", async () => {
    const databaseContext = await openTestDatabase()
    try {
      const store = createAdminAuthStore(databaseContext.queryable)
      const { adminUserId, email } = await seedAdmin(databaseContext.queryable)
      const sessionId = await store.createSession(adminUserId)

      await databaseContext.queryable.execute(
        "UPDATE admin_users SET status = 'DISABLED' WHERE id = ?",
        [adminUserId]
      )

      expect(await store.readCredentialByEmail(email)).toBeUndefined()
      expect(await store.readSession(sessionId)).toBeUndefined()
      await expect(store.createSession(adminUserId)).rejects.toThrow(
        "inactive admin"
      )
    } finally {
      await databaseContext.close()
    }
  })

  it("keeps owner and admin sessions unresolvable across each other's tables", async () => {
    const databaseContext = await openTestDatabase()
    try {
      const store = createAdminAuthStore(databaseContext.queryable)
      const { adminUserId } = await seedAdmin(databaseContext.queryable)
      const adminSessionId = await store.createSession(adminUserId)
      const ownerSessionId = await seedOwnerSession(databaseContext.queryable)

      // A leaked owner session id must never resolve to admin scope…
      expect(await store.readSession(ownerSessionId)).toBeUndefined()
      // …and an admin session id must not exist in the owner session table.
      expect(
        await databaseContext.queryable.queryOne(
          "SELECT id FROM user_sessions WHERE id = ?",
          [adminSessionId]
        )
      ).toBeUndefined()
    } finally {
      await databaseContext.close()
    }
  })
})
