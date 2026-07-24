import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createSqliteQueryable } from "@glocalx/db/sqlite-client"
import {
  applyMigrations,
  openDatabase,
  resetDatabaseFile,
  seedDemoData,
} from "@glocalx/db/sqlite"
import { createDatabaseOrgCredentialStore } from "@glocalx/db/support/org-credential-store"
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createAdminAuthStore } from "@/server/admin-auth-store"

import {
  GET as listCredentials,
  POST as saveCredential,
} from "./org-credentials/route"

const origin = "http://localhost:3100"
const adminUserId = "admin-1"

async function useTempDatabase(): Promise<void> {
  const tempPath = await mkdtemp(join(tmpdir(), "glocalx-org-credentials-"))
  vi.stubEnv("PLAYWRIGHT_TEST", "true")
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 11).toString("base64"))
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

async function adminSessionCookie(): Promise<string> {
  return withDatabase(async (queryable) => {
    const sessionId =
      await createAdminAuthStore(queryable).createSession(adminUserId)
    return `glocalx_admin_session=${sessionId}`
  })
}

function saveRequest(
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
  return new NextRequest(`${origin}/api/settings/org-credentials`, {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  })
}

function listRequest(cookie?: string): NextRequest {
  const headers: Record<string, string> = {}
  if (cookie !== undefined) {
    headers["Cookie"] = cookie
  }
  return new NextRequest(`${origin}/api/settings/org-credentials`, { headers })
}

async function storedToken(provider: "google_org" | "meta_app") {
  return withDatabase(async (queryable) =>
    createDatabaseOrgCredentialStore(queryable).readOrgCredential(provider)
  )
}

async function auditActions(): Promise<readonly string[]> {
  return withDatabase(async (queryable) => {
    const rows = await queryable.query(
      "SELECT action, store_id AS storeId, redacted_payload_json AS payload FROM audit_logs WHERE action = 'org_credential_saved'"
    )
    return rows.map((row) => JSON.stringify(row))
  })
}

beforeEach(async () => {
  await useTempDatabase()
})

describe("org credential routes", () => {
  it("rejects an unauthenticated save", async () => {
    const response = await saveCredential(
      saveRequest({ provider: "meta_app", token: "paste-value" })
    )

    expect(response.status).toBe(401)
    expect(await storedToken("meta_app")).toEqual({ kind: "missing" })
  })

  it("rejects a cross-origin save", async () => {
    const response = await saveCredential(
      saveRequest(
        { provider: "meta_app", token: "paste-value" },
        { cookie: await adminSessionCookie(), withOrigin: false }
      )
    )

    expect(response.status).toBe(403)
    expect(await storedToken("meta_app")).toEqual({ kind: "missing" })
  })

  it("rejects an unauthenticated list", async () => {
    expect((await listCredentials(listRequest())).status).toBe(401)
  })

  it("stores a pasted credential encrypted and returns only summaries", async () => {
    const response = await saveCredential(
      saveRequest(
        {
          provider: "meta_app",
          token: "paste-value",
          expiresAt: "2026-09-01T00:00:00.000Z",
          scopes: "instagram_content_publish",
        },
        { cookie: await adminSessionCookie() }
      )
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(await storedToken("meta_app")).toMatchObject({
      kind: "found",
      accessToken: "paste-value",
    })
    // The response is the panel's own summary list — a save can never echo the
    // token back into a browser, a log, or a screenshot.
    expect(JSON.stringify(payload)).not.toContain("paste-value")
    expect(payload).toMatchObject({
      credentials: expect.arrayContaining([
        expect.objectContaining({
          provider: "meta_app",
          expiresAt: "2026-09-01T00:00:00.000Z",
          hasRefreshToken: false,
        }),
      ]),
    })
  })

  it("audits the provider without recording any token material", async () => {
    await saveCredential(
      saveRequest(
        {
          provider: "meta_app",
          token: "paste-value",
          refreshToken: "paste-refresh",
        },
        { cookie: await adminSessionCookie() }
      )
    )

    const entries = await auditActions()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toContain("meta_app")
    expect(entries[0]).not.toContain("paste-value")
    expect(entries[0]).not.toContain("paste-refresh")
    // Org-level action: no store owns it, and audit_logs.store_id is nullable.
    expect(entries[0]).toContain('"storeId":null')
  })

  it("rotates in place rather than adding a second credential", async () => {
    const cookie = await adminSessionCookie()
    await saveCredential(
      saveRequest({ provider: "meta_app", token: "first-value" }, { cookie })
    )
    const response = await saveCredential(
      saveRequest({ provider: "meta_app", token: "second-value" }, { cookie })
    )
    const payload = (await response.json()) as {
      readonly credentials: readonly { readonly provider: string }[]
    }

    expect(await storedToken("meta_app")).toMatchObject({
      accessToken: "second-value",
    })
    expect(
      payload.credentials.filter((entry) => entry.provider === "meta_app")
    ).toHaveLength(1)
  })

  it("rejects a payload with an unknown field", async () => {
    const response = await saveCredential(
      saveRequest(
        {
          provider: "meta_app",
          token: "paste-value",
          clientSecret: "should-not-be-accepted",
        },
        { cookie: await adminSessionCookie() }
      )
    )

    expect(response.status).toBe(400)
    expect(await storedToken("meta_app")).toEqual({ kind: "missing" })
  })

  it("refuses to save when token encryption is not configured", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "")

    const response = await saveCredential(
      saveRequest(
        { provider: "meta_app", token: "paste-value" },
        { cookie: await adminSessionCookie() }
      )
    )
    const payload = (await response.json()) as { readonly status: string }

    // Named rather than a 500: the operator can act on "set TOKEN_ENCRYPTION_KEY".
    expect(response.status).toBe(503)
    expect(payload.status).toBe("ENCRYPTION_UNAVAILABLE")
    expect(await storedToken("meta_app")).toEqual({ kind: "missing" })
  })
})
