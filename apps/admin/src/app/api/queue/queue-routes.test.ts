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
import { createDatabaseCampaignStore } from "@glocalx/db/support/campaign-store"

import { GET as listQueue } from "./requests/route"
import { GET as getQueueRequest } from "./requests/[requestId]/route"
import { POST as startProduction } from "./requests/[requestId]/production/route"
import { POST as setFinalCopy } from "./requests/[requestId]/final-copy/route"
import { POST as submitForReview } from "./requests/[requestId]/review/route"
import { POST as registerAsset } from "./requests/[requestId]/assets/route"
import { POST as markNudged } from "./requests/[requestId]/nudge/route"

const origin = "http://localhost:3100"
const adminUserId = "admin-1"
const storeId = "demo-store"

async function useTempDatabase(): Promise<void> {
  const tempPath = await mkdtemp(join(tmpdir(), "glocalx-queue-routes-"))
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

async function seedRequest(brief = "Promote our brunch menu"): Promise<string> {
  const database = openDatabase()
  try {
    const campaigns = createDatabaseCampaignStore(
      createSqliteQueryable(database)
    )
    const request = await campaigns.createCampaignRequest({
      id: randomUUID(),
      storeId,
      brief,
      now: new Date(),
    })
    return request.id
  } finally {
    database.close()
  }
}

async function requestStatus(requestId: string): Promise<string | undefined> {
  const database = openDatabase()
  try {
    const detail = await createDatabaseCampaignStore(
      createSqliteQueryable(database)
    ).getCampaignRequestForOperator(requestId)
    return detail?.status
  } finally {
    database.close()
  }
}

// Registers a processed asset the way the route does, so the "send to owner"
// gate can be satisfied without driving the whole upload flow.
async function seedProcessedAsset(requestId: string): Promise<void> {
  const database = openDatabase()
  try {
    await createDatabaseCampaignStore(
      createSqliteQueryable(database)
    ).registerCampaignAsset({
      id: randomUUID(),
      requestId,
      storeId,
      kind: "processed",
      blobUrl: "https://stub.blob.glocalx.internal/processed.jpg",
      contentType: "image/jpeg",
      sizeBytes: 2048,
      uploadedBy: "admin",
      now: new Date(),
    })
  } finally {
    database.close()
  }
}

async function requestNudgedAt(requestId: string): Promise<string | null> {
  const database = openDatabase()
  try {
    const detail = await createDatabaseCampaignStore(
      createSqliteQueryable(database)
    ).getCampaignRequestForOperator(requestId)
    return detail?.nudgedAt ?? null
  } finally {
    database.close()
  }
}

// The owner-facing side of a pipeline notice: what actually landed in the
// store's chat thread, read the way the owner's transcript would.
function storeAssistantMessages(): readonly {
  body: string
  authorKind: string
  authorAdminId: string | null
}[] {
  const database = openDatabase()
  try {
    return database
      .prepare(
        `SELECT m.body, m.author_kind AS authorKind, m.author_admin_id AS authorAdminId
           FROM cs_messages m
           JOIN cs_conversations c ON c.id = m.conversation_id
          WHERE c.store_id = ? AND m.sender = 'assistant' AND m.status = 'sent'
          ORDER BY m.created_at ASC`
      )
      .all(storeId) as readonly {
      body: string
      authorKind: string
      authorAdminId: string | null
    }[]
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

function queueParams(requestId: string): {
  readonly params: Promise<{ readonly requestId: string }>
} {
  return { params: Promise.resolve({ requestId }) }
}

beforeEach(async () => {
  await useTempDatabase()
})

describe("queue list", () => {
  it("rejects an unauthenticated request", async () => {
    const response = await listQueue(getRequest(`${origin}/api/queue/requests`))
    expect(response.status).toBe(401)
  })

  it("returns every store's requests with counts", async () => {
    await seedRequest()
    const response = await listQueue(
      getRequest(`${origin}/api/queue/requests`, await adminSessionCookie())
    )
    const payload = (await response.json()) as {
      requests: readonly { storeName: string; originalCount: number }[]
    }

    expect(response.status).toBe(200)
    expect(payload.requests).toHaveLength(1)
    expect(payload.requests[0]?.originalCount).toBe(0)
  })
})

describe("queue request detail", () => {
  it("404s for an unknown request", async () => {
    const response = await getQueueRequest(
      getRequest(
        `${origin}/api/queue/requests/missing`,
        await adminSessionCookie()
      ),
      queueParams("missing")
    )
    expect(response.status).toBe(404)
  })
})

describe("start production", () => {
  it("rejects a cross-origin post before touching the database", async () => {
    const requestId = await seedRequest()
    const response = await startProduction(
      postRequest(`${origin}/api/queue/requests/${requestId}/production`, {
        cookie: await adminSessionCookie(),
        withOrigin: false,
      }),
      queueParams(requestId)
    )

    expect(response.status).toBe(403)
    expect(await requestStatus(requestId)).toBe("submitted")
  })

  it("moves a submitted request into production", async () => {
    const requestId = await seedRequest()
    const response = await startProduction(
      postRequest(`${origin}/api/queue/requests/${requestId}/production`, {
        cookie: await adminSessionCookie(),
      }),
      queueParams(requestId)
    )

    expect(response.status).toBe(200)
    expect(await requestStatus(requestId)).toBe("in_production")
  })

  // A second operator clicking the same card: the domain transition refuses
  // in_production as a source state, so this is a conflict, not a re-entry.
  it("409s when the request already left the submitted state", async () => {
    const requestId = await seedRequest()
    const cookie = await adminSessionCookie()
    await startProduction(
      postRequest(`${origin}/api/queue/requests/${requestId}/production`, {
        cookie,
      }),
      queueParams(requestId)
    )

    const second = await startProduction(
      postRequest(`${origin}/api/queue/requests/${requestId}/production`, {
        cookie,
      }),
      queueParams(requestId)
    )
    const payload = (await second.json()) as { currentStatus: string }

    expect(second.status).toBe(409)
    expect(payload.currentStatus).toBe("in_production")
  })
})

describe("final copy", () => {
  it("rejects copy while the request is not in production", async () => {
    const requestId = await seedRequest()
    const response = await setFinalCopy(
      postRequest(`${origin}/api/queue/requests/${requestId}/final-copy`, {
        cookie: await adminSessionCookie(),
        body: { finalCopy: "Brunch is back." },
      }),
      queueParams(requestId)
    )

    expect(response.status).toBe(409)
  })

  it("saves copy on an in-production request", async () => {
    const requestId = await seedRequest()
    const cookie = await adminSessionCookie()
    await startProduction(
      postRequest(`${origin}/api/queue/requests/${requestId}/production`, {
        cookie,
      }),
      queueParams(requestId)
    )

    const response = await setFinalCopy(
      postRequest(`${origin}/api/queue/requests/${requestId}/final-copy`, {
        cookie,
        body: { finalCopy: "Brunch is back." },
      }),
      queueParams(requestId)
    )
    const payload = (await response.json()) as {
      request: { finalCopy: string }
    }

    expect(response.status).toBe(200)
    expect(payload.request.finalCopy).toBe("Brunch is back.")
  })
})

describe("submit for review", () => {
  async function intoProduction(requestId: string, cookie: string) {
    await startProduction(
      postRequest(`${origin}/api/queue/requests/${requestId}/production`, {
        cookie,
      }),
      queueParams(requestId)
    )
  }

  it("refuses to hand the owner a request with no processed asset", async () => {
    const requestId = await seedRequest()
    const cookie = await adminSessionCookie()
    await intoProduction(requestId, cookie)

    const response = await submitForReview(
      postRequest(`${origin}/api/queue/requests/${requestId}/review`, {
        cookie,
      }),
      queueParams(requestId)
    )

    expect(response.status).toBe(422)
    expect(await requestStatus(requestId)).toBe("in_production")
  })

  it("refuses to hand the owner a request with no final copy", async () => {
    const requestId = await seedRequest()
    const cookie = await adminSessionCookie()
    await intoProduction(requestId, cookie)
    await seedProcessedAsset(requestId)

    const response = await submitForReview(
      postRequest(`${origin}/api/queue/requests/${requestId}/review`, {
        cookie,
      }),
      queueParams(requestId)
    )

    expect(response.status).toBe(422)
    expect(await requestStatus(requestId)).toBe("in_production")
  })

  it("moves a complete request to ready_for_review", async () => {
    const requestId = await seedRequest()
    const cookie = await adminSessionCookie()
    await intoProduction(requestId, cookie)
    await seedProcessedAsset(requestId)
    await setFinalCopy(
      postRequest(`${origin}/api/queue/requests/${requestId}/final-copy`, {
        cookie,
        body: { finalCopy: "Brunch is back." },
      }),
      queueParams(requestId)
    )

    const response = await submitForReview(
      postRequest(`${origin}/api/queue/requests/${requestId}/review`, {
        cookie,
      }),
      queueParams(requestId)
    )

    expect(response.status).toBe(200)
    expect(await requestStatus(requestId)).toBe("ready_for_review")
  })
})

describe("owner nudge", () => {
  // The whole point of the step: the owner is told in-app, and the queue still
  // holds an open task until an operator says they reached them out-of-band.
  async function handToOwner(requestId: string, cookie: string): Promise<void> {
    await startProduction(
      postRequest(`${origin}/api/queue/requests/${requestId}/production`, {
        cookie,
      }),
      queueParams(requestId)
    )
    await seedProcessedAsset(requestId)
    await setFinalCopy(
      postRequest(`${origin}/api/queue/requests/${requestId}/final-copy`, {
        cookie,
        body: { finalCopy: "Brunch is back." },
      }),
      queueParams(requestId)
    )
    await submitForReview(
      postRequest(`${origin}/api/queue/requests/${requestId}/review`, {
        cookie,
      }),
      queueParams(requestId)
    )
  }

  it("posts one assistant notice to the store's chat on hand-off", async () => {
    const requestId = await seedRequest()
    await handToOwner(requestId, await adminSessionCookie())

    const notices = storeAssistantMessages().filter((message) =>
      message.body.includes("마케팅 소재가 준비됐어요")
    )

    expect(notices).toHaveLength(1)
    // Operations spoke, but no operator typed it — the owner keeps seeing one
    // assistant.
    expect(notices[0]?.authorKind).toBe("admin")
    expect(notices[0]?.authorAdminId).toBeNull()
  })

  it("rejects a cross-origin nudge before touching the database", async () => {
    const requestId = await seedRequest()
    const cookie = await adminSessionCookie()
    await handToOwner(requestId, cookie)

    const response = await markNudged(
      postRequest(`${origin}/api/queue/requests/${requestId}/nudge`, {
        cookie,
        withOrigin: false,
      }),
      queueParams(requestId)
    )

    expect(response.status).toBe(403)
    expect(await requestNudgedAt(requestId)).toBeNull()
  })

  it("404s for an unknown request", async () => {
    const response = await markNudged(
      postRequest(`${origin}/api/queue/requests/missing/nudge`, {
        cookie: await adminSessionCookie(),
      }),
      queueParams("missing")
    )

    expect(response.status).toBe(404)
  })

  it("records the nudge on a request awaiting the owner", async () => {
    const requestId = await seedRequest()
    const cookie = await adminSessionCookie()
    await handToOwner(requestId, cookie)

    const response = await markNudged(
      postRequest(`${origin}/api/queue/requests/${requestId}/nudge`, {
        cookie,
      }),
      queueParams(requestId)
    )
    const payload = (await response.json()) as {
      request: { nudgedAt: string | null }
    }

    expect(response.status).toBe(200)
    expect(payload.request.nudgedAt).not.toBeNull()
  })

  // A double-click, or two operators on the same card: one nudge is recorded
  // and the loser is told to reload rather than writing a second audit entry.
  it("409s on a second nudge for the same review episode", async () => {
    const requestId = await seedRequest()
    const cookie = await adminSessionCookie()
    await handToOwner(requestId, cookie)
    await markNudged(
      postRequest(`${origin}/api/queue/requests/${requestId}/nudge`, {
        cookie,
      }),
      queueParams(requestId)
    )
    const firstNudgedAt = await requestNudgedAt(requestId)

    const second = await markNudged(
      postRequest(`${origin}/api/queue/requests/${requestId}/nudge`, {
        cookie,
      }),
      queueParams(requestId)
    )
    const payload = (await second.json()) as { currentStatus: string }

    expect(second.status).toBe(409)
    expect(payload.currentStatus).toBe("ready_for_review")
    expect(await requestNudgedAt(requestId)).toBe(firstNudgedAt)
  })

  it("409s on a request the owner is not waiting on", async () => {
    const requestId = await seedRequest()

    const response = await markNudged(
      postRequest(`${origin}/api/queue/requests/${requestId}/nudge`, {
        cookie: await adminSessionCookie(),
      }),
      queueParams(requestId)
    )
    const payload = (await response.json()) as { currentStatus: string }

    expect(response.status).toBe(409)
    expect(payload.currentStatus).toBe("submitted")
  })
})

describe("processed asset registration", () => {
  it("rejects an asset whose blob has no stored bytes", async () => {
    const requestId = await seedRequest()
    const cookie = await adminSessionCookie()
    await startProduction(
      postRequest(`${origin}/api/queue/requests/${requestId}/production`, {
        cookie,
      }),
      queueParams(requestId)
    )

    // No contentType/sizeBytes query string, so the stub store treats it as an
    // object that was never uploaded.
    const response = await registerAsset(
      postRequest(`${origin}/api/queue/requests/${requestId}/assets`, {
        cookie,
        body: {
          blobUrl: "https://stub.blob.glocalx.internal/never-uploaded.jpg",
          kind: "processed",
        },
      }),
      queueParams(requestId)
    )

    expect(response.status).toBe(404)
  })

  it("rejects a non-whitelisted content type reported by the store", async () => {
    const requestId = await seedRequest()
    const cookie = await adminSessionCookie()
    await startProduction(
      postRequest(`${origin}/api/queue/requests/${requestId}/production`, {
        cookie,
      }),
      queueParams(requestId)
    )

    const response = await registerAsset(
      postRequest(`${origin}/api/queue/requests/${requestId}/assets`, {
        cookie,
        body: {
          blobUrl:
            "https://stub.blob.glocalx.internal/evil.svg?contentType=image%2Fsvg%2Bxml&sizeBytes=100",
          kind: "processed",
        },
      }),
      queueParams(requestId)
    )

    expect(response.status).toBe(422)
  })

  it("registers a valid processed asset", async () => {
    const requestId = await seedRequest()
    const cookie = await adminSessionCookie()
    await startProduction(
      postRequest(`${origin}/api/queue/requests/${requestId}/production`, {
        cookie,
      }),
      queueParams(requestId)
    )

    const response = await registerAsset(
      postRequest(`${origin}/api/queue/requests/${requestId}/assets`, {
        cookie,
        body: {
          blobUrl:
            "https://stub.blob.glocalx.internal/final.jpg?contentType=image%2Fjpeg&sizeBytes=2048",
          kind: "processed",
        },
      }),
      queueParams(requestId)
    )
    const payload = (await response.json()) as {
      request: { assets: readonly { kind: string }[] }
    }

    expect(response.status).toBe(201)
    expect(payload.request.assets.some((a) => a.kind === "processed")).toBe(
      true
    )
  })
})
