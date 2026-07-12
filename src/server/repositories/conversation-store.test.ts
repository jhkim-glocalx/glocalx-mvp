import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { openDatabaseContext, type Queryable } from "@/server/db"
import { hasConfiguredPostgresDirectUrl } from "@/server/db/postgres/direct-url.ts"
import { applyMigrations, seedDemoData } from "@/server/db/sqlite"

import { createDatabaseConversationStore } from "./conversation-store"

const tempDirectories: string[] = []

const countSchema = z
  .union([z.number(), z.string(), z.bigint()])
  .transform((value) => Number(value))

const conversationRowsSchema = z.object({
  assistantMessages: countSchema,
  events: countSchema,
  messages: countSchema,
  slots: countSchema,
})

function createTempDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "glocalx-conversation-store-"))
  tempDirectories.push(directory)
  return join(directory, "test.db")
}

async function readConversationRows(
  queryable: Queryable,
  sessionId: string
): Promise<z.infer<typeof conversationRowsSchema>> {
  return conversationRowsSchema.parse(
    await queryable.queryOne(
      'SELECT (SELECT COUNT(*) FROM conversation_messages WHERE session_id = ?) AS "messages", (SELECT COUNT(*) FROM conversation_messages WHERE session_id = ? AND role = \'assistant\') AS "assistantMessages", (SELECT COUNT(*) FROM conversation_slot_values WHERE session_id = ?) AS "slots", (SELECT COUNT(*) FROM conversation_events WHERE session_id = ?) AS "events"',
      [sessionId, sessionId, sessionId, sessionId]
    )
  )
}

async function runDuplicateReplayScenario(queryable: Queryable): Promise<void> {
  const store = createDatabaseConversationStore(queryable)
  const session = await store.createSession({
    id: "conversation-queryable-replay",
    kind: "onboarding",
    now: new Date("2026-06-14T00:00:00.000Z"),
    state: "slot_elicitation",
    storeId: "demo-store",
  })

  const first = await store.recordTurn({
    assistantMessage: "번호를 확인했어요.",
    clientEventId: "queryable-client-event",
    eventId: "queryable-event-1",
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
  const second = await store.recordTurn({
    assistantMessage: "저장되면 안 돼요.",
    clientEventId: "queryable-client-event",
    eventId: "queryable-event-2",
    kind: "onboarding",
    nextState: "slot_clarification",
    now: new Date("2026-06-14T00:02:00.000Z"),
    ownerMessage: "중복 제출",
    publicResponse: { assistantMessage: "저장되면 안 돼요." },
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
  const draft = await store.readDraft({
    sessionId: session.id,
    storeId: "demo-store",
  })
  const rows = await readConversationRows(queryable, session.id)

  expect(first.kind).toBe("created")
  expect(second).toEqual({
    kind: "replayed",
    response: { assistantMessage: "번호를 확인했어요." },
  })
  expect(draft?.messages.map((message) => message.sequence)).toEqual([1, 2])
  expect(draft?.messages[0]?.redactedContent).toBe(
    "전화번호는 [REDACTED_PHONE]이에요."
  )
  expect(rows).toEqual({
    assistantMessages: 1,
    events: 1,
    messages: 2,
    slots: 1,
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("database conversation store", () => {
  it("records and replays duplicate turns through the SQLite queryable boundary", async () => {
    // Given: a migrated SQLite database exposed only through Queryable.
    vi.stubEnv("DATABASE_PROVIDER", "sqlite")
    vi.stubEnv("GLOCALX_DB_PATH", createTempDatabasePath())
    const context = await openDatabaseContext()
    applyMigrations(context.legacySqliteDatabase)
    seedDemoData(context.legacySqliteDatabase)

    try {
      // When / Then: duplicate clientEventId returns replay and leaves one event.
      await runDuplicateReplayScenario(context.queryable)
    } finally {
      await context.close()
    }
  })

  it("runs Postgres conversation checks when local Postgres env is configured", async () => {
    // Given: live Postgres integration is intentionally gated by both URLs.
    const missingEnvNames = [
      ...(!process.env["DATABASE_URL"] ? ["DATABASE_URL"] : []),
      ...(hasConfiguredPostgresDirectUrl(process.env)
        ? []
        : [
            "DATABASE_URL_DIRECT or DATABASE_URL_UNPOOLED or POSTGRES_URL_NON_POOLING",
          ]),
    ]
    if (missingEnvNames.length > 0) {
      console.info(`BLOCKED_BY_ENV missing ${missingEnvNames.join(",")}`)
      return
    }

    vi.stubEnv("DATABASE_PROVIDER", "postgres")
    const context = await openDatabaseContext()

    try {
      // When / Then: the same repository boundary runs on the Postgres queryable.
      await context.queryable.transaction(runDuplicateReplayScenario)
    } finally {
      await context.close()
    }
  })
})
