import { randomUUID } from "node:crypto"

import Database from "better-sqlite3"
import { beforeEach, describe, expect, it } from "vitest"

import { createSqliteQueryable } from "../sqlite-client.ts"
import { applyMigrations } from "../sqlite.ts"
import type { Queryable } from "../types.ts"
import {
  createDatabaseCsConversationStore,
  type CsConversationStore,
} from "./conversation-store.ts"
import { decodeMessageCursor } from "./cursor.ts"
import {
  createDatabaseCsMessageStore,
  type CsMessageStore,
} from "./message-store.ts"

const storeId = "store-1"
const adminId = "admin-1"

function seed(database: Database.Database): void {
  database
    .prepare(
      "INSERT INTO users (id, email, display_name, role, created_at) VALUES (?, ?, ?, 'OWNER', ?)"
    )
    .run("user-1", "owner@example.com", "Owner", "2026-07-18T00:00:00.000Z")
  database
    .prepare(
      "INSERT INTO stores (id, owner_user_id, name, address, category, onboarding_status, created_at) VALUES (?, 'user-1', ?, 'addr', 'cat', 'COMPLETED', ?)"
    )
    .run(storeId, "Store 1", "2026-07-18T00:00:00.000Z")
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

function at(seconds: number): Date {
  return new Date(Date.UTC(2026, 6, 18, 0, 0, seconds))
}

let queryable: Queryable
let conversations: CsConversationStore
let messages: CsMessageStore
let conversationId: string

beforeEach(async () => {
  queryable = makeQueryable()
  conversations = createDatabaseCsConversationStore(queryable)
  messages = createDatabaseCsMessageStore(queryable)
  const conversation = await conversations.getOrCreateOpenConversation({
    id: randomUUID(),
    storeId,
    mode: "ai_draft",
    now: at(0),
  })
  conversationId = conversation.id
})

async function appendOwner(body: string, seconds: number): Promise<void> {
  await messages.appendMessage({
    id: randomUUID(),
    conversationId,
    sender: "owner",
    authorKind: "user",
    authorAdminId: null,
    body,
    now: at(seconds),
  })
}

async function appendDraft(body: string, seconds: number): Promise<string> {
  const message = await messages.appendMessage({
    id: randomUUID(),
    conversationId,
    sender: "assistant",
    authorKind: "ai",
    authorAdminId: null,
    status: "draft",
    body,
    now: at(seconds),
  })
  return message.id
}

describe("conversation mode ai_draft", () => {
  it("opens a conversation in ai_draft mode and toggles between postures", async () => {
    const record = await conversations.getConversationById(conversationId)
    expect(record?.mode).toBe("ai_draft")

    await conversations.setMode(conversationId, "ai", at(1))
    expect(
      (await conversations.getConversationById(conversationId))?.mode
    ).toBe("ai")

    await conversations.setMode(conversationId, "human", at(2))
    expect(
      (await conversations.getConversationById(conversationId))?.mode
    ).toBe("human")
  })

  it("surfaces ai_draft mode in the inbox summary", async () => {
    const summary = await conversations.getInboxConversationById(conversationId)
    expect(summary?.mode).toBe("ai_draft")
  })
})

describe("conversation flag", () => {
  it("flags and clears a conversation, reflected in record and inbox summary", async () => {
    await conversations.flagConversation(conversationId, "ai_error", at(1))
    const flagged = await conversations.getConversationById(conversationId)
    expect(flagged?.flaggedAt).not.toBeNull()
    expect(flagged?.flagReason).toBe("ai_error")
    const summary = await conversations.getInboxConversationById(conversationId)
    expect(summary?.flaggedAt).not.toBeNull()
    expect(summary?.flagReason).toBe("ai_error")

    await conversations.clearFlag(conversationId, at(2))
    const cleared = await conversations.getConversationById(conversationId)
    expect(cleared?.flaggedAt).toBeNull()
    expect(cleared?.flagReason).toBeNull()
  })
})

describe("draft visibility (the one-assistant illusion)", () => {
  it("hides drafts from every owner-facing read but shows them to the console", async () => {
    await appendOwner("도와주세요", 1)
    const draftId = await appendDraft("초안 답변입니다", 2)

    // Owner reads: draft is invisible.
    const ownerPage = await messages.listOwnerMessages({ conversationId })
    expect(ownerPage.messages.map((m) => m.body)).toEqual(["도와주세요"])
    expect(await messages.countUnreadForOwner(conversationId)).toBe(0)

    // Admin reads: draft is visible and marked as such.
    const adminPage = await messages.listAdminMessages({ conversationId })
    const draftRow = adminPage.messages.find((m) => m.id === draftId)
    expect(draftRow?.status).toBe("draft")
    expect(draftRow?.authorKind).toBe("ai")

    // getLatestPendingDraft returns the pending draft.
    expect((await messages.getLatestPendingDraft(conversationId))?.id).toBe(
      draftId
    )

    // markOwnerRead never touches a draft (it is not owner-visible).
    expect(await messages.markOwnerRead(conversationId, at(3))).toBe(0)
  })

  it("does not deliver a draft through the cursor even after the owner's cursor advances", async () => {
    await appendOwner("첫 메시지", 1)
    const firstPage = await messages.listOwnerMessages({ conversationId })
    await appendDraft("보이면 안 되는 초안", 2)
    const nextPage = await messages.listOwnerMessages({
      conversationId,
      after:
        firstPage.nextCursor === null
          ? undefined
          : decodeMessageCursor(firstPage.nextCursor),
    })
    expect(nextPage.messages).toHaveLength(0)
  })
})

describe("sendDraft", () => {
  it("promotes a draft to a sent, owner-visible message with a fresh timestamp", async () => {
    const draftId = await appendDraft("초안", 2)
    const sent = await messages.sendDraft({
      messageId: draftId,
      body: "운영자가 다듬은 답변",
      now: at(5),
    })
    expect(sent?.status).toBe("sent")
    expect(sent?.body).toBe("운영자가 다듬은 답변")
    expect(sent?.createdAt).toBe(at(5).toISOString())

    const ownerPage = await messages.listOwnerMessages({ conversationId })
    expect(ownerPage.messages.map((m) => m.body)).toEqual([
      "운영자가 다듬은 답변",
    ])
    expect(await messages.countUnreadForOwner(conversationId)).toBe(1)
    expect(await messages.getLatestPendingDraft(conversationId)).toBeUndefined()
  })

  it("is idempotent: a second send of the same draft flips nothing", async () => {
    const draftId = await appendDraft("초안", 2)
    expect(
      await messages.sendDraft({ messageId: draftId, body: "x", now: at(5) })
    ).not.toBeUndefined()
    expect(
      await messages.sendDraft({ messageId: draftId, body: "y", now: at(6) })
    ).toBeUndefined()
    const ownerPage = await messages.listOwnerMessages({ conversationId })
    expect(ownerPage.messages.map((m) => m.body)).toEqual(["x"])
  })
})

describe("discardDraft", () => {
  it("removes a single draft and leaves sent messages untouched", async () => {
    await appendOwner("질문", 1)
    const draftId = await appendDraft("초안", 2)
    expect(await messages.discardDraft(draftId)).toBe(true)
    expect(await messages.discardDraft(draftId)).toBe(false)
    expect(await messages.getLatestPendingDraft(conversationId)).toBeUndefined()
    const adminPage = await messages.listAdminMessages({ conversationId })
    expect(adminPage.messages.map((m) => m.body)).toEqual(["질문"])
  })

  it("discardPendingDrafts clears only drafts", async () => {
    await appendOwner("질문", 1)
    await appendDraft("초안1", 2)
    await appendDraft("초안2", 3)
    expect(await messages.discardPendingDrafts(conversationId)).toBe(2)
    expect(await messages.getLatestPendingDraft(conversationId)).toBeUndefined()
    const adminPage = await messages.listAdminMessages({ conversationId })
    expect(adminPage.messages).toHaveLength(1)
  })
})
