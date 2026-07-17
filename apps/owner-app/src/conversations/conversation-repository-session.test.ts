import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  applyMigrations,
  openDatabase,
  seedDemoData,
  type SqliteDatabase,
} from "@/server/db/sqlite"

import {
  appendAssistantMessage,
  appendOwnerMessage,
  createConversationSession,
  readConversationDraft,
  readCurrentConversationSession,
  recordConversationTurn,
  resumeConversationSession,
} from "./repository"

describe("conversation repository sessions", () => {
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

  it("resumes the current session and appends owner and assistant messages", () => {
    const session = createConversationSession(database, {
      id: "conversation-resume",
      kind: "posting",
      now: new Date("2026-06-14T00:00:00.000Z"),
      state: "awaiting_assets",
      storeId: "demo-store",
    })

    appendOwnerMessage(database, {
      clientEventId: "append-event-1",
      content: "게시글 초안 만들어줘.",
      kind: "posting",
      now: new Date("2026-06-14T00:01:00.000Z"),
      sessionId: session.id,
      storeId: "demo-store",
    })
    appendAssistantMessage(database, {
      content: "좋아요. 초안을 준비할게요.",
      kind: "posting",
      now: new Date("2026-06-14T00:02:00.000Z"),
      sessionId: session.id,
      storeId: "demo-store",
    })

    expect(
      resumeConversationSession(database, {
        kind: "posting",
        sessionId: session.id,
        storeId: "demo-store",
      })?.id
    ).toBe(session.id)
    expect(
      readCurrentConversationSession(database, {
        kind: "posting",
        storeId: "demo-store",
      })?.id
    ).toBe(session.id)
    expect(
      readConversationDraft(database, {
        sessionId: session.id,
        storeId: "demo-store",
      })?.messages.map((message) => message.role)
    ).toEqual(["owner", "assistant"])
  })

  it("serializes distinct events by updated timestamp and message sequence", () => {
    const session = createConversationSession(database, {
      id: "conversation-ordering",
      kind: "posting",
      now: new Date("2026-06-14T00:00:00.000Z"),
      state: "awaiting_assets",
      storeId: "demo-store",
    })

    recordConversationTurn(database, {
      assistantMessage: "첫 번째 응답",
      clientEventId: "ordering-event-1",
      eventId: "ordering-row-1",
      kind: "posting",
      nextState: "suggestion_presented",
      now: new Date("2026-06-14T00:01:00.000Z"),
      ownerMessage: "첫 번째 입력",
      publicResponse: { assistantMessage: "첫 번째 응답" },
      sessionId: session.id,
      slots: [],
      storeId: "demo-store",
    })
    recordConversationTurn(database, {
      assistantMessage: "두 번째 응답",
      clientEventId: "ordering-event-2",
      eventId: "ordering-row-2",
      kind: "posting",
      nextState: "draft_ready",
      now: new Date("2026-06-14T00:02:00.000Z"),
      ownerMessage: "두 번째 입력",
      publicResponse: { assistantMessage: "두 번째 응답" },
      sessionId: session.id,
      slots: [],
      storeId: "demo-store",
    })

    const draft = readConversationDraft(database, {
      sessionId: session.id,
      storeId: "demo-store",
    })

    expect(draft?.session.updatedAt).toBe("2026-06-14T00:02:00.000Z")
    expect(draft?.session.state).toBe("draft_ready")
    expect(draft?.messages.map((message) => message.sequence)).toEqual([
      1, 2, 3, 4,
    ])
  })
})
