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
import { createDatabaseCampaignStore } from "@glocalx/db/support/campaign-store"
import type { CampaignStatus } from "@glocalx/domain/campaign-state-machine"

import { GET as getRequestDetail } from "./requests/[requestId]/route"
import { POST as submitReviewDecision } from "./requests/[requestId]/review/route"

const demoCookieHeader =
  "glocalx_demo_session=demo-owner; glocalx_demo_store=demo-store"
const otherStoreCookieHeader =
  "glocalx_demo_session=other-user; glocalx_demo_store=other-demo-store"
const requestsUrl = "http://localhost:3000/api/campaigns/requests"
const storeId = "demo-store"
const tempPaths: string[] = []

async function useTempDatabase(): Promise<void> {
  const tempPath = await mkdtemp(join(tmpdir(), "glocalx-campaign-review-"))
  tempPaths.push(tempPath)
  vi.stubEnv("PLAYWRIGHT_TEST", "true")
  vi.stubEnv("GLOCALX_DB_PATH", join(tempPath, "routes.db"))
  resetDatabaseFile()
  const database = openDatabase()
  try {
    applyMigrations(database)
    seedDemoData(database)
    database
      .prepare(
        "INSERT INTO users (id, email, display_name, role, created_at) VALUES ('other-user', 'other@example.com', 'Other', 'OWNER', ?)"
      )
      .run(new Date().toISOString())
    database
      .prepare(
        "INSERT INTO stores (id, owner_user_id, name, address, category, onboarding_status, created_at) VALUES ('other-demo-store', 'other-user', 'Other', 'addr', 'cat', 'COMPLETED', ?)"
      )
      .run(new Date().toISOString())
  } finally {
    database.close()
  }
}

// A campaign request parked at an arbitrary status, standing in for whatever
// the operator queue did to it before the owner opened their screen.
async function seedRequestAt(status: CampaignStatus): Promise<string> {
  const database = openDatabase()
  try {
    const campaigns = createDatabaseCampaignStore(
      createSqliteQueryable(database)
    )
    const request = await campaigns.createCampaignRequest({
      id: randomUUID(),
      storeId,
      brief: "Promote our brunch menu",
      now: new Date(),
    })
    if (status !== "submitted") {
      await campaigns.updateCampaignRequestStatus({
        requestId: request.id,
        expectedStatus: "submitted",
        nextStatus: status,
        now: new Date(),
      })
    }
    return request.id
  } finally {
    database.close()
  }
}

async function seedPublishJob(
  requestId: string,
  channel: string,
  status: string,
  externalRef: string
): Promise<void> {
  const database = openDatabase()
  try {
    const now = new Date().toISOString()
    database
      .prepare(
        "INSERT INTO publish_jobs (id, request_id, channel, status, external_ref, attempt_count, last_error, idempotency_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)"
      )
      .run(
        randomUUID(),
        requestId,
        channel,
        status,
        externalRef,
        "operator-only failure detail",
        `publish-${channel}-${requestId}`,
        now,
        now
      )
  } finally {
    database.close()
  }
}

async function readRequest(requestId: string) {
  const database = openDatabase()
  try {
    return await createDatabaseCampaignStore(
      createSqliteQueryable(database)
    ).getCampaignRequestForOperator(requestId)
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

function routeParams(requestId: string) {
  return { params: Promise.resolve({ requestId }) }
}

describe("owner campaign review routes", () => {
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

  it("requires a session to read a request", async () => {
    const requestId = await seedRequestAt("ready_for_review")
    const response = await getRequestDetail(
      getRequest(`${requestsUrl}/${requestId}`),
      routeParams(requestId)
    )
    expect(response.status).toBe(401)
  })

  it("hides another store's request from the detail read", async () => {
    const requestId = await seedRequestAt("ready_for_review")
    const response = await getRequestDetail(
      getRequest(`${requestsUrl}/${requestId}`, otherStoreCookieHeader),
      routeParams(requestId)
    )
    expect(response.status).toBe(404)
  })

  it("records a go decision and approves the request", async () => {
    const requestId = await seedRequestAt("ready_for_review")

    const response = await submitReviewDecision(
      jsonRequest(
        `${requestsUrl}/${requestId}/review`,
        { decision: "go" },
        demoCookieHeader
      ),
      routeParams(requestId)
    )
    const payload = (await response.json()) as {
      request: { status: string; reviewEvents: readonly unknown[] }
    }

    expect(response.status).toBe(200)
    expect(payload.request.status).toBe("approved")
    expect(payload.request.reviewEvents).toHaveLength(1)
  })

  it("returns a changes-requested decision with the owner's note attached", async () => {
    const requestId = await seedRequestAt("ready_for_review")

    const response = await submitReviewDecision(
      jsonRequest(
        `${requestsUrl}/${requestId}/review`,
        {
          decision: "changes_requested",
          note: "두 번째 사진을 조금 더 밝게 해주세요.",
        },
        demoCookieHeader
      ),
      routeParams(requestId)
    )
    const payload = (await response.json()) as {
      request: {
        status: string
        reviewEvents: readonly { note: string | null }[]
      }
    }

    expect(response.status).toBe(200)
    expect(payload.request.status).toBe("changes_requested")
    expect(payload.request.reviewEvents[0]?.note).toBe(
      "두 번째 사진을 조금 더 밝게 해주세요."
    )
  })

  it("rejects a changes-requested decision with no note", async () => {
    const requestId = await seedRequestAt("ready_for_review")

    const response = await submitReviewDecision(
      jsonRequest(
        `${requestsUrl}/${requestId}/review`,
        { decision: "changes_requested" },
        demoCookieHeader
      ),
      routeParams(requestId)
    )

    expect(response.status).toBe(400)
    expect((await readRequest(requestId))?.status).toBe("ready_for_review")
  })

  // Delivery-plan acceptance: approving a request whose status changed
  // underneath the owner is rejected by the transition function with a clear
  // owner-visible message.
  it("409s a decision on a request that moved underneath the owner", async () => {
    const requestId = await seedRequestAt("changes_requested")

    const response = await submitReviewDecision(
      jsonRequest(
        `${requestsUrl}/${requestId}/review`,
        { decision: "go" },
        demoCookieHeader
      ),
      routeParams(requestId)
    )
    const payload = (await response.json()) as {
      status: string
      currentStatus: string
      message: string
    }

    expect(response.status).toBe(409)
    expect(payload.status).toBe("STATUS_CONFLICT")
    expect(payload.currentStatus).toBe("changes_requested")
    // The owner-facing message names the status in their own language.
    expect(payload.message).toContain("수정 요청됨")
    expect((await readRequest(requestId))?.status).toBe("changes_requested")
  })

  // Delivery-plan acceptance: rapid duplicate go/no-go actions create exactly
  // one campaign_review_events row.
  it("keeps a double-submitted decision to one review event", async () => {
    const requestId = await seedRequestAt("ready_for_review")
    const send = () =>
      submitReviewDecision(
        jsonRequest(
          `${requestsUrl}/${requestId}/review`,
          { decision: "go" },
          demoCookieHeader
        ),
        routeParams(requestId)
      )

    const first = await send()
    const second = await send()

    expect(first.status).toBe(200)
    expect(second.status).toBe(409)
    const stored = await readRequest(requestId)
    expect(stored?.status).toBe("approved")
    expect(stored?.reviewEvents).toHaveLength(1)
  })

  it("refuses a decision from another store's owner", async () => {
    const requestId = await seedRequestAt("ready_for_review")

    const response = await submitReviewDecision(
      jsonRequest(
        `${requestsUrl}/${requestId}/review`,
        { decision: "go" },
        otherStoreCookieHeader
      ),
      routeParams(requestId)
    )

    expect(response.status).toBe(404)
    expect((await readRequest(requestId))?.status).toBe("ready_for_review")
  })

  // Publishing is impossible before an owner "go" — the route half of the
  // domain test. A no_go settles the request as rejected, which START_PUBLISHING
  // refuses as a source state.
  it("settles a no_go decision as rejected", async () => {
    const requestId = await seedRequestAt("ready_for_review")

    const response = await submitReviewDecision(
      jsonRequest(
        `${requestsUrl}/${requestId}/review`,
        { decision: "no_go" },
        demoCookieHeader
      ),
      routeParams(requestId)
    )

    expect(response.status).toBe(200)
    expect((await readRequest(requestId))?.status).toBe("rejected")
  })

  // The owner's half of "history visible in both apps": per-channel outcomes,
  // trimmed of the operator-side detail (attempt counts, failure text, the
  // channel's own post id).
  it("surfaces per-channel publish status without operator detail", async () => {
    const requestId = await seedRequestAt("publishing")
    await seedPublishJob(requestId, "gbp", "published", "gbp-post-1")

    const response = await getRequestDetail(
      getRequest(`${requestsUrl}/${requestId}`, demoCookieHeader),
      routeParams(requestId)
    )
    const payload = (await response.json()) as {
      readonly request: {
        readonly publishJobs: readonly Record<string, unknown>[]
      }
    }

    expect(response.status).toBe(200)
    expect(payload.request.publishJobs).toHaveLength(1)
    const [job] = payload.request.publishJobs
    expect(job).toMatchObject({ channel: "gbp", status: "published" })
    expect(Object.keys(job ?? {}).sort()).toEqual([
      "channel",
      "status",
      "updatedAt",
    ])
  })
})
