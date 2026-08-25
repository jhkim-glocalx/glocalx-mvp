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
  seedDemoData,
} from "@glocalx/db/sqlite"

import { POST as runSetupAction } from "./route"

const origin = "http://localhost:3100"
const adminUserId = "admin-1"
const storeId = "demo-store"

async function useTempDatabase(): Promise<void> {
  const tempPath = await mkdtemp(join(tmpdir(), "glocalx-gbp-setup-actions-"))
  vi.stubEnv("PLAYWRIGHT_TEST", "true")
  vi.stubEnv("GLOCALX_DB_PATH", join(tempPath, "routes.db"))
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 11).toString("base64"))
  resetDatabaseFile()
  const database = openDatabase()
  try {
    applyMigrations(database)
    seedDemoData(database)
    // The demo seed's own store already carries a GBP listing (setup's
    // duplicate guard would refuse over it); clear it so RUN_SETUP has a
    // fresh store to provision, the same characterization owner-app's own
    // setup test uses.
    database.exec(`DELETE FROM gbp_locations WHERE store_id = '${storeId}'`)
    database
      .prepare(
        "INSERT INTO admin_users (id, email, password_hash, display_name, role, status, created_at) VALUES (?, 'op@example.com', 'hash', 'Op', 'OPERATOR', 'ACTIVE', ?)"
      )
      .run(adminUserId, new Date().toISOString())
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

function setupActionRequest(
  targetStoreId: string,
  body: unknown,
  options: { readonly cookie?: string; readonly withOrigin?: boolean } = {}
): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (options.cookie !== undefined) {
    headers["Cookie"] = options.cookie
  }
  if (options.withOrigin !== false) {
    headers["Origin"] = origin
  }
  return new NextRequest(
    `${origin}/api/stores/${targetStoreId}/gbp/setup/actions`,
    { body: JSON.stringify(body), headers, method: "POST" }
  )
}

function params(targetStoreId: string): {
  readonly params: Promise<{ readonly storeId: string }>
} {
  return { params: Promise.resolve({ storeId: targetStoreId }) }
}

async function auditRows(): Promise<
  readonly { readonly action: string; readonly actorUserId: string | null }[]
> {
  return withDatabase(async (queryable) => {
    const rows = await queryable.query(
      `SELECT action, actor_user_id AS "actorUserId" FROM audit_logs ORDER BY created_at ASC`
    )
    return rows.map((row) => ({
      action: String(row["action"]),
      actorUserId:
        row["actorUserId"] === null ? null : String(row["actorUserId"]),
    }))
  })
}

beforeEach(async () => {
  await useTempDatabase()
})

describe("admin GBP setup-actions", () => {
  it("requires an admin session", async () => {
    const response = await runSetupAction(
      setupActionRequest(storeId, { type: "RUN_SETUP" }),
      params(storeId)
    )
    expect(response.status).toBe(401)
  })

  it("rejects a cross-origin request", async () => {
    const response = await runSetupAction(
      setupActionRequest(
        storeId,
        { type: "RUN_SETUP" },
        { cookie: await adminSessionCookie(), withOrigin: false }
      ),
      params(storeId)
    )
    expect(response.status).toBe(403)
  })

  it("404s an unknown store", async () => {
    const response = await runSetupAction(
      setupActionRequest(
        "missing-store",
        { type: "RUN_SETUP" },
        { cookie: await adminSessionCookie() }
      ),
      params("missing-store")
    )
    expect(response.status).toBe(404)
  })

  it("runs setup on the owner's behalf and audits the operator, not the owner", async () => {
    const response = await runSetupAction(
      setupActionRequest(
        storeId,
        { type: "RUN_SETUP" },
        { cookie: await adminSessionCookie() }
      ),
      params(storeId)
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      readonly status: string
      readonly result: { readonly status: string }
    }
    expect(body.status).toBe("OK")
    expect(body.result.status).not.toBe("ALREADY_LINKED")

    // The setup service's own audit write carries the store owner's user id
    // (an FK into users), never the operator's admin_users id.
    const rows = await auditRows()
    const setupRow = rows.find((row) => row.action === "gbp.setup.stub")
    expect(setupRow?.actorUserId).not.toBe(adminUserId)
    expect(setupRow?.actorUserId).not.toBeNull()

    // The admin route's own audit entry records the operator action with
    // actor_user_id left NULL (operators aren't in the users table).
    const runRow = rows.find((row) => row.action === "gbp_setup_run")
    expect(runRow?.actorUserId).toBeNull()
  })

  it("is idempotent: a second RUN_SETUP on an already-linked store reports ALREADY_LINKED", async () => {
    const cookie = await adminSessionCookie()
    await runSetupAction(
      setupActionRequest(storeId, { type: "RUN_SETUP" }, { cookie }),
      params(storeId)
    )
    const second = await runSetupAction(
      setupActionRequest(storeId, { type: "RUN_SETUP" }, { cookie }),
      params(storeId)
    )

    expect(second.status).toBe(200)
    const body = (await second.json()) as {
      readonly result: { readonly status: string }
    }
    expect(body.result.status).toBe("ALREADY_LINKED")
  })
})
