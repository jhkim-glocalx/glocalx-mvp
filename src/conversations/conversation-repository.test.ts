import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"

import {
  applyMigrations,
  openDatabase,
  seedDemoData,
  type SqliteDatabase,
} from "@/server/db/sqlite"

import {
  completeConversationSession,
  createConversationSession,
  readConversationDraft,
  recordConversationTurn,
  selectConversationCandidate,
} from "./repository"

const countRowSchema = z.object({
  count: z.number(),
})

type ConversationScopedTable =
  | "conversation_events"
  | "conversation_messages"
  | "conversation_slot_values"

function readSessionCount(
  database: SqliteDatabase,
  tableName: ConversationScopedTable,
  sessionId: string
): number {
  const row = countRowSchema.parse(
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM ${tableName} WHERE session_id = ?`
      )
      .get(sessionId)
  )
  return row.count
}

describe("conversation repository", () => {
  const tempPaths: string[] = []
  let database: SqliteDatabase

  beforeEach(async () => {
    const tempPath = await mkdtemp(join(tmpdir(), "glocalx-conversation-"))
    tempPaths.push(tempPath)
    database = openDatabase(join(tempPath, "conversation.db"))
    applyMigrations(database)
    seedDemoData(database)
  })

  afterEach(async () => {
    database.close()
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
    tempPaths.length = 0
  })

  it("replays a duplicate clientEventId without duplicating messages, slots, or events", () => {
    const session = createConversationSession(database, {
      id: "conversation-replay",
      kind: "onboarding",
      now: new Date("2026-06-14T00:00:00.000Z"),
      state: "slot_elicitation",
      storeId: "demo-store",
    })

    const first = recordConversationTurn(database, {
      assistantMessage: "번호를 확인했어요.",
      clientEventId: "client-event-1",
      eventId: "event-1",
      kind: "onboarding",
      nextState: "profile_summary",
      now: new Date("2026-06-14T00:01:00.000Z"),
      ownerMessage: "전화번호는 02-1234-5678이에요.",
      publicResponse: { assistantMessage: "번호를 확인했어요." },
      sessionId: session.id,
      slots: [
        {
          confidence: 0.97,
          key: "phone",
          source: "owner_message",
          value: "02-1234-5678",
        },
      ],
      storeId: "demo-store",
    })

    const second = recordConversationTurn(database, {
      assistantMessage: "다른 응답은 저장되면 안 돼요.",
      clientEventId: "client-event-1",
      eventId: "event-2",
      kind: "onboarding",
      nextState: "slot_clarification",
      now: new Date("2026-06-14T00:02:00.000Z"),
      ownerMessage: "다시 눌렀어요.",
      publicResponse: { assistantMessage: "다른 응답은 저장되면 안 돼요." },
      sessionId: session.id,
      slots: [
        {
          confidence: 0.1,
          key: "phone",
          source: "owner_message",
          value: "010-9999-0000",
        },
      ],
      storeId: "demo-store",
    })

    expect(first.kind).toBe("created")
    expect(second).toEqual({
      kind: "replayed",
      response: { assistantMessage: "번호를 확인했어요." },
    })
    expect(
      readSessionCount(database, "conversation_messages", session.id)
    ).toBe(2)
    expect(
      readSessionCount(database, "conversation_slot_values", session.id)
    ).toBe(1)
    expect(readSessionCount(database, "conversation_events", session.id)).toBe(
      1
    )
  })

  it("reads the current draft only for the owning store", () => {
    const session = createConversationSession(database, {
      id: "conversation-owner-filter",
      kind: "posting",
      now: new Date("2026-06-14T00:00:00.000Z"),
      state: "awaiting_assets",
      storeId: "demo-store",
    })

    recordConversationTurn(database, {
      assistantMessage: "초안을 준비할게요.",
      clientEventId: "client-event-2",
      eventId: "event-3",
      kind: "posting",
      nextState: "draft_ready",
      now: new Date("2026-06-14T00:01:00.000Z"),
      ownerMessage: "이번 주말 신메뉴 알려줘.",
      publicResponse: { assistantMessage: "초안을 준비할게요." },
      sessionId: session.id,
      slots: [
        {
          confidence: 0.9,
          key: "owner_intent",
          source: "owner_message",
          value: "이번 주말 신메뉴",
        },
      ],
      storeId: "demo-store",
    })

    expect(
      readConversationDraft(database, {
        sessionId: session.id,
        storeId: "demo-store",
      })?.slots
    ).toHaveLength(1)
    expect(
      readConversationDraft(database, {
        sessionId: session.id,
        storeId: "not-demo-store",
      })
    ).toBeUndefined()
  })

  it("selects a candidate, completes a session, and rolls back later writes", () => {
    const session = createConversationSession(database, {
      id: "conversation-complete",
      kind: "onboarding",
      now: new Date("2026-06-14T00:00:00.000Z"),
      state: "candidate_selection",
      storeId: "demo-store",
    })

    selectConversationCandidate(database, {
      candidateId: "naver-candidate-1",
      candidateJson: { name: "브런치모먼트 홍대점" },
      now: new Date("2026-06-14T00:01:00.000Z"),
      sessionId: session.id,
      storeId: "demo-store",
    })
    completeConversationSession(database, {
      now: new Date("2026-06-14T00:02:00.000Z"),
      sessionId: session.id,
      storeId: "demo-store",
    })

    const beforeCounts = {
      events: readSessionCount(database, "conversation_events", session.id),
      messages: readSessionCount(database, "conversation_messages", session.id),
    }

    expect(() =>
      recordConversationTurn(database, {
        assistantMessage: "완료 뒤에는 저장되면 안 돼요.",
        clientEventId: "client-event-3",
        eventId: "event-4",
        kind: "onboarding",
        nextState: "slot_elicitation",
        now: new Date("2026-06-14T00:03:00.000Z"),
        ownerMessage: "완료 이후 입력",
        publicResponse: { assistantMessage: "완료 뒤에는 저장되면 안 돼요." },
        sessionId: session.id,
        slots: [],
        storeId: "demo-store",
      })
    ).toThrow("ConversationSessionCompletedError")

    expect(readSessionCount(database, "conversation_events", session.id)).toBe(
      beforeCounts.events
    )
    expect(
      readSessionCount(database, "conversation_messages", session.id)
    ).toBe(beforeCounts.messages)
  })

  it("rolls back malformed slot input inside the turn transaction", () => {
    const session = createConversationSession(database, {
      id: "conversation-invalid-slot",
      kind: "onboarding",
      now: new Date("2026-06-14T00:00:00.000Z"),
      state: "slot_elicitation",
      storeId: "demo-store",
    })

    expect(() =>
      recordConversationTurn(database, {
        assistantMessage: "저장되면 안 돼요.",
        clientEventId: "client-event-invalid",
        eventId: "event-invalid",
        kind: "onboarding",
        nextState: "profile_summary",
        now: new Date("2026-06-14T00:01:00.000Z"),
        ownerMessage: "값이 이상해요.",
        publicResponse: { assistantMessage: "저장되면 안 돼요." },
        sessionId: session.id,
        slots: [
          {
            confidence: 2,
            key: "phone",
            source: "owner_message",
            value: "02-1234-5678",
          },
        ],
        storeId: "demo-store",
      })
    ).toThrow("ConversationInvalidSlotError")

    expect(
      readSessionCount(database, "conversation_messages", session.id)
    ).toBe(0)
    expect(
      readSessionCount(database, "conversation_slot_values", session.id)
    ).toBe(0)
    expect(readSessionCount(database, "conversation_events", session.id)).toBe(
      0
    )
  })
})
