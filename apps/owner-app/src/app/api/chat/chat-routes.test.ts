import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createSqliteQueryable } from "@glocalx/db/sqlite-client"
import {
  applyMigrations,
  openDatabase,
  resetDatabaseFile,
  seedDemoData,
} from "@glocalx/db/sqlite"
import { createDatabaseCsConversationStore } from "@glocalx/db/support/conversation-store"
import { createDatabaseCsMessageStore } from "@glocalx/db/support/message-store"

import { POST as flushActivity } from "../activity/flush/route"
import { GET as listMessages, POST as createMessage } from "./messages/route"
import { POST as markRead } from "./messages/read/route"

const demoCookieHeader =
  "glocalx_demo_session=demo-owner; glocalx_demo_store=demo-store"
const tempPaths: string[] = []

async function useTempDatabase(): Promise<void> {
  const tempPath = await mkdtemp(join(tmpdir(), "glocalx-chat-routes-"))
  tempPaths.push(tempPath)
  vi.stubEnv("PLAYWRIGHT_TEST", "true")
  vi.stubEnv("GLOCALX_DB_PATH", join(tempPath, "routes.db"))
  resetDatabaseFile()
  const database = openDatabase()
  try {
    applyMigrations(database)
    seedDemoData(database)
    // A seeded operator so the simulated reply satisfies the author FK.
    database
      .prepare(
        "INSERT INTO admin_users (id, email, password_hash, display_name, role, status, created_at) VALUES ('admin-1', 'op@example.com', 'hash', 'Op', 'OPERATOR', 'ACTIVE', ?)"
      )
      .run(new Date().toISOString())
  } finally {
    database.close()
  }
}

function jsonRequest(
  url: string,
  body: unknown,
  cookieHeader?: string
): NextRequest {
  return new NextRequest(url, {
    body: JSON.stringify(body),
    headers: {
      ...(cookieHeader === undefined ? {} : { Cookie: cookieHeader }),
      "Content-Type": "application/json",
    },
    method: "POST",
  })
}

function getRequest(url: string, cookieHeader?: string): NextRequest {
  return new NextRequest(url, {
    headers: cookieHeader === undefined ? {} : { Cookie: cookieHeader },
    method: "GET",
  })
}

const validContext = {
  section: "gbp_connect",
  stage: "oauth",
  activityTrail: [
    {
      section: "gbp_connect",
      action: "gbp_connect_started",
      occurredAt: "2026-07-18T00:00:00.000Z",
    },
  ],
}

const messagesUrl = "http://localhost:3000/api/chat/messages"

// Simulate an operator reply by writing directly to the store (the admin app
// does this in PR3), so owner-side unread/read behavior is testable now.
async function seedAssistantReply(body: string): Promise<void> {
  const database = openDatabase()
  try {
    const queryable = createSqliteQueryable(database)
    const conversation =
      await createDatabaseCsConversationStore(
        queryable
      ).getOpenConversationForStore("demo-store")
    if (conversation === undefined) {
      throw new Error("no open conversation to reply to")
    }
    await createDatabaseCsMessageStore(queryable).appendMessage({
      id: randomUUID(),
      conversationId: conversation.id,
      sender: "assistant",
      authorKind: "admin",
      authorAdminId: "admin-1",
      body,
      now: new Date(),
    })
  } finally {
    database.close()
  }
}

describe("owner chat API", () => {
  beforeEach(async () => {
    await useTempDatabase()
  })

  afterEach(async () => {
    resetDatabaseFile()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
    tempPaths.length = 0
  })

  it("requires a session to send", async () => {
    const response = await createMessage(
      jsonRequest(messagesUrl, { body: "hi", context: validContext })
    )
    expect(response.status).toBe(401)
  })

  it("rejects a malformed or invalid payload", async () => {
    const malformed = await createMessage(
      new NextRequest(messagesUrl, {
        body: "{",
        headers: {
          Cookie: demoCookieHeader,
          "Content-Type": "application/json",
        },
        method: "POST",
      })
    )
    expect(malformed.status).toBe(400)

    const invalid = await createMessage(
      jsonRequest(
        messagesUrl,
        { body: "   ", context: validContext },
        demoCookieHeader
      )
    )
    expect(invalid.status).toBe(400)
  })

  it("persists a sent message and returns it without authorship", async () => {
    const response = await createMessage(
      jsonRequest(
        messagesUrl,
        { body: "Stuck connecting Google", context: validContext },
        demoCookieHeader
      )
    )
    expect(response.status).toBe(201)
    const created = (await response.json()) as {
      message: Record<string, unknown>
    }
    expect(created.message).toMatchObject({
      sender: "owner",
      body: "Stuck connecting Google",
    })
    expect(Object.keys(created.message)).not.toContain("authorKind")

    const listed = await listMessages(getRequest(messagesUrl, demoCookieHeader))
    const body = (await listed.json()) as {
      messages: readonly Record<string, unknown>[]
      conversation: { mode: string } | null
    }
    expect(body.messages).toHaveLength(1)
    expect(body.conversation?.mode).toBe("human")
  })

  it("reports unread assistant replies and clears them on read", async () => {
    await createMessage(
      jsonRequest(
        messagesUrl,
        { body: "hello", context: validContext },
        demoCookieHeader
      )
    )
    await seedAssistantReply("An operator here — how can I help?")

    const beforeRead = await listMessages(
      getRequest(messagesUrl, demoCookieHeader)
    )
    expect(
      ((await beforeRead.json()) as { unreadCount: number }).unreadCount
    ).toBe(1)

    const read = await markRead(
      jsonRequest(`${messagesUrl}/read`, {}, demoCookieHeader)
    )
    expect(((await read.json()) as { unreadCount: number }).unreadCount).toBe(0)

    const afterRead = await listMessages(
      getRequest(messagesUrl, demoCookieHeader)
    )
    expect(
      ((await afterRead.json()) as { unreadCount: number }).unreadCount
    ).toBe(0)
  })

  it("returns an empty state before the owner has messaged", async () => {
    const listed = await listMessages(getRequest(messagesUrl, demoCookieHeader))
    expect(await listed.json()).toEqual({
      conversation: null,
      messages: [],
      nextCursor: null,
      unreadCount: 0,
    })
  })

  it("throttles a burst of sends per store", async () => {
    const send = () =>
      createMessage(
        jsonRequest(
          messagesUrl,
          { body: "spam", context: validContext },
          demoCookieHeader
        )
      )
    for (let index = 0; index < 20; index += 1) {
      expect((await send()).status).toBe(201)
    }
    const blocked = await send()
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get("Retry-After")).not.toBeNull()
  })
})

describe("activity flush API", () => {
  beforeEach(async () => {
    await useTempDatabase()
  })

  afterEach(async () => {
    resetDatabaseFile()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
    tempPaths.length = 0
  })

  const flushUrl = "http://localhost:3000/api/activity/flush"

  it("requires a session", async () => {
    const response = await flushActivity(
      jsonRequest(flushUrl, {
        events: [
          {
            section: "home",
            action: "section_viewed",
            occurredAt: "2026-07-18T00:00:00.000Z",
          },
        ],
      })
    )
    expect(response.status).toBe(401)
  })

  it("records whitelisted events", async () => {
    const response = await flushActivity(
      jsonRequest(
        flushUrl,
        {
          events: [
            {
              section: "home",
              action: "section_viewed",
              occurredAt: "2026-07-18T00:00:00.000Z",
            },
            {
              section: "gbp_connect",
              action: "gbp_connect_started",
              detail: { reason: "retry" },
              occurredAt: "2026-07-18T00:00:01.000Z",
            },
          ],
        },
        demoCookieHeader
      )
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ recorded: 2 })
  })

  it("rejects an action outside the fixed enum", async () => {
    const response = await flushActivity(
      jsonRequest(
        flushUrl,
        {
          events: [
            {
              section: "home",
              action: "not_a_real_action",
              occurredAt: "2026-07-18T00:00:00.000Z",
            },
          ],
        },
        demoCookieHeader
      )
    )
    expect(response.status).toBe(400)
  })
})
