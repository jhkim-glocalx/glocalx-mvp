import Database from "better-sqlite3"
import { beforeEach, describe, expect, it } from "vitest"

import { createSqliteQueryable } from "@glocalx/db/sqlite-client"
import { applyMigrations } from "@glocalx/db/sqlite"
import type { Queryable } from "@glocalx/db"
import { readStoreChannelLink } from "@glocalx/db/support/publish-target-store"

import { createDatabaseStoreChannelLinkStore } from "./store-channel-link-store"

const storeId = "store-1"

function makeQueryable(): Queryable {
  const database = new Database(":memory:")
  database.pragma("foreign_keys = ON")
  applyMigrations(database)
  database
    .prepare(
      "INSERT INTO users (id, email, display_name, role, created_at) VALUES (?, ?, ?, 'OWNER', ?)"
    )
    .run("user-1", "owner@example.com", "Owner", "2026-07-21T00:00:00.000Z")
  database
    .prepare(
      "INSERT INTO stores (id, owner_user_id, name, address, category, onboarding_status, created_at) VALUES (?, 'user-1', 'Store', 'addr', 'cat', 'COMPLETED', ?)"
    )
    .run(storeId, "2026-07-21T00:00:00.000Z")
  return createSqliteQueryable(database)
}

let queryable: Queryable

async function countLinks(): Promise<number> {
  const row = await queryable.queryOne(
    "SELECT COUNT(*) AS c FROM store_channel_links WHERE store_id = ? AND channel = 'instagram'",
    [storeId]
  )
  return (row as { c: number } | undefined)?.c ?? 0
}

beforeEach(() => {
  queryable = makeQueryable()
})

describe("createDatabaseStoreChannelLinkStore", () => {
  it("inserts a new Instagram link that reads back", async () => {
    const store = createDatabaseStoreChannelLinkStore(queryable)

    await store.upsertLink({
      storeId,
      channel: "instagram",
      externalAccountRef: "acct-1",
      encryptedToken: "enc-1",
      status: "linked",
      now: new Date("2026-08-06T00:00:00.000Z"),
    })

    const link = await readStoreChannelLink(queryable, storeId, "instagram")
    expect(link?.externalAccountRef).toBe("acct-1")
    expect(link?.status).toBe("linked")
    expect(await countLinks()).toBe(1)
  })

  it("replaces the link in place on reconnect rather than duplicating it", async () => {
    const store = createDatabaseStoreChannelLinkStore(queryable)

    await store.upsertLink({
      storeId,
      channel: "instagram",
      externalAccountRef: "acct-1",
      encryptedToken: "enc-1",
      status: "linked",
      now: new Date("2026-08-06T00:00:00.000Z"),
    })
    await store.upsertLink({
      storeId,
      channel: "instagram",
      externalAccountRef: "acct-2",
      encryptedToken: "enc-2",
      status: "linked",
      now: new Date("2026-08-07T00:00:00.000Z"),
    })

    // The unique (store_id, channel) index means the reconnect updates the same
    // row: one link, carrying the newest account/token and an advanced
    // updated_at.
    expect(await countLinks()).toBe(1)
    const link = await readStoreChannelLink(queryable, storeId, "instagram")
    expect(link?.externalAccountRef).toBe("acct-2")
    expect(link?.updatedAt).toBe("2026-08-07T00:00:00.000Z")

    const tokenRow = await queryable.queryOne(
      `SELECT encrypted_token AS "encryptedToken" FROM store_channel_links WHERE store_id = ? AND channel = 'instagram'`,
      [storeId]
    )
    expect((tokenRow as { encryptedToken: string }).encryptedToken).toBe(
      "enc-2"
    )
  })
})
