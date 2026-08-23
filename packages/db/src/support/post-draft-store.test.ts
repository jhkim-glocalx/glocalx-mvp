import Database from "better-sqlite3"
import { beforeEach, describe, expect, it } from "vitest"

import { createSqliteQueryable } from "../sqlite-client.ts"
import { applyMigrations } from "../sqlite.ts"
import type { Queryable } from "../types.ts"
import {
  createDatabasePostDraftStore,
  type PostDraftStore,
} from "./post-draft-store.ts"

const storeId = "store-1"

function seed(database: Database.Database): void {
  database
    .prepare(
      "INSERT INTO users (id, email, display_name, role, created_at) VALUES (?, ?, ?, 'OWNER', ?)"
    )
    .run("user-1", "owner@example.com", "Owner", "2026-07-21T00:00:00.000Z")
  database
    .prepare(
      "INSERT INTO stores (id, owner_user_id, name, address, category, onboarding_status, created_at) VALUES (?, 'user-1', ?, 'addr', 'cat', 'COMPLETED', ?)"
    )
    .run(storeId, "Brunch House", "2026-07-21T00:00:00.000Z")
}

function makeQueryable(): Queryable {
  const database = new Database(":memory:")
  database.pragma("foreign_keys = ON")
  applyMigrations(database)
  seed(database)
  return createSqliteQueryable(database)
}

let queryable: Queryable
let postDrafts: PostDraftStore

beforeEach(() => {
  queryable = makeQueryable()
  postDrafts = createDatabasePostDraftStore(queryable)
})

describe("post draft store", () => {
  it("lists drafts newest first with the owning store name", async () => {
    await queryable.execute(
      `INSERT INTO post_drafts (
        id, store_id, owner_intent, target_channel, status, korean_copy, english_copy, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "draft-1",
        storeId,
        "이번 주말 브런치 홍보",
        "GBP",
        "DRAFT",
        "이번 주말 브런치를 만나보세요.",
        "Try our weekend brunch.",
        "2026-08-01T00:00:00.000Z",
      ]
    )
    await queryable.execute(
      `INSERT INTO post_drafts (
        id, store_id, owner_intent, target_channel, status, korean_copy, english_copy, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "draft-2",
        storeId,
        "신메뉴 홍보",
        "INSTAGRAM",
        "DRAFT",
        "신메뉴가 나왔어요.",
        "Check out our new menu.",
        "2026-08-02T00:00:00.000Z",
      ]
    )

    const entries = await postDrafts.listPostDraftsForOperator()

    expect(entries.map((entry) => entry.id)).toEqual(["draft-2", "draft-1"])
    expect(entries[0]).toMatchObject({
      storeName: "Brunch House",
      attemptCount: 0,
      latestAttemptStatus: null,
      latestAttemptPublicUrl: null,
    })
  })

  it("surfaces the most recent publish attempt for a draft", async () => {
    await queryable.execute(
      `INSERT INTO post_drafts (
        id, store_id, owner_intent, target_channel, status, korean_copy, english_copy, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "draft-1",
        storeId,
        "이번 주말 브런치 홍보",
        "GBP",
        "DRAFT",
        "이번 주말 브런치를 만나보세요.",
        "Try our weekend brunch.",
        "2026-08-01T00:00:00.000Z",
      ]
    )
    await queryable.execute(
      `INSERT INTO post_publish_attempts (
        id, draft_id, idempotency_key, attempt_number, status, platform, public_url, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "attempt-1",
        "draft-1",
        "idem-1",
        1,
        "FAILED",
        "GBP",
        null,
        "2026-08-01T00:01:00.000Z",
      ]
    )
    await queryable.execute(
      `INSERT INTO post_publish_attempts (
        id, draft_id, idempotency_key, attempt_number, status, platform, public_url, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "attempt-2",
        "draft-1",
        "idem-2",
        2,
        "SUCCEEDED",
        "GBP",
        "https://maps.google.com/post/123",
        "2026-08-01T00:02:00.000Z",
      ]
    )

    const entries = await postDrafts.listPostDraftsForOperator()

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      attemptCount: 2,
      latestAttemptStatus: "SUCCEEDED",
      latestAttemptPublicUrl: "https://maps.google.com/post/123",
    })
  })
})
