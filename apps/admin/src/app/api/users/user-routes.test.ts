import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createAdminAuthStore } from "@/server/admin-auth-store"
import { createSqliteQueryable } from "@glocalx/db/sqlite-client"
import {
  applyMigrations,
  openDatabase,
  resetDatabaseFile,
} from "@glocalx/db/sqlite"

import { DELETE as deleteUser } from "./[userId]/route"
import { GET as listUsers } from "./route"

const origin = "http://localhost:3100"
const adminUserId = "admin-1"
const ownerUserId = "owner-1"
const ownerEmail = "owner@example.com"

async function useTempDatabase(): Promise<void> {
  const tempPath = await mkdtemp(join(tmpdir(), "glocalx-user-routes-"))
  vi.stubEnv("PLAYWRIGHT_TEST", "true")
  vi.stubEnv("GLOCALX_DB_PATH", join(tempPath, "routes.db"))
  resetDatabaseFile()
  const database = openDatabase()
  try {
    applyMigrations(database)
    const now = new Date().toISOString()
    database
      .prepare(
        "INSERT INTO admin_users (id, email, password_hash, display_name, role, status, created_at) VALUES (?, 'op@example.com', 'hash', 'Op', 'OPERATOR', 'ACTIVE', ?)"
      )
      .run(adminUserId, now)
    database
      .prepare(
        "INSERT INTO users (id, email, display_name, role, created_at) VALUES (?, ?, 'Owner', 'OWNER', ?)"
      )
      .run(ownerUserId, ownerEmail, now)
    database
      .prepare(
        "INSERT INTO stores (id, owner_user_id, name, address, category, onboarding_status, created_at) VALUES ('store-1', ?, 'Store', 'addr', 'cat', 'NOT_STARTED', ?)"
      )
      .run(ownerUserId, now)
  } finally {
    database.close()
  }
}

async function withDatabase<TResult>(
  work: (
    queryable: ReturnType<typeof createSqliteQueryable>
  ) => Promise<TResult>
): Promise<TResult> {
  const database = openDatabase()
  try {
    return await work(createSqliteQueryable(database))
  } finally {
    database.close()
  }
}

async function adminSessionCookie(): Promise<string> {
  return withDatabase(async (queryable) => {
    const sessionId =
      await createAdminAuthStore(queryable).createSession(adminUserId)
    return `glocalx_admin_session=${sessionId}`
  })
}

function deleteRequest(
  userId: string,
  options: { readonly cookie?: string; readonly withOrigin?: boolean } = {}
): NextRequest {
  const headers: Record<string, string> = {}
  if (options.cookie !== undefined) {
    headers["Cookie"] = options.cookie
  }
  if (options.withOrigin !== false) {
    headers["Origin"] = origin
  }
  return new NextRequest(`${origin}/api/users/${userId}`, {
    headers,
    method: "DELETE",
  })
}

function params(userId: string): {
  readonly params: Promise<{ readonly userId: string }>
} {
  return { params: Promise.resolve({ userId }) }
}

beforeEach(async () => {
  vi.unstubAllEnvs()
  await useTempDatabase()
})

describe("admin user routes", () => {
  it("deletes the account, its stores, and audits the erasure", async () => {
    const cookie = await adminSessionCookie()

    const response = await deleteUser(
      deleteRequest(ownerUserId, { cookie }),
      params(ownerUserId)
    )

    expect(response.status).toBe(200)
    const listed = await listUsers(
      new NextRequest(`${origin}/api/users`, { headers: { Cookie: cookie } })
    )
    expect(await listed.json()).toEqual({ users: [] })

    await withDatabase(async (queryable) => {
      expect(
        await queryable.query("SELECT id FROM stores WHERE owner_user_id = ?", [
          ownerUserId,
        ])
      ).toEqual([])
      const audits = await queryable.query("SELECT action FROM audit_logs")
      expect(audits.map((row) => row["action"])).toEqual(["user_delete"])
    })
  })

  it("rejects a delete with no operator session, and one from another origin", async () => {
    expect(
      (await deleteUser(deleteRequest(ownerUserId), params(ownerUserId))).status
    ).toBe(401)

    const cookie = await adminSessionCookie()
    const crossOrigin = new NextRequest(`${origin}/api/users/${ownerUserId}`, {
      headers: { Cookie: cookie, Origin: "http://evil.example" },
      method: "DELETE",
    })
    expect((await deleteUser(crossOrigin, params(ownerUserId))).status).toBe(
      403
    )

    // Neither attempt touched the account.
    await withDatabase(async (queryable) => {
      expect(
        await queryable.query("SELECT id FROM users WHERE id = ?", [
          ownerUserId,
        ])
      ).toHaveLength(1)
    })
  })

  it("404s when the user is already gone, so a double-click reads as a no-op", async () => {
    const cookie = await adminSessionCookie()
    await deleteUser(
      deleteRequest(ownerUserId, { cookie }),
      params(ownerUserId)
    )

    const second = await deleteUser(
      deleteRequest(ownerUserId, { cookie }),
      params(ownerUserId)
    )

    expect(second.status).toBe(404)
  })
})
