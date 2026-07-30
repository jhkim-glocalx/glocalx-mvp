import { randomUUID } from "node:crypto"
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
import { createDatabaseGbpAccessStore } from "@glocalx/db/support/gbp-access-store"
import type { GbpAccessState } from "@glocalx/domain/gbp-access"

import { GET as listStores } from "./access-requests/route"
import { POST as editNote } from "./access-requests/[requestId]/note/route"
import { POST as transition } from "./access-requests/[requestId]/transition/route"

const origin = "http://localhost:3100"
const adminUserId = "admin-1"
const storeId = "demo-store"

async function useTempDatabase(): Promise<void> {
  const tempPath = await mkdtemp(join(tmpdir(), "glocalx-gbp-access-routes-"))
  vi.stubEnv("PLAYWRIGHT_TEST", "true")
  vi.stubEnv("GLOCALX_DB_PATH", join(tempPath, "routes.db"))
  resetDatabaseFile()
  const database = openDatabase()
  try {
    applyMigrations(database)
    seedDemoData(database)
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

// A store that has just completed GBP connect: one access request in
// not_requested, the seam the operator flow starts from.
async function seedAccessRequest(): Promise<string> {
  return withDatabase(async (queryable) => {
    const request = await createDatabaseGbpAccessStore(
      queryable
    ).ensureGbpAccessRequest({ id: randomUUID(), storeId, now: new Date() })
    return request.id
  })
}

async function currentState(
  requestId: string
): Promise<GbpAccessState | undefined> {
  return withDatabase(async (queryable) => {
    const entry =
      await createDatabaseGbpAccessStore(queryable).getGbpAccessRequestById(
        requestId
      )
    return entry?.state
  })
}

async function auditActions(): Promise<readonly string[]> {
  return withDatabase(async (queryable) => {
    const rows = await queryable.query(
      "SELECT action FROM audit_logs ORDER BY created_at ASC"
    )
    return rows.map((row) => String(row["action"]))
  })
}

async function adminSessionCookie(): Promise<string> {
  return withDatabase(async (queryable) => {
    const sessionId =
      await createAdminAuthStore(queryable).createSession(adminUserId)
    return `glocalx_admin_session=${sessionId}`
  })
}

function transitionRequest(
  requestId: string,
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
    `${origin}/api/stores/access-requests/${requestId}/transition`,
    { body: JSON.stringify(body), headers, method: "POST" }
  )
}

function params(requestId: string): {
  readonly params: Promise<{ readonly requestId: string }>
} {
  return { params: Promise.resolve({ requestId }) }
}

beforeEach(async () => {
  await useTempDatabase()
})

describe("gbp access transition route", () => {
  it("rejects an unauthenticated request", async () => {
    const requestId = await seedAccessRequest()
    const response = await transition(
      transitionRequest(requestId, { type: "SEND_INVITE" }),
      params(requestId)
    )
    expect(response.status).toBe(401)
    expect(await currentState(requestId)).toBe("not_requested")
  })

  it("rejects a cross-origin post before touching the database", async () => {
    const requestId = await seedAccessRequest()
    const response = await transition(
      transitionRequest(
        requestId,
        { type: "SEND_INVITE" },
        { cookie: await adminSessionCookie(), withOrigin: false }
      ),
      params(requestId)
    )
    expect(response.status).toBe(403)
    expect(await currentState(requestId)).toBe("not_requested")
  })

  it("advances a natural action and records the matching audit code", async () => {
    const requestId = await seedAccessRequest()
    const response = await transition(
      transitionRequest(
        requestId,
        { type: "SEND_INVITE" },
        { cookie: await adminSessionCookie() }
      ),
      params(requestId)
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.request.state).toBe("invited")
    expect(await currentState(requestId)).toBe("invited")
    expect(await auditActions()).toContain("gbp_access_send_invite")
  })

  it("conflicts on an illegal transition without writing", async () => {
    const requestId = await seedAccessRequest()
    const response = await transition(
      transitionRequest(
        requestId,
        { type: "GRANT" },
        { cookie: await adminSessionCookie() }
      ),
      params(requestId)
    )
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.currentState).toBe("not_requested")
    expect(await currentState(requestId)).toBe("not_requested")
  })

  it("404s an unknown request", async () => {
    const response = await transition(
      transitionRequest(
        "missing",
        { type: "SEND_INVITE" },
        { cookie: await adminSessionCookie() }
      ),
      params("missing")
    )
    expect(response.status).toBe(404)
  })

  it("applies an out-of-band override and audits it distinctly", async () => {
    const requestId = await seedAccessRequest()
    const response = await transition(
      transitionRequest(
        requestId,
        { type: "OVERRIDE", targetState: "granted" },
        { cookie: await adminSessionCookie() }
      ),
      params(requestId)
    )
    expect(response.status).toBe(200)
    expect(await currentState(requestId)).toBe("granted")
    expect(await auditActions()).toContain("gbp_access_override")
  })

  it("stores a BLOCK reason as the chase note", async () => {
    const requestId = await seedAccessRequest()
    await transition(
      transitionRequest(
        requestId,
        { type: "BLOCK", reason: "owner unreachable for two weeks" },
        { cookie: await adminSessionCookie() }
      ),
      params(requestId)
    )
    const note = await withDatabase(async (queryable) => {
      const entry =
        await createDatabaseGbpAccessStore(queryable).getGbpAccessRequestById(
          requestId
        )
      return entry?.note
    })
    expect(note).toBe("owner unreachable for two weeks")
  })
})

describe("gbp access note + list routes", () => {
  it("edits a chase note and audits it", async () => {
    const requestId = await seedAccessRequest()
    const response = await editNote(
      new NextRequest(
        `${origin}/api/stores/access-requests/${requestId}/note`,
        {
          body: JSON.stringify({ note: "called, will accept tonight" }),
          headers: {
            "Content-Type": "application/json",
            Cookie: await adminSessionCookie(),
            Origin: origin,
          },
          method: "POST",
        }
      ),
      params(requestId)
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.request.note).toBe("called, will accept tonight")
    expect(await auditActions()).toContain("gbp_access_note")
  })

  it("lists tracked stores for an authenticated operator", async () => {
    await seedAccessRequest()
    const response = await listStores(
      new NextRequest(`${origin}/api/stores/access-requests`, {
        headers: { Cookie: await adminSessionCookie() },
      })
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.stores).toHaveLength(1)
    expect(body.stores[0].storeName).toBeTruthy()
    expect(body.stores[0].state).toBe("not_requested")
  })
})
