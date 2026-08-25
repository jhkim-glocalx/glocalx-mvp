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
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createAdminAuthStore } from "@/server/admin-auth-store"

import { GET as previewOrphanedUploads } from "./orphaned-uploads/route"

const origin = "http://localhost:3100"
const adminUserId = "admin-1"

async function useTempDatabase(): Promise<void> {
  const tempPath = await mkdtemp(join(tmpdir(), "glocalx-orphaned-uploads-"))
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

async function adminSessionCookie(): Promise<string> {
  const database = openDatabase()
  try {
    const sessionId = await createAdminAuthStore(
      createSqliteQueryable(database)
    ).createSession(adminUserId)
    return `glocalx_admin_session=${sessionId}`
  } finally {
    database.close()
  }
}

function previewRequest(cookie?: string): NextRequest {
  const headers: Record<string, string> = {}
  if (cookie !== undefined) {
    headers["Cookie"] = cookie
  }
  return new NextRequest(`${origin}/api/settings/orphaned-uploads`, {
    headers,
  })
}

beforeEach(async () => {
  await useTempDatabase()
})

describe("orphaned uploads preview route", () => {
  it("rejects an unauthenticated preview", async () => {
    const response = await previewOrphanedUploads(previewRequest())
    expect(response.status).toBe(401)
  })

  it("returns a dry-run preview with no candidates in stub mode", async () => {
    const response = await previewOrphanedUploads(
      previewRequest(await adminSessionCookie())
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      status: "OK",
      dryRun: true,
      candidates: [],
      totalBytes: 0,
    })
  })
})
