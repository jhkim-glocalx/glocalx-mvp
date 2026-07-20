import { randomUUID } from "node:crypto"

import Database from "better-sqlite3"
import { beforeEach, describe, expect, it } from "vitest"

import { createSqliteQueryable } from "@glocalx/db/sqlite-client"
import { applyMigrations } from "@glocalx/db/sqlite"
import type { Queryable } from "@glocalx/db/types"
import {
  createDatabaseCsConversationStore,
  type CsConversationStore,
} from "@glocalx/db/support/conversation-store"
import {
  createDatabaseCsMessageContextStore,
  type CsMessageContextStore,
} from "@glocalx/db/support/message-context-store"
import {
  createDatabaseCsMessageStore,
  type CsMessageStore,
} from "@glocalx/db/support/message-store"
import type {
  CsAssistantAdapter,
  CsAssistantComposeInput,
} from "@glocalx/integrations/contracts"
import type { CsConversationMode } from "@glocalx/domain/support/contracts"

import {
  composeAssistantReply,
  csComposeFallbackReply,
  type CsGrounding,
} from "./ai-compose"

const storeId = "store-1"

function seed(database: Database.Database): void {
  database
    .prepare(
      "INSERT INTO users (id, email, display_name, role, created_at) VALUES (?, ?, ?, 'OWNER', ?)"
    )
    .run("user-1", "owner@example.com", "Owner", "2026-07-18T00:00:00.000Z")
  database
    .prepare(
      "INSERT INTO stores (id, owner_user_id, name, address, category, onboarding_status, created_at) VALUES (?, 'user-1', ?, ?, 'cat', 'COMPLETED', ?)"
    )
    .run(storeId, "브런치모먼트", "서울 마포구", "2026-07-18T00:00:00.000Z")
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

const grounding: CsGrounding = {
  storeName: "브런치모먼트",
  storeProfileSummary: "서울 마포구",
  gbpConnectionState: "missing_google_connection",
  campaignStatuses: [],
}

// Records the compose input so tests can assert the grounding/history assembly.
function recordingAssistant(reply: string): {
  readonly adapter: CsAssistantAdapter
  readonly inputs: CsAssistantComposeInput[]
} {
  const inputs: CsAssistantComposeInput[] = []
  return {
    inputs,
    adapter: {
      async composeReply(input) {
        inputs.push(input)
        return { kind: "ok", value: { reply } }
      },
    },
  }
}

const blockedAssistant: CsAssistantAdapter = {
  async composeReply() {
    return {
      kind: "blocked_by_credentials",
      code: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: ["OPENAI_API_KEY"],
    }
  },
}

const throwingAssistant: CsAssistantAdapter = {
  async composeReply() {
    throw new Error("boom: model output must never leak")
  },
}

let queryable: Queryable
let conversations: CsConversationStore
let messages: CsMessageStore
let contexts: CsMessageContextStore

beforeEach(() => {
  queryable = makeQueryable()
  conversations = createDatabaseCsConversationStore(queryable)
  messages = createDatabaseCsMessageStore(queryable)
  contexts = createDatabaseCsMessageContextStore(queryable)
})

// Open a conversation in `mode`, append an owner message with activity context,
// and return the ids the compose engine needs.
async function seedOwnerMessage(
  mode: CsConversationMode,
  body = "구글 연결 도와주세요"
): Promise<{ conversationId: string; messageId: string }> {
  const conversation = await conversations.getOrCreateOpenConversation({
    id: randomUUID(),
    storeId,
    mode,
    now: at(0),
  })
  const message = await messages.appendMessage({
    id: randomUUID(),
    conversationId: conversation.id,
    sender: "owner",
    authorKind: "user",
    authorAdminId: null,
    body,
    now: at(1),
  })
  await contexts.attachContext({
    id: randomUUID(),
    messageId: message.id,
    context: {
      section: "gbp_connect",
      stage: null,
      activityTrail: [
        {
          section: "gbp_connect",
          action: "gbp_connect_started",
          occurredAt: "2026-07-18T00:00:00.000Z",
        },
      ],
    },
    capturedAt: at(1),
  })
  return { conversationId: conversation.id, messageId: message.id }
}

function deps(csAssistant: CsAssistantAdapter) {
  return {
    conversationStore: conversations,
    messageStore: messages,
    messageContextStore: contexts,
    csAssistant,
    gatherGrounding: async (): Promise<CsGrounding> => grounding,
  }
}

describe("composeAssistantReply", () => {
  it("ai mode sends an owner-visible assistant reply grounded in the message", async () => {
    const { conversationId, messageId } = await seedOwnerMessage("ai")
    const assistant = recordingAssistant("네, 연결을 도와드릴게요.")

    await composeAssistantReply({
      deps: deps(assistant.adapter),
      conversationId,
      triggerMessageId: messageId,
      ownerMessage: "구글 연결 도와주세요",
      now: at(2),
    })

    const ownerView = await messages.listOwnerMessages({ conversationId })
    const assistantReplies = ownerView.messages.filter(
      (message) => message.sender === "assistant"
    )
    expect(assistantReplies.map((message) => message.body)).toEqual([
      "네, 연결을 도와드릴게요.",
    ])

    // Grounding + trigger reached the model; the trigger is not echoed as history.
    expect(assistant.inputs[0]).toMatchObject({
      storeName: "브런치모먼트",
      currentSection: "gbp_connect",
      ownerMessage: "구글 연결 도와주세요",
      recentActions: ["gbp_connect:gbp_connect_started"],
      history: [],
    })
  })

  it("ai_draft mode parks a draft that stays invisible to the owner", async () => {
    const { conversationId, messageId } = await seedOwnerMessage("ai_draft")

    await composeAssistantReply({
      deps: deps(recordingAssistant("초안입니다.").adapter),
      conversationId,
      triggerMessageId: messageId,
      ownerMessage: "구글 연결 도와주세요",
      now: at(2),
    })

    const ownerView = await messages.listOwnerMessages({ conversationId })
    expect(
      ownerView.messages.some((message) => message.sender === "assistant")
    ).toBe(false)

    const draft = await messages.getLatestPendingDraft(conversationId)
    expect(draft?.body).toBe("초안입니다.")
    expect(draft?.authorKind).toBe("ai")
  })

  it("ai_draft mode replaces a prior pending draft so at most one exists", async () => {
    const { conversationId, messageId } = await seedOwnerMessage("ai_draft")

    await composeAssistantReply({
      deps: deps(recordingAssistant("초안 1").adapter),
      conversationId,
      triggerMessageId: messageId,
      ownerMessage: "질문 1",
      now: at(2),
    })
    await composeAssistantReply({
      deps: deps(recordingAssistant("초안 2").adapter),
      conversationId,
      triggerMessageId: messageId,
      ownerMessage: "질문 2",
      now: at(3),
    })

    const admin = await messages.listAdminMessages({ conversationId })
    const drafts = admin.messages.filter(
      (message) => message.status === "draft"
    )
    expect(drafts.map((message) => message.body)).toEqual(["초안 2"])
  })

  it("ai failure posts a courteous owner-visible fallback and flags the conversation", async () => {
    const { conversationId, messageId } = await seedOwnerMessage("ai")

    await composeAssistantReply({
      deps: deps(throwingAssistant),
      conversationId,
      triggerMessageId: messageId,
      ownerMessage: "구글 연결 도와주세요",
      now: at(2),
    })

    const ownerView = await messages.listOwnerMessages({ conversationId })
    const assistantReplies = ownerView.messages.filter(
      (message) => message.sender === "assistant"
    )
    expect(assistantReplies.map((message) => message.body)).toEqual([
      csComposeFallbackReply,
    ])

    const conversation = await conversations.getConversationById(conversationId)
    expect(conversation?.flaggedAt).not.toBeNull()
    expect(conversation?.flagReason).toBe("COMPOSE_ERROR")
  })

  it("ai_draft failure flags without any owner-visible message", async () => {
    const { conversationId, messageId } = await seedOwnerMessage("ai_draft")

    await composeAssistantReply({
      deps: deps(blockedAssistant),
      conversationId,
      triggerMessageId: messageId,
      ownerMessage: "구글 연결 도와주세요",
      now: at(2),
    })

    const ownerView = await messages.listOwnerMessages({ conversationId })
    expect(
      ownerView.messages.some((message) => message.sender === "assistant")
    ).toBe(false)
    expect(await messages.getLatestPendingDraft(conversationId)).toBeUndefined()

    const conversation = await conversations.getConversationById(conversationId)
    expect(conversation?.flaggedAt).not.toBeNull()
    expect(conversation?.flagReason).toBe("BLOCKED_BY_CREDENTIALS")
  })

  it("a healthy composition clears a flag a prior failure raised", async () => {
    const { conversationId, messageId } = await seedOwnerMessage("ai")
    await conversations.flagConversation(conversationId, "COMPOSE_ERROR", at(1))

    await composeAssistantReply({
      deps: deps(recordingAssistant("복구된 답변").adapter),
      conversationId,
      triggerMessageId: messageId,
      ownerMessage: "구글 연결 도와주세요",
      now: at(2),
    })

    const conversation = await conversations.getConversationById(conversationId)
    expect(conversation?.flaggedAt).toBeNull()
    expect(conversation?.flagReason).toBeNull()
  })

  it("human mode is a no-op even if compose is triggered", async () => {
    const { conversationId, messageId } = await seedOwnerMessage("human")

    await composeAssistantReply({
      deps: deps(recordingAssistant("답변").adapter),
      conversationId,
      triggerMessageId: messageId,
      ownerMessage: "구글 연결 도와주세요",
      now: at(2),
    })

    const admin = await messages.listAdminMessages({ conversationId })
    expect(
      admin.messages.some((message) => message.sender === "assistant")
    ).toBe(false)
  })
})
