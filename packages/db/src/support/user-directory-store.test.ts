import Database from "better-sqlite3"
import { beforeEach, describe, expect, it } from "vitest"

import { createSqliteQueryable } from "../sqlite-client.ts"
import { applyMigrations } from "../sqlite.ts"
import type { Queryable } from "../types.ts"
import {
  type UserDirectoryStore,
  createDatabaseUserDirectoryStore,
} from "./user-directory-store.ts"

function seedUser(
  database: Database.Database,
  id: string,
  email: string,
  createdAt: string
): void {
  database
    .prepare(
      "INSERT INTO users (id, email, display_name, role, created_at) VALUES (?, ?, 'Owner', 'OWNER', ?)"
    )
    .run(id, email, createdAt)
}

function seedStore(
  database: Database.Database,
  id: string,
  ownerId: string,
  name: string,
  createdAt: string
): void {
  database
    .prepare(
      "INSERT INTO stores (id, owner_user_id, name, address, category, onboarding_status, created_at) VALUES (?, ?, ?, 'addr', 'cat', 'COMPLETED', ?)"
    )
    .run(id, ownerId, name, createdAt)
}

// A draft that revises another draft of the same store — the self-FK that a
// naive DELETE trips over under SQLite's row-by-row FK checks.
function seedDraftWithRevision(
  database: Database.Database,
  storeId: string
): void {
  const insert = database.prepare(
    "INSERT INTO post_drafts (id, store_id, owner_intent, target_channel, status, korean_copy, english_copy, revision_of_draft_id, created_at) VALUES (?, ?, 'intent', 'GBP', 'DRAFT', 'ko', 'en', ?, '2026-07-31T00:00:00.000Z')"
  )
  insert.run("draft-1", storeId, null)
  insert.run("draft-2", storeId, "draft-1")
}

function seedEmailCredential(
  database: Database.Database,
  userId: string
): void {
  database
    .prepare(
      "INSERT INTO email_credentials (user_id, password_hash, created_at, updated_at) VALUES (?, 'hash', '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z')"
    )
    .run(userId)
}

function seedSession(
  database: Database.Database,
  id: string,
  userId: string,
  storeId: string
): void {
  database
    .prepare(
      "INSERT INTO user_sessions (id, user_id, store_id, expires_at, created_at) VALUES (?, ?, ?, '2099-01-01T00:00:00.000Z', '2026-07-31T00:00:00.000Z')"
    )
    .run(id, userId, storeId)
}

function makeQueryable(): {
  queryable: Queryable
  database: Database.Database
} {
  const database = new Database(":memory:")
  database.pragma("foreign_keys = ON")
  applyMigrations(database)
  return { queryable: createSqliteQueryable(database), database }
}

let queryable: Queryable
let database: Database.Database
let store: UserDirectoryStore

beforeEach(() => {
  ;({ queryable, database } = makeQueryable())
  store = createDatabaseUserDirectoryStore(queryable)
})

describe("user directory store", () => {
  it("lists users newest-created-first, aggregating multiple owned stores into a count", async () => {
    seedUser(database, "user-1", "a@example.com", "2026-07-31T00:00:00.000Z")
    seedUser(database, "user-2", "b@example.com", "2026-07-31T00:00:01.000Z")
    seedStore(
      database,
      "store-1",
      "user-1",
      "First Store",
      "2026-07-30T00:00:00.000Z"
    )
    seedStore(
      database,
      "store-2",
      "user-1",
      "Second Store",
      "2026-07-31T00:00:00.000Z"
    )

    const users = await store.listUsers()

    expect(users.map((entry) => entry.id)).toEqual(["user-2", "user-1"])
    const owner = users.find((entry) => entry.id === "user-1")
    expect(owner).toMatchObject({
      deactivatedAt: null,
      storeCount: 2,
      storeName: "First Store",
    })
    expect(users.find((entry) => entry.id === "user-2")).toMatchObject({
      storeCount: 0,
      storeName: null,
    })
  })

  it("deactivates a user, invalidates their sessions, and refuses to deactivate twice", async () => {
    seedUser(database, "user-1", "a@example.com", "2026-07-31T00:00:00.000Z")
    seedStore(
      database,
      "store-1",
      "user-1",
      "First Store",
      "2026-07-31T00:00:00.000Z"
    )
    seedSession(database, "session-1", "user-1", "store-1")

    const deactivated = await store.deactivateUser(
      "user-1",
      new Date("2026-08-01T00:00:00.000Z")
    )

    expect(deactivated?.deactivatedAt).toBe("2026-08-01T00:00:00.000Z")
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM user_sessions").get()
    ).toEqual({ count: 0 })

    // A second deactivation of the same (now-deactivated) user is a no-op,
    // not a re-stamp — the caller needs to be able to tell it did nothing.
    expect(
      await store.deactivateUser("user-1", new Date("2026-08-02T00:00:00.000Z"))
    ).toBeUndefined()
  })

  it("hard-deletes the account and everything it owns, freeing the email", async () => {
    seedUser(database, "user-1", "a@example.com", "2026-07-31T00:00:00.000Z")
    seedUser(database, "user-2", "b@example.com", "2026-07-31T00:00:01.000Z")
    seedStore(
      database,
      "store-1",
      "user-1",
      "First Store",
      "2026-07-31T00:00:00.000Z"
    )
    seedStore(
      database,
      "store-2",
      "user-2",
      "Other Store",
      "2026-07-31T00:00:00.000Z"
    )
    seedSession(database, "session-1", "user-1", "store-1")
    seedDraftWithRevision(database, "store-1")
    seedEmailCredential(database, "user-1")

    const deleted = await store.deleteUser("user-1")

    expect(deleted?.email).toBe("a@example.com")
    expect((await store.listUsers()).map((entry) => entry.id)).toEqual([
      "user-2",
    ])
    for (const table of [
      "stores",
      "post_drafts",
      "user_sessions",
      "email_credentials",
    ]) {
      expect(
        database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()
      ).toEqual({ count: table === "stores" ? 1 : 0 })
    }

    // The point of the hard delete: the email is free again.
    expect(() =>
      seedUser(database, "user-3", "a@example.com", "2026-08-01T00:00:00.000Z")
    ).not.toThrow()
  })

  it("keeps the audit trail, detached from the deleted account", async () => {
    seedUser(database, "user-1", "a@example.com", "2026-07-31T00:00:00.000Z")
    seedStore(
      database,
      "store-1",
      "user-1",
      "First Store",
      "2026-07-31T00:00:00.000Z"
    )
    database
      .prepare(
        "INSERT INTO audit_logs (id, store_id, actor_user_id, action, redacted_payload_json, created_at) VALUES ('audit-1', 'store-1', 'user-1', 'gbp_access_grant', '{}', '2026-07-31T00:00:00.000Z')"
      )
      .run()

    await store.deleteUser("user-1")

    expect(
      database
        .prepare(
          "SELECT action, store_id, actor_user_id FROM audit_logs WHERE id = 'audit-1'"
        )
        .get()
    ).toEqual({
      action: "gbp_access_grant",
      actor_user_id: null,
      store_id: null,
    })
  })

  it("returns undefined when deleting a user id that does not exist", async () => {
    expect(await store.deleteUser("missing")).toBeUndefined()
  })

  it("returns undefined for a user id that does not exist", async () => {
    expect(
      await store.deactivateUser(
        "missing",
        new Date("2026-08-01T00:00:00.000Z")
      )
    ).toBeUndefined()
  })
})
