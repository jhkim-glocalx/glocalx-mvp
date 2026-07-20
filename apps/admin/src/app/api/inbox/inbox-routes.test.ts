import { randomUUID } from "node:crypto"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createAdminAuthStore } from "@/server/admin-auth-store"
import { createSqliteQueryable } from "@glocalx/db/sqlite-client"
import {
  applyMigrations,
  openDatabase,
  resetDatabaseFile,
  seedDemoData,
} from "@glocalx/db/sqlite"
import { createDatabaseCsConversationStore } from "@glocalx/db/support/conversation-store"
import { createDatabaseCsMessageContextStore } from "@glocalx/db/support/message-context-store"
import { createDatabaseCsMessageStore } from "@glocalx/db/support/message-store"

import { GET as listConversations } from "./conversations/route"
import { GET as getMessages } from "./conversations/[conversationId]/messages/route"
import { POST as reply } from "./conversations/[conversationId]/reply/route"
import { POST as resolve } from "./conversations/[conversationId]/resolve/route"
import { POST as assign } from "./conversations/[conversationId]/assign/route"
import { POST as setMode } from "./conversations/[conversationId]/mode/route"
import { POST as sendDraft } from "./conversations/[conversationId]/draft/send/route"
import { POST as discardDraft } from "./conversations/[conversationId]/draft/discard/route"

const origin = "http://localhost:3100"
const adminUserId = "admin-1"

async function useTempDatabase(): Promise<void> {
  const tempPath = await mkdtemp(join(tmpdir(), "glocalx-inbox-routes-"))
  vi.stubEnv("PLAYWRIGHT_TEST", "true")
  vi.stubEnv("GLOCALX_DB_PATH", join(tempPath, "routes.db"))
  resetDatabaseFile()
  const database = openDatabase()
  try {
    applyMigrations(database)
    seedDemoData(database)
    database
      .prepare(
        "INSERT INTO admin_users (id, email, password_hash, display_name, role, status, created_at) VALUES (?, 'op@example.com', 'hash', 'Op', 'OPERATOR', 'ACTIVE', ?)"
      )
      .run(adminUserId, new Date().toISOString())
  } finally {
    database.close()
  }
}

// A conversation with a single unread owner message, on the seeded demo store.
async function seedOwnerMessage(): Promise<string> {
  const database = openDatabase()
  try {
    const queryable = createSqliteQueryable(database)
    const conversation = await createDatabaseCsConversationStore(
      queryable
    ).getOrCreateOpenConversation({
      id: randomUUID(),
      storeId: "demo-store",
      mode: "human",
      now: new Date(),
    })
    const message = await createDatabaseCsMessageStore(queryable).appendMessage(
      {
        id: randomUUID(),
        conversationId: conversation.id,
        sender: "owner",
        authorKind: "user",
        authorAdminId: null,
        body: "GBP 연결이 막혔어요",
        now: new Date(),
      }
    )
    await createDatabaseCsMessageContextStore(queryable).attachContext({
      id: randomUUID(),
      messageId: message.id,
      capturedAt: new Date(),
      context: {
        section: "gbp_connect",
        stage: "oauth",
        activityTrail: [
          {
            section: "gbp_connect",
            action: "gbp_connect_started",
            occurredAt: new Date().toISOString(),
          },
        ],
      },
    })
    return conversation.id
  } finally {
    database.close()
  }
}

// Append a pending AI draft (author_kind='ai', status='draft') to a conversation
// and return its id — the row the console review surface acts on.
async function seedDraft(
  conversationId: string,
  body: string
): Promise<string> {
  const database = openDatabase()
  try {
    const draft = await createDatabaseCsMessageStore(
      createSqliteQueryable(database)
    ).appendMessage({
      id: randomUUID(),
      conversationId,
      sender: "assistant",
      authorKind: "ai",
      authorAdminId: null,
      status: "draft",
      body,
      now: new Date(),
    })
    return draft.id
  } finally {
    database.close()
  }
}

async function conversationMode(conversationId: string): Promise<string> {
  const database = openDatabase()
  try {
    const record = await createDatabaseCsConversationStore(
      createSqliteQueryable(database)
    ).getConversationById(conversationId)
    return record?.mode ?? "unknown"
  } finally {
    database.close()
  }
}

async function adminSessionCookie(): Promise<string> {
  const database = openDatabase()
  try {
    const sessionId = await createAdminAuthStore(
      createSqliteQueryable(database)
    ).createSession(adminUserId)
    return `glocalx_admin_session=${sessionId}`
  } finally {
    database.close()
  }
}

function getRequest(url: string, cookie?: string): NextRequest {
  return new NextRequest(url, {
    headers: cookie === undefined ? {} : { Cookie: cookie },
    method: "GET",
  })
}

function postRequest(
  url: string,
  options: {
    readonly cookie?: string
    readonly body?: unknown
    readonly withOrigin?: boolean
  }
): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (options.cookie !== undefined) {
    headers["Cookie"] = options.cookie
  }
  if (options.withOrigin !== false) {
    headers["Origin"] = origin
  }
  return new NextRequest(url, {
    body: JSON.stringify(options.body ?? {}),
    headers,
    method: "POST",
  })
}

function conversationParams(conversationId: string): {
  readonly params: Promise<{ readonly conversationId: string }>
} {
  return { params: Promise.resolve({ conversationId }) }
}

beforeEach(async () => {
  await useTempDatabase()
})

describe("inbox conversation list", () => {
  it("rejects an unauthenticated request", async () => {
    const response = await listConversations(
      getRequest(`${origin}/api/inbox/conversations`)
    )
    expect(response.status).toBe(401)
  })

  it("returns awaiting-reply conversations with store context", async () => {
    await seedOwnerMessage()
    const response = await listConversations(
      getRequest(
        `${origin}/api/inbox/conversations`,
        await adminSessionCookie()
      )
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      conversations: readonly {
        unreadFromOwner: number
        lastMessageSender: string
        storeName: string
      }[]
    }
    expect(body.conversations).toHaveLength(1)
    expect(body.conversations[0]?.unreadFromOwner).toBe(1)
    expect(body.conversations[0]?.lastMessageSender).toBe("owner")
  })
})

describe("inbox conversation detail", () => {
  it("surfaces per-message section/stage context to the operator", async () => {
    const conversationId = await seedOwnerMessage()
    const response = await getMessages(
      getRequest(
        `${origin}/api/inbox/conversations/${conversationId}/messages`,
        await adminSessionCookie()
      ),
      conversationParams(conversationId)
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      messages: readonly {
        authorKind: string
        context: { section: string; stage: string | null } | null
      }[]
    }
    expect(body.messages[0]?.authorKind).toBe("user")
    expect(body.messages[0]?.context?.section).toBe("gbp_connect")
    expect(body.messages[0]?.context?.stage).toBe("oauth")
  })

  it("404s an unknown conversation", async () => {
    const response = await getMessages(
      getRequest(
        `${origin}/api/inbox/conversations/nope/messages`,
        await adminSessionCookie()
      ),
      conversationParams("nope")
    )
    expect(response.status).toBe(404)
  })
})

describe("operator reply", () => {
  it("rejects a cross-origin post before touching data", async () => {
    const conversationId = await seedOwnerMessage()
    const response = await reply(
      postRequest(`${origin}/api/inbox/conversations/${conversationId}/reply`, {
        cookie: await adminSessionCookie(),
        body: { body: "hi" },
        withOrigin: false,
      }),
      conversationParams(conversationId)
    )
    expect(response.status).toBe(403)
  })

  it("writes the reply as an admin-authored assistant message and audits it", async () => {
    const conversationId = await seedOwnerMessage()
    const response = await reply(
      postRequest(`${origin}/api/inbox/conversations/${conversationId}/reply`, {
        cookie: await adminSessionCookie(),
        body: { body: "도와드릴게요" },
      }),
      conversationParams(conversationId)
    )
    expect(response.status).toBe(201)
    const body = (await response.json()) as {
      message: { sender: string; authorKind: string; authorAdminId: string }
    }
    expect(body.message.sender).toBe("assistant")
    expect(body.message.authorKind).toBe("admin")
    expect(body.message.authorAdminId).toBe(adminUserId)

    const database = openDatabase()
    try {
      const auditRow = database
        .prepare(
          "SELECT action, store_id, redacted_payload_json FROM audit_logs WHERE action = 'cs_reply'"
        )
        .get() as
        | { action: string; store_id: string; redacted_payload_json: string }
        | undefined
      expect(auditRow?.store_id).toBe("demo-store")
      expect(JSON.parse(auditRow?.redacted_payload_json ?? "{}")).toMatchObject(
        {
          adminUserId,
          conversationId,
        }
      )
    } finally {
      database.close()
    }
  })

  it("refuses to reply to a resolved conversation", async () => {
    const conversationId = await seedOwnerMessage()
    await resolve(
      postRequest(
        `${origin}/api/inbox/conversations/${conversationId}/resolve`,
        { cookie: await adminSessionCookie() }
      ),
      conversationParams(conversationId)
    )
    const response = await reply(
      postRequest(`${origin}/api/inbox/conversations/${conversationId}/reply`, {
        cookie: await adminSessionCookie(),
        body: { body: "too late" },
      }),
      conversationParams(conversationId)
    )
    expect(response.status).toBe(409)
  })
})

describe("assign and resolve", () => {
  it("assigns the conversation to the acting operator", async () => {
    const conversationId = await seedOwnerMessage()
    const response = await assign(
      postRequest(
        `${origin}/api/inbox/conversations/${conversationId}/assign`,
        {
          cookie: await adminSessionCookie(),
        }
      ),
      conversationParams(conversationId)
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      conversation: { assignedAdminId: string }
    }
    expect(body.conversation.assignedAdminId).toBe(adminUserId)
  })

  it("resolves the conversation and clears it from the open inbox", async () => {
    const conversationId = await seedOwnerMessage()
    await resolve(
      postRequest(
        `${origin}/api/inbox/conversations/${conversationId}/resolve`,
        { cookie: await adminSessionCookie() }
      ),
      conversationParams(conversationId)
    )
    const listResponse = await listConversations(
      getRequest(
        `${origin}/api/inbox/conversations`,
        await adminSessionCookie()
      )
    )
    const body = (await listResponse.json()) as {
      conversations: readonly unknown[]
    }
    expect(body.conversations).toHaveLength(0)
  })
})

describe("mode toggle", () => {
  it("rejects a cross-origin post before touching data", async () => {
    const conversationId = await seedOwnerMessage()
    const response = await setMode(
      postRequest(`${origin}/api/inbox/conversations/${conversationId}/mode`, {
        cookie: await adminSessionCookie(),
        body: { mode: "ai_draft" },
        withOrigin: false,
      }),
      conversationParams(conversationId)
    )
    expect(response.status).toBe(403)
  })

  it("flips the conversation mode and audits it", async () => {
    const conversationId = await seedOwnerMessage()
    const response = await setMode(
      postRequest(`${origin}/api/inbox/conversations/${conversationId}/mode`, {
        cookie: await adminSessionCookie(),
        body: { mode: "ai_draft" },
      }),
      conversationParams(conversationId)
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      conversation: { mode: string }
    }
    expect(body.conversation.mode).toBe("ai_draft")
    expect(await conversationMode(conversationId)).toBe("ai_draft")

    const database = openDatabase()
    try {
      const auditRow = database
        .prepare(
          "SELECT redacted_payload_json FROM audit_logs WHERE action = 'cs_set_mode'"
        )
        .get() as { redacted_payload_json: string } | undefined
      expect(JSON.parse(auditRow?.redacted_payload_json ?? "{}")).toMatchObject(
        {
          adminUserId,
          conversationId,
          mode: "ai_draft",
        }
      )
    } finally {
      database.close()
    }
  })

  it("rejects an unknown mode", async () => {
    const conversationId = await seedOwnerMessage()
    const response = await setMode(
      postRequest(`${origin}/api/inbox/conversations/${conversationId}/mode`, {
        cookie: await adminSessionCookie(),
        body: { mode: "autonomous" },
      }),
      conversationParams(conversationId)
    )
    expect(response.status).toBe(400)
  })
})

describe("ai draft review", () => {
  it("returns the pending draft alongside a draft-free transcript", async () => {
    const conversationId = await seedOwnerMessage()
    const draftId = await seedDraft(conversationId, "초안 답변")
    const response = await getMessages(
      getRequest(
        `${origin}/api/inbox/conversations/${conversationId}/messages`,
        await adminSessionCookie()
      ),
      conversationParams(conversationId)
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      messages: readonly { id: string; status: string }[]
      pendingDraft: { id: string; status: string } | null
    }
    // The draft rides on its own field, never in the append-only transcript.
    expect(body.messages.some((m) => m.id === draftId)).toBe(false)
    expect(body.messages.every((m) => m.status === "sent")).toBe(true)
    expect(body.pendingDraft?.id).toBe(draftId)
    expect(body.pendingDraft?.status).toBe("draft")
  })

  it("sends an edited draft as an owner-visible assistant message and audits it", async () => {
    const conversationId = await seedOwnerMessage()
    const draftId = await seedDraft(conversationId, "초안")
    const response = await sendDraft(
      postRequest(
        `${origin}/api/inbox/conversations/${conversationId}/draft/send`,
        {
          cookie: await adminSessionCookie(),
          body: { messageId: draftId, body: "운영자가 다듬은 답변" },
        }
      ),
      conversationParams(conversationId)
    )
    expect(response.status).toBe(201)
    const body = (await response.json()) as {
      message: { id: string; status: string; authorKind: string; body: string }
    }
    expect(body.message.status).toBe("sent")
    expect(body.message.authorKind).toBe("ai")
    expect(body.message.body).toBe("운영자가 다듬은 답변")

    const database = openDatabase()
    try {
      const auditRow = database
        .prepare(
          "SELECT redacted_payload_json FROM audit_logs WHERE action = 'cs_send_draft'"
        )
        .get() as { redacted_payload_json: string } | undefined
      expect(JSON.parse(auditRow?.redacted_payload_json ?? "{}")).toMatchObject(
        {
          adminUserId,
          conversationId,
          messageId: draftId,
        }
      )
    } finally {
      database.close()
    }
  })

  it("409s sending an already-sent or unknown draft", async () => {
    const conversationId = await seedOwnerMessage()
    const draftId = await seedDraft(conversationId, "초안")
    const cookie = await adminSessionCookie()
    const first = await sendDraft(
      postRequest(
        `${origin}/api/inbox/conversations/${conversationId}/draft/send`,
        { cookie, body: { messageId: draftId, body: "x" } }
      ),
      conversationParams(conversationId)
    )
    expect(first.status).toBe(201)
    const second = await sendDraft(
      postRequest(
        `${origin}/api/inbox/conversations/${conversationId}/draft/send`,
        { cookie, body: { messageId: draftId, body: "y" } }
      ),
      conversationParams(conversationId)
    )
    expect(second.status).toBe(409)
  })

  it("discards a pending draft and 409s a second discard", async () => {
    const conversationId = await seedOwnerMessage()
    const draftId = await seedDraft(conversationId, "초안")
    const cookie = await adminSessionCookie()
    const first = await discardDraft(
      postRequest(
        `${origin}/api/inbox/conversations/${conversationId}/draft/discard`,
        { cookie, body: { messageId: draftId } }
      ),
      conversationParams(conversationId)
    )
    expect(first.status).toBe(200)
    expect((await first.json()) as { discarded: boolean }).toEqual({
      discarded: true,
    })
    const second = await discardDraft(
      postRequest(
        `${origin}/api/inbox/conversations/${conversationId}/draft/discard`,
        { cookie, body: { messageId: draftId } }
      ),
      conversationParams(conversationId)
    )
    expect(second.status).toBe(409)
  })
})
