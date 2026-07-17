import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"

import { applyMigrations, openDatabase } from "@glocalx/db/sqlite"

const textRowSchema = z.object({
  value: z.string(),
})

const indexRowSchema = z.object({
  name: z.string(),
  unique: z.number(),
})

describe("conversation repository schema", () => {
  const tempPaths: string[] = []

  afterEach(async () => {
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
    tempPaths.length = 0
  })

  it("creates conversation tables and idempotency indexes", async () => {
    const tempPath = await mkdtemp(join(tmpdir(), "glocalx-conversation-"))
    tempPaths.push(tempPath)
    const database = openDatabase(join(tempPath, "conversation.db"))

    applyMigrations(database)

    const tableNames = z
      .array(textRowSchema)
      .parse(
        database
          .prepare(
            "SELECT name AS value FROM sqlite_master WHERE type = 'table'"
          )
          .all()
      )
      .map((row) => row.value)

    expect(tableNames).toEqual(
      expect.arrayContaining([
        "conversation_sessions",
        "conversation_messages",
        "conversation_slot_values",
        "conversation_events",
      ])
    )

    const messageIndexes = z
      .array(indexRowSchema)
      .parse(database.prepare("PRAGMA index_list(conversation_messages)").all())
    const eventIndexes = z
      .array(indexRowSchema)
      .parse(database.prepare("PRAGMA index_list(conversation_events)").all())

    expect(messageIndexes).toContainEqual(
      expect.objectContaining({
        name: "idx_conversation_messages_client_event",
        unique: 1,
      })
    )
    expect(eventIndexes).toContainEqual(
      expect.objectContaining({
        name: "idx_conversation_events_client_event",
        unique: 1,
      })
    )
    database.close()
  })
})
