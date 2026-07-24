import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createSqliteQueryable } from "../sqlite-client.ts"
import { applyMigrations } from "../sqlite.ts"
import type { Queryable } from "../types.ts"
import {
  createDatabaseOrgCredentialStore,
  type OrgCredentialStore,
} from "./org-credential-store.ts"

const encryptionKey = Buffer.alloc(32, 11).toString("base64")
const now = new Date("2026-07-24T12:00:00.000Z")

let database: Database.Database
let queryable: Queryable
let credentials: OrgCredentialStore

beforeEach(() => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", encryptionKey)
  database = new Database(":memory:")
  applyMigrations(database)
  queryable = createSqliteQueryable(database)
  credentials = createDatabaseOrgCredentialStore(queryable)
})

afterEach(() => {
  vi.unstubAllEnvs()
  database.close()
})

function readRawRow(): Record<string, unknown> {
  return database
    .prepare("SELECT * FROM org_credentials WHERE provider = 'google_org'")
    .get() as Record<string, unknown>
}

describe("org credential store", () => {
  it("round-trips a saved credential through encryption", async () => {
    await credentials.saveOrgCredential({
      id: "cred-1",
      provider: "google_org",
      token: "org-access-token",
      expiresAt: new Date("2026-08-01T00:00:00.000Z"),
      now,
    })

    const lookup = await credentials.readOrgCredential("google_org")
    expect(lookup).toEqual({
      kind: "found",
      accessToken: "org-access-token",
      expiresAt: new Date("2026-08-01T00:00:00.000Z"),
    })
  })

  it("never writes the plaintext token to the table", async () => {
    await credentials.saveOrgCredential({
      id: "cred-1",
      provider: "google_org",
      token: "org-access-token",
      refreshToken: "org-refresh-token",
      now,
    })

    const row = readRawRow()
    const stored = JSON.stringify(row)
    expect(stored).not.toContain("org-access-token")
    expect(stored).not.toContain("org-refresh-token")
    expect(row["encrypted_token"]).toMatch(/^v1:/)
    expect(row["encrypted_refresh_token"]).toMatch(/^v1:/)
  })

  it("rotates in place rather than accumulating rows per provider", async () => {
    await credentials.saveOrgCredential({
      id: "cred-1",
      provider: "google_org",
      token: "first-token",
      scopes: "business.manage",
      now,
    })
    await credentials.saveOrgCredential({
      id: "cred-2",
      provider: "google_org",
      token: "second-token",
      now: new Date("2026-07-25T12:00:00.000Z"),
    })

    const rows = await queryable.query("SELECT id FROM org_credentials")
    expect(rows).toHaveLength(1)
    // The original id survives the upsert — only the credential material moves.
    expect(rows[0]).toMatchObject({ id: "cred-1" })

    const lookup = await credentials.readOrgCredential("google_org")
    expect(lookup).toMatchObject({ accessToken: "second-token" })
    // A rotation that omits scopes clears them rather than leaving a stale claim.
    const [summary] = await credentials.listOrgCredentialSummaries()
    expect(summary).toMatchObject({
      scopes: null,
      updatedAt: "2026-07-25T12:00:00.000Z",
    })
  })

  it("summarises without exposing any token material", async () => {
    await credentials.saveOrgCredential({
      id: "cred-1",
      provider: "google_org",
      token: "org-access-token",
      refreshToken: "org-refresh-token",
      expiresAt: new Date("2026-08-01T00:00:00.000Z"),
      scopes: "business.manage",
      now,
    })
    await credentials.saveOrgCredential({
      id: "cred-2",
      provider: "meta_app",
      token: "meta-token",
      now,
    })

    const summaries = await credentials.listOrgCredentialSummaries()
    expect(summaries).toEqual([
      {
        provider: "google_org",
        expiresAt: "2026-08-01T00:00:00.000Z",
        scopes: "business.manage",
        hasRefreshToken: true,
        updatedAt: now.toISOString(),
      },
      {
        provider: "meta_app",
        expiresAt: null,
        scopes: null,
        hasRefreshToken: false,
        updatedAt: now.toISOString(),
      },
    ])
    expect(JSON.stringify(summaries)).not.toContain("org-access-token")
    expect(JSON.stringify(summaries)).not.toContain("org-refresh-token")
  })

  it("reports a provider with no row as missing", async () => {
    expect(await credentials.readOrgCredential("meta_app")).toEqual({
      kind: "missing",
    })
  })

  it("reports a credential written under a different key as undecryptable", async () => {
    await credentials.saveOrgCredential({
      id: "cred-1",
      provider: "google_org",
      token: "org-access-token",
      now,
    })

    // Rotating the key must not look like "never configured" — the operator fix
    // for the two is completely different.
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 22).toString("base64"))
    expect(await credentials.readOrgCredential("google_org")).toEqual({
      kind: "undecryptable",
    })
  })
})
