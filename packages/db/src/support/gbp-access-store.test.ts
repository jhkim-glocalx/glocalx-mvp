import { randomUUID } from "node:crypto"

import Database from "better-sqlite3"
import { transitionGbpAccess } from "@glocalx/domain/gbp-access"
import { beforeEach, describe, expect, it } from "vitest"

import { createSqliteQueryable } from "../sqlite-client.ts"
import { applyMigrations } from "../sqlite.ts"
import type { Queryable } from "../types.ts"
import {
  type GbpAccessStore,
  createDatabaseGbpAccessStore,
} from "./gbp-access-store.ts"

const storeId = "store-1"
const otherStoreId = "store-2"

function seed(database: Database.Database): void {
  database
    .prepare(
      "INSERT INTO users (id, email, display_name, role, created_at) VALUES (?, ?, ?, 'OWNER', ?)"
    )
    .run("user-1", "owner@example.com", "Owner", "2026-07-31T00:00:00.000Z")
  for (const [id, name] of [
    [storeId, "First Store"],
    [otherStoreId, "Second Store"],
  ]) {
    database
      .prepare(
        "INSERT INTO stores (id, owner_user_id, name, address, category, onboarding_status, created_at) VALUES (?, 'user-1', ?, 'addr', 'cat', 'COMPLETED', ?)"
      )
      .run(id, name, "2026-07-31T00:00:00.000Z")
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
let store: GbpAccessStore

beforeEach(() => {
  queryable = makeQueryable()
  store = createDatabaseGbpAccessStore(queryable)
})

function at(seconds: number): Date {
  return new Date(Date.UTC(2026, 6, 31, 0, 0, seconds))
}

describe("gbp access store", () => {
  it("creates a request in not_requested with requested_at set and granted_at null", async () => {
    const created = await store.ensureGbpAccessRequest({
      id: randomUUID(),
      storeId,
      now: at(0),
    })

    expect(created.state).toBe("not_requested")
    expect(created.storeId).toBe(storeId)
    expect(created.gbpLocationRef).toBeNull()
    expect(created.note).toBeNull()
    expect(created.requestedAt).toBe(at(0).toISOString())
    expect(created.grantedAt).toBeNull()
  })

  it("records a gbp_location_ref supplied at creation", async () => {
    const created = await store.ensureGbpAccessRequest({
      id: randomUUID(),
      storeId,
      gbpLocationRef: "locations/12345",
      now: at(0),
    })
    expect(created.gbpLocationRef).toBe("locations/12345")
  })

  it("is idempotent on store_id and never resets operator-advanced state", async () => {
    const first = await store.ensureGbpAccessRequest({
      id: randomUUID(),
      storeId,
      now: at(0),
    })
    await store.updateGbpAccessState({
      requestId: first.id,
      expectedState: "not_requested",
      nextState: transitionGbpAccess("not_requested", { type: "SEND_INVITE" }),
      now: at(10),
    })

    // A reconnect calls ensure again with a fresh id — it must return the
    // existing invited row, not open a second or roll back to not_requested.
    const second = await store.ensureGbpAccessRequest({
      id: randomUUID(),
      storeId,
      now: at(20),
    })
    expect(second.id).toBe(first.id)
    expect(second.state).toBe("invited")
  })

  it("advances state through a guarded update and stamps granted_at on grant", async () => {
    const created = await store.ensureGbpAccessRequest({
      id: randomUUID(),
      storeId,
      now: at(0),
    })

    const invited = await store.updateGbpAccessState({
      requestId: created.id,
      expectedState: "not_requested",
      nextState: "invited",
      now: at(10),
    })
    expect(invited?.state).toBe("invited")
    expect(invited?.grantedAt).toBeNull()
    expect(invited?.updatedAt).toBe(at(10).toISOString())

    const granted = await store.updateGbpAccessState({
      requestId: created.id,
      expectedState: "invited",
      nextState: "granted",
      now: at(20),
    })
    expect(granted?.state).toBe("granted")
    expect(granted?.grantedAt).toBe(at(20).toISOString())
  })

  it("returns undefined when the state guard misses a stale expectedState", async () => {
    const created = await store.ensureGbpAccessRequest({
      id: randomUUID(),
      storeId,
      now: at(0),
    })
    await store.updateGbpAccessState({
      requestId: created.id,
      expectedState: "not_requested",
      nextState: "invited",
      now: at(10),
    })

    // A second caller still believing the row is not_requested loses the race.
    const lost = await store.updateGbpAccessState({
      requestId: created.id,
      expectedState: "not_requested",
      nextState: "invited",
      now: at(20),
    })
    expect(lost).toBeUndefined()
  })

  it("keeps granted_at as history after a revoke", async () => {
    const created = await store.ensureGbpAccessRequest({
      id: randomUUID(),
      storeId,
      now: at(0),
    })
    await store.updateGbpAccessState({
      requestId: created.id,
      expectedState: "not_requested",
      nextState: "granted",
      now: at(10),
    })
    const revoked = await store.updateGbpAccessState({
      requestId: created.id,
      expectedState: "granted",
      nextState: "revoked",
      now: at(20),
    })
    expect(revoked?.state).toBe("revoked")
    expect(revoked?.grantedAt).toBe(at(10).toISOString())
  })

  it("sets a chase note without bumping updated_at", async () => {
    const created = await store.ensureGbpAccessRequest({
      id: randomUUID(),
      storeId,
      now: at(0),
    })
    const advanced = await store.updateGbpAccessState({
      requestId: created.id,
      expectedState: "not_requested",
      nextState: "pending",
      now: at(10),
    })
    expect(advanced?.updatedAt).toBe(at(10).toISOString())

    const noted = await store.setGbpAccessNote({
      requestId: created.id,
      note: "owner said they'd accept tonight",
      now: at(30),
    })
    expect(noted?.note).toBe("owner said they'd accept tonight")
    // Age is measured from the last state change, so a note must not reset it.
    expect(noted?.updatedAt).toBe(at(10).toISOString())
  })

  it("lists requests across stores with the store name, most stalled first", async () => {
    const a = await store.ensureGbpAccessRequest({
      id: randomUUID(),
      storeId,
      now: at(0),
    })
    await store.ensureGbpAccessRequest({
      id: randomUUID(),
      storeId: otherStoreId,
      now: at(5),
    })
    // Advance the first store's request so its updated_at is newest; the
    // untouched second store is the more stalled and should sort first.
    await store.updateGbpAccessState({
      requestId: a.id,
      expectedState: "not_requested",
      nextState: "invited",
      now: at(100),
    })

    const list = await store.listGbpAccessRequests()
    expect(list).toHaveLength(2)
    expect(list[0]?.storeName).toBe("Second Store")
    expect(list[1]?.storeName).toBe("First Store")
    expect(list[1]?.state).toBe("invited")
  })

  it("scopes owner reads to the store and finds operator reads by id", async () => {
    const created = await store.ensureGbpAccessRequest({
      id: randomUUID(),
      storeId,
      now: at(0),
    })
    expect((await store.getGbpAccessRequestForStore(storeId))?.id).toBe(
      created.id
    )
    expect(
      await store.getGbpAccessRequestForStore(otherStoreId)
    ).toBeUndefined()
    expect((await store.getGbpAccessRequestById(created.id))?.storeId).toBe(
      storeId
    )
  })
})
