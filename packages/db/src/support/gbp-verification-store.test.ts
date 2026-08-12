import Database from "better-sqlite3"
import { beforeEach, describe, expect, it } from "vitest"

import { createSqliteQueryable } from "../sqlite-client.ts"
import { applyMigrations } from "../sqlite.ts"
import type { Queryable } from "../types.ts"
import {
  type GbpVerificationStore,
  createDatabaseGbpVerificationStore,
} from "./gbp-verification-store.ts"

const storeId = "store-1"
const otherStoreId = "store-2"

function seed(database: Database.Database): void {
  database
    .prepare(
      "INSERT INTO users (id, email, display_name, role, created_at) VALUES (?, ?, ?, 'OWNER', ?)"
    )
    .run("user-1", "owner@example.com", "Owner", "2026-08-12T00:00:00.000Z")
  for (const [id, name] of [
    [storeId, "First Store"],
    [otherStoreId, "Second Store"],
  ]) {
    database
      .prepare(
        "INSERT INTO stores (id, owner_user_id, name, address, category, onboarding_status, created_at) VALUES (?, 'user-1', ?, 'addr', 'cat', 'COMPLETED', ?)"
      )
      .run(id, name, "2026-08-12T00:00:00.000Z")
  }
}

function makeQueryable(): Queryable {
  const database = new Database(":memory:")
  database.pragma("foreign_keys = ON")
  applyMigrations(database)
  seed(database)
  return createSqliteQueryable(database)
}

let queryable: Queryable
let store: GbpVerificationStore

beforeEach(() => {
  queryable = makeQueryable()
  store = createDatabaseGbpVerificationStore(queryable)
})

function at(seconds: number): Date {
  return new Date(Date.UTC(2026, 7, 12, 0, 0, seconds))
}

describe("gbp verification store", () => {
  it("upserts one row per store and reads it back", async () => {
    await store.upsertVerificationState({
      storeId,
      googleLocationId: "locations/123",
      state: "NEEDS_CONCIERGE",
      offeredMethods: ["AUTO"],
      autoAttempted: true,
      now: at(0),
    })

    const row = await store.readVerificationState(storeId)
    expect(row).toEqual({
      storeId,
      googleLocationId: "locations/123",
      state: "NEEDS_CONCIERGE",
      offeredMethods: ["AUTO"],
      autoAttempted: true,
      lastCheckedAt: at(0).toISOString(),
      updatedAt: at(0).toISOString(),
    })
  })

  it("upsert overwrites in place on the unique store index", async () => {
    await store.upsertVerificationState({
      storeId,
      googleLocationId: "locations/123",
      state: "PENDING_REVIEW",
      offeredMethods: [],
      autoAttempted: true,
      now: at(0),
    })
    await store.upsertVerificationState({
      storeId,
      googleLocationId: "locations/123",
      state: "VERIFIED",
      offeredMethods: [],
      autoAttempted: true,
      now: at(10),
    })

    const rows = await store.listVerificationStates()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.state).toBe("VERIFIED")
  })

  it("refresh updates state/methods but preserves auto_attempted and location", async () => {
    await store.upsertVerificationState({
      storeId,
      googleLocationId: "locations/123",
      state: "NEEDS_CONCIERGE",
      offeredMethods: [],
      autoAttempted: true,
      now: at(0),
    })

    await store.refreshVerificationState({
      storeId,
      state: "VERIFIED",
      offeredMethods: ["ADDRESS"],
      now: at(30),
    })

    const row = await store.readVerificationState(storeId)
    expect(row).toEqual({
      storeId,
      googleLocationId: "locations/123",
      state: "VERIFIED",
      offeredMethods: ["ADDRESS"],
      // Preserved from the create-time upsert — a read-only refresh never
      // re-attempts AUTO, so it must not reset the flag.
      autoAttempted: true,
      lastCheckedAt: at(30).toISOString(),
      updatedAt: at(30).toISOString(),
    })
  })

  it("refresh on a store with no row is a no-op", async () => {
    await store.refreshVerificationState({
      storeId,
      state: "VERIFIED",
      offeredMethods: [],
      now: at(0),
    })
    expect(await store.readVerificationState(storeId)).toBeUndefined()
  })

  it("lists every store's row", async () => {
    await store.upsertVerificationState({
      storeId,
      googleLocationId: "locations/1",
      state: "NEEDS_CONCIERGE",
      offeredMethods: [],
      autoAttempted: false,
      now: at(0),
    })
    await store.upsertVerificationState({
      storeId: otherStoreId,
      googleLocationId: "locations/2",
      state: "VERIFIED",
      offeredMethods: [],
      autoAttempted: false,
      now: at(0),
    })

    const rows = await store.listVerificationStates()
    expect(rows.map((row) => row.storeId).sort()).toEqual([
      storeId,
      otherStoreId,
    ])
  })
})
