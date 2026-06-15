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
  readConversationReplay,
  readRedactedConversationSupportView,
} from "./repository"

describe("conversation repository support views", () => {
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

  it("returns redacted support views and exact replay responses", () => {
    const replay = readConversationReplay(database, {
      clientEventId: "demo-client-event",
      sessionId: "demo-conversation-session",
      storeId: "demo-store",
    })
    const supportView = readRedactedConversationSupportView(database, {
      sessionId: "demo-conversation-session",
      storeId: "demo-store",
    })

    expect(replay).toEqual({
      assistantMessage: "확인했어요. 요약을 보여드릴게요.",
    })
    expect(supportView?.messages).toContainEqual(
      expect.objectContaining({ content: "전화번호는 [REDACTED_PHONE]입니다." })
    )
    expect(JSON.stringify(supportView)).not.toContain("02-1234-5678")
  })
})
