import { randomUUID } from "node:crypto"

import Database from "better-sqlite3"
import { beforeEach, describe, expect, it } from "vitest"

import { createSqliteQueryable } from "../sqlite-client.ts"
import { applyMigrations } from "../sqlite.ts"
import type { Queryable } from "../types.ts"
import { createDatabaseActivityEventStore } from "./activity-store.ts"
import {
  createDatabaseCsConversationStore,
  type CsConversationStore,
} from "./conversation-store.ts"
import { decodeMessageCursor, encodeMessageCursor } from "./cursor.ts"
import { createDatabaseCsMessageContextStore } from "./message-context-store.ts"
import {
  createDatabaseCsMessageStore,
  type CsMessageStore,
} from "./message-store.ts"

const storeId = "store-1"
const otherStoreId = "store-2"
const adminId = "admin-1"

function seed(database: Database.Database): void {
  database
    .prepare(
      "INSERT INTO users (id, email, display_name, role, created_at) VALUES (?, ?, ?, 'OWNER', ?)"
    )
    .run("user-1", "owner@example.com", "Owner", "2026-07-18T00:00:00.000Z")
  for (const id of [storeId, otherStoreId]) {
    database
      .prepare(
        "INSERT INTO stores (id, owner_user_id, name, address, category, onboarding_status, created_at) VALUES (?, 'user-1', ?, 'addr', 'cat', 'COMPLETED', ?)"
      )
      .run(id, id, "2026-07-18T00:00:00.000Z")
  }
  database
    .prepare(
      "INSERT INTO admin_users (id, email, password_hash, display_name, role, status, created_at) VALUES (?, ?, 'hash', 'Op', 'OPERATOR', 'ACTIVE', ?)"
    )
    .run(adminId, "op@example.com", "2026-07-18T00:00:00.000Z")
}

function makeQueryable(): Queryable {
  const database = new Database(":memory:")
  database.pragma("foreign_keys = ON")
  applyMigrations(database)
  seed(database)
  return createSqliteQueryable(database)
}

let queryable: Queryable
let conversations: CsConversationStore
let messages: CsMessageStore

beforeEach(() => {
  queryable = makeQueryable()
  conversations = createDatabaseCsConversationStore(queryable)
  messages = createDatabaseCsMessageStore(queryable)
})

function at(seconds: number): Date {
  return new Date(Date.UTC(2026, 6, 18, 0, 0, seconds))
}

describe("conversation store", () => {
  it("opens exactly one conversation per store and reuses it", async () => {
    const first = await conversations.getOrCreateOpenConversation({
      id: randomUUID(),
      storeId,
      mode: "human",
      now: at(0),
    })
    const second = await conversations.getOrCreateOpenConversation({
      id: randomUUID(),
      storeId,
      mode: "human",
      now: at(1),
    })
    expect(second.id).toBe(first.id)
    expect(first.status).toBe("open")
    expect(first.mode).toBe("human")
  })

  it("frees the slot for a new conversation once resolved", async () => {
    const first = await conversations.getOrCreateOpenConversation({
      id: randomUUID(),
      storeId,
      mode: "human",
      now: at(0),
    })
    await conversations.resolveConversation(first.id, at(1))
    const second = await conversations.getOrCreateOpenConversation({
      id: randomUUID(),
      storeId,
      mode: "human",
      now: at(2),
    })
    expect(second.id).not.toBe(first.id)
    expect(
      await conversations.getOpenConversationForStore(storeId)
    ).toMatchObject({ id: second.id })
  })

  it("scopes conversation lookups to the owning store", async () => {
    const owned = await conversations.getOrCreateOpenConversation({
      id: randomUUID(),
      storeId,
      mode: "human",
      now: at(0),
    })
    expect(
      await conversations.getConversationForStore(owned.id, otherStoreId)
    ).toBeUndefined()
    expect(
      await conversations.getConversationForStore(owned.id, storeId)
    ).toMatchObject({ id: owned.id })
  })

  it("assigns an admin and switches mode, bumping updated_at", async () => {
    const conversation = await conversations.getOrCreateOpenConversation({
      id: randomUUID(),
      storeId,
      mode: "human",
      now: at(0),
    })
    await conversations.assignAdmin(conversation.id, adminId, at(5))
    await conversations.setMode(conversation.id, "ai", at(6))
    const updated = await conversations.getConversationById(conversation.id)
    expect(updated?.assignedAdminId).toBe(adminId)
    expect(updated?.mode).toBe("ai")
    expect(updated?.updatedAt).toBe(at(6).toISOString())
  })

  it("filters the list by status", async () => {
    const open = await conversations.getOrCreateOpenConversation({
      id: randomUUID(),
      storeId,
      mode: "human",
      now: at(0),
    })
    await conversations.resolveConversation(open.id, at(1))
    const nextOpen = await conversations.getOrCreateOpenConversation({
      id: randomUUID(),
      storeId,
      mode: "human",
      now: at(2),
    })
    const openOnly = await conversations.listConversations({ status: "open" })
    expect(openOnly.map((row) => row.id)).toStrictEqual([nextOpen.id])
    expect(await conversations.listConversations()).toHaveLength(2)
  })
})

async function openConversation(now: Date = at(0)): Promise<string> {
  const conversation = await conversations.getOrCreateOpenConversation({
    id: randomUUID(),
    storeId,
    mode: "human",
    now,
  })
  return conversation.id
}

describe("message store", () => {
  it("hides authorship from the owner but shows it to operations", async () => {
    const conversationId = await openConversation()
    await messages.appendMessage({
      id: randomUUID(),
      conversationId,
      sender: "owner",
      authorKind: "user",
      authorAdminId: null,
      body: "Hi",
      now: at(1),
    })
    await messages.appendMessage({
      id: randomUUID(),
      conversationId,
      sender: "assistant",
      authorKind: "admin",
      authorAdminId: adminId,
      body: "An operator wrote this",
      now: at(2),
    })

    const ownerView = await messages.listOwnerMessages({ conversationId })
    expect(ownerView.messages).toHaveLength(2)
    const ownerReply = ownerView.messages[1]
    expect(ownerReply?.sender).toBe("assistant")
    expect(Object.keys(ownerReply ?? {})).not.toContain("authorKind")
    expect(Object.keys(ownerReply ?? {})).not.toContain("authorAdminId")

    const adminView = await messages.listAdminMessages({ conversationId })
    expect(adminView.messages[1]?.authorKind).toBe("admin")
    expect(adminView.messages[1]?.authorAdminId).toBe(adminId)
  })

  it("paginates chronologically via the composite cursor", async () => {
    const conversationId = await openConversation()
    for (let index = 0; index < 3; index += 1) {
      await messages.appendMessage({
        id: randomUUID(),
        conversationId,
        sender: "owner",
        authorKind: "user",
        authorAdminId: null,
        body: `m${index}`,
        now: at(index + 1),
      })
    }

    const firstPage = await messages.listOwnerMessages({
      conversationId,
      limit: 2,
    })
    expect(firstPage.messages.map((m) => m.body)).toStrictEqual(["m0", "m1"])
    const cursor = decodeMessageCursor(firstPage.nextCursor ?? "")
    expect(cursor).toBeDefined()

    const secondPage = await messages.listOwnerMessages({
      conversationId,
      after: cursor,
      limit: 2,
    })
    expect(secondPage.messages.map((m) => m.body)).toStrictEqual(["m2"])

    const drained = await messages.listOwnerMessages({
      conversationId,
      after: decodeMessageCursor(secondPage.nextCursor ?? ""),
    })
    expect(drained.messages).toHaveLength(0)
    expect(drained.nextCursor).toBeNull()
  })

  it("breaks cursor ties by id when timestamps collide", async () => {
    const conversationId = await openConversation()
    const ids = ["00000000-aaaa", "00000000-bbbb"]
    for (const id of ids) {
      await messages.appendMessage({
        id,
        conversationId,
        sender: "owner",
        authorKind: "user",
        authorAdminId: null,
        body: id,
        now: at(1),
      })
    }
    const afterFirst = await messages.listOwnerMessages({
      conversationId,
      after: { createdAt: at(1).toISOString(), id: ids[0] ?? "" },
    })
    expect(afterFirst.messages.map((m) => m.id)).toStrictEqual([ids[1]])
  })

  it("tracks read receipts per side", async () => {
    const conversationId = await openConversation()
    await messages.appendMessage({
      id: randomUUID(),
      conversationId,
      sender: "owner",
      authorKind: "user",
      authorAdminId: null,
      body: "owner says hi",
      now: at(1),
    })
    await messages.appendMessage({
      id: randomUUID(),
      conversationId,
      sender: "assistant",
      authorKind: "admin",
      authorAdminId: adminId,
      body: "reply",
      now: at(2),
    })

    expect(await messages.countUnreadForOwner(conversationId)).toBe(1)
    expect(await messages.markOwnerRead(conversationId, at(3))).toBe(1)
    expect(await messages.countUnreadForOwner(conversationId)).toBe(0)
    // Marking again is a no-op — only newly-unread rows count.
    expect(await messages.markOwnerRead(conversationId, at(4))).toBe(0)
    // Admin reads owner messages, not assistant ones.
    expect(await messages.markAdminRead(conversationId, at(5))).toBe(1)
  })
})

describe("message context store", () => {
  it("attaches and reads back the screen context plus trail", async () => {
    const conversationId = await openConversation()
    const message = await messages.appendMessage({
      id: randomUUID(),
      conversationId,
      sender: "owner",
      authorKind: "user",
      authorAdminId: null,
      body: "stuck",
      now: at(1),
    })
    const contextStore = createDatabaseCsMessageContextStore(queryable)
    await contextStore.attachContext({
      id: randomUUID(),
      messageId: message.id,
      capturedAt: at(1),
      context: {
        section: "gbp_connect",
        stage: "oauth",
        activityTrail: [
          {
            section: "gbp_connect",
            action: "gbp_connect_started",
            occurredAt: at(0).toISOString(),
          },
        ],
      },
    })

    const record = await contextStore.getContextForMessage(message.id)
    expect(record?.section).toBe("gbp_connect")
    expect(record?.stage).toBe("oauth")
    expect(record?.activityTrail).toHaveLength(1)
    expect(record?.activityTrail[0]).toMatchObject({
      action: "gbp_connect_started",
    })
  })
})

describe("activity event store", () => {
  it("records a batch and lists a store's timeline newest first", async () => {
    const store = createDatabaseActivityEventStore(queryable)
    await store.recordEvents([
      {
        id: randomUUID(),
        storeId,
        sessionId: "sess-1",
        section: "gbp_connect",
        action: "gbp_connect_started",
        detail: { reason: "first_try" },
        occurredAt: at(1),
      },
      {
        id: randomUUID(),
        storeId,
        sessionId: "sess-1",
        section: "gbp_connect",
        action: "gbp_connect_failed",
        detail: undefined,
        occurredAt: at(2),
      },
      {
        id: randomUUID(),
        storeId: otherStoreId,
        sessionId: null,
        section: "home",
        action: "section_viewed",
        detail: undefined,
        occurredAt: at(3),
      },
    ])

    const timeline = await store.listEventsForStore(storeId)
    expect(timeline.map((event) => event.action)).toStrictEqual([
      "gbp_connect_failed",
      "gbp_connect_started",
    ])
    expect(timeline[1]?.detail).toStrictEqual({ reason: "first_try" })
  })

  it("does nothing on an empty batch", async () => {
    const store = createDatabaseActivityEventStore(queryable)
    await store.recordEvents([])
    expect(await store.listEventsForStore(storeId)).toHaveLength(0)
  })
})

describe("message cursor", () => {
  it("round-trips a cursor", () => {
    const cursor = { createdAt: "2026-07-18T00:00:00.000Z", id: "abc" }
    expect(decodeMessageCursor(encodeMessageCursor(cursor))).toStrictEqual(
      cursor
    )
  })

  it("treats a malformed cursor as no cursor", () => {
    expect(decodeMessageCursor("not-base64-json")).toBeUndefined()
    expect(
      decodeMessageCursor(Buffer.from("42").toString("base64url"))
    ).toBeUndefined()
  })
})
