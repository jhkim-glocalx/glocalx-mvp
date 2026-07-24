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
import { createDatabaseCsMessageStore } from "@glocalx/db/support/message-store"
import { createDatabaseCsConversationStore } from "@glocalx/db/support/conversation-store"
import { createDatabasePublishJobStore } from "@glocalx/db/support/publish-job-store"
import type { PublishJob } from "@glocalx/domain/campaign-contracts"
import type * as integrations from "@glocalx/integrations"

// Stub adapters always succeed, so a channel failure has to be injected. Only
// the Instagram publisher is swapped; everything else stays the real stub, so
// the GBP leg still exercises the credentials read and the media signing.
const instagramFails = { value: false }
// The stub adapter discards its input, so the recorder is the only way to prove
// which account a publish actually went out on.
const instagramCalls: {
  account?: { accessToken: string; accountRef: string } | undefined
}[] = []
vi.mock("@glocalx/integrations", async (importOriginal) => {
  const actual = await importOriginal<typeof integrations>()
  return {
    ...actual,
    createIntegrationAdapters: () => {
      const adapters = actual.createIntegrationAdapters()
      return {
        ...adapters,
        instagramPosts: {
          createPost: async (
            input: Parameters<typeof adapters.instagramPosts.createPost>[0]
          ) => {
            instagramCalls.push({ account: input.account })
            return instagramFails.value
              ? ({
                  kind: "blocked_by_credentials",
                  code: "BLOCKED_BY_CREDENTIALS",
                  missingEnvVars: ["INSTAGRAM_ACCESS_TOKEN"],
                } as const)
              : adapters.instagramPosts.createPost(input)
          },
        },
      }
    },
  }
})

import { POST as publishCampaign } from "./requests/[requestId]/publish/route"

const origin = "http://localhost:3100"
const adminUserId = "admin-1"
const storeId = "demo-store"

async function useTempDatabase(): Promise<void> {
  const tempPath = await mkdtemp(join(tmpdir(), "glocalx-publish-routes-"))
  vi.stubEnv("PLAYWRIGHT_TEST", "true")
  vi.stubEnv("GLOCALX_DB_PATH", join(tempPath, "routes.db"))
  resetDatabaseFile()
  const database = openDatabase()
  try {
    applyMigrations(database)
    // The demo seed gives demo-store a VERIFIED GBP location, a Google OAuth
    // connection, and a linked Instagram account — both channels eligible.
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

async function withDatabase<TResult>(
  work: (
    queryable: ReturnType<typeof createSqliteQueryable>
  ) => Promise<TResult>
): Promise<TResult> {
  const database = openDatabase()
  try {
    return await work(createSqliteQueryable(database))
  } finally {
    database.close()
  }
}

// A request that has been through production and the owner's "go" — the only
// state a first publish can start from.
async function seedApprovedRequest(): Promise<string> {
  return withDatabase(async (queryable) => {
    const campaigns = createDatabaseCampaignStore(queryable)
    const now = new Date()
    const request = await campaigns.createCampaignRequest({
      id: randomUUID(),
      storeId,
      brief: "Promote our brunch menu",
      now,
    })
    await campaigns.registerCampaignAsset({
      id: randomUUID(),
      requestId: request.id,
      storeId,
      kind: "processed",
      blobUrl: "https://stub.blob.glocalx.internal/processed.jpg",
      contentType: "image/jpeg",
      sizeBytes: 2048,
      uploadedBy: "admin",
      now,
    })
    await campaigns.setCampaignFinalCopy({
      requestId: request.id,
      finalCopy: "이번 주말 브런치 신메뉴를 만나보세요.",
      now,
    })
    await campaigns.updateCampaignRequestStatus({
      requestId: request.id,
      expectedStatus: "submitted",
      nextStatus: "approved",
      now,
    })
    return request.id
  })
}

async function requestStatus(requestId: string): Promise<string | undefined> {
  return withDatabase(async (queryable) => {
    const detail =
      await createDatabaseCampaignStore(
        queryable
      ).getCampaignRequestForOperator(requestId)
    return detail?.status
  })
}

async function publishJobs(requestId: string): Promise<readonly PublishJob[]> {
  return withDatabase((queryable) =>
    createDatabasePublishJobStore(queryable).listPublishJobs(requestId)
  )
}

async function setInstagramLinkStatus(status: string): Promise<void> {
  await withDatabase(async (queryable) => {
    await queryable.execute(
      "UPDATE store_channel_links SET status = ? WHERE store_id = ? AND channel = 'instagram'",
      [status, storeId]
    )
  })
}

async function deleteOrgCredential(): Promise<void> {
  await withDatabase(async (queryable) => {
    await queryable.execute(
      "DELETE FROM org_credentials WHERE provider = 'google_org'"
    )
  })
}

async function setOrgCredentialExpiry(expiresAt: string): Promise<void> {
  await withDatabase(async (queryable) => {
    await queryable.execute(
      "UPDATE org_credentials SET expires_at = ? WHERE provider = 'google_org'",
      [expiresAt]
    )
  })
}

async function setStoreInstagramToken(token: string | null): Promise<void> {
  await withDatabase(async (queryable) => {
    await queryable.execute(
      "UPDATE store_channel_links SET encrypted_token = ? WHERE store_id = ? AND channel = 'instagram'",
      [token, storeId]
    )
  })
}

async function ownerVisibleMessages(): Promise<readonly string[]> {
  return withDatabase(async (queryable) => {
    const conversation =
      await createDatabaseCsConversationStore(
        queryable
      ).getOpenConversationForStore(storeId)
    if (conversation === undefined) {
      return []
    }
    const page = await createDatabaseCsMessageStore(
      queryable
    ).listOwnerMessages({ conversationId: conversation.id, limit: 50 })
    return page.messages.map((message) => message.body)
  })
}

async function adminSessionCookie(): Promise<string> {
  return withDatabase(async (queryable) => {
    const sessionId =
      await createAdminAuthStore(queryable).createSession(adminUserId)
    return `glocalx_admin_session=${sessionId}`
  })
}

function publishRequest(
  requestId: string,
  options: {
    readonly cookie?: string
    readonly channels?: readonly string[]
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
  return new NextRequest(`${origin}/api/queue/requests/${requestId}/publish`, {
    body: JSON.stringify({
      channels: options.channels ?? ["gbp", "instagram"],
    }),
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
  instagramFails.value = false
  instagramCalls.length = 0
  await useTempDatabase()
})

describe("campaign publish", () => {
  it("rejects an unauthenticated request", async () => {
    const requestId = await seedApprovedRequest()
    const response = await publishCampaign(
      publishRequest(requestId, {}),
      queueParams(requestId)
    )
    expect(response.status).toBe(401)
    expect(await publishJobs(requestId)).toHaveLength(0)
  })

  it("rejects a cross-origin post before touching the database", async () => {
    const requestId = await seedApprovedRequest()
    const response = await publishCampaign(
      publishRequest(requestId, {
        cookie: await adminSessionCookie(),
        withOrigin: false,
      }),
      queueParams(requestId)
    )

    expect(response.status).toBe(403)
    expect(await requestStatus(requestId)).toBe("approved")
  })

  it("refuses to publish before the owner's go", async () => {
    const requestId = await seedApprovedRequest()
    await withDatabase(async (queryable) => {
      await createDatabaseCampaignStore(queryable).updateCampaignRequestStatus({
        requestId,
        expectedStatus: "approved",
        nextStatus: "ready_for_review",
        now: new Date(),
      })
    })

    const response = await publishCampaign(
      publishRequest(requestId, { cookie: await adminSessionCookie() }),
      queueParams(requestId)
    )

    expect(response.status).toBe(409)
    expect(await publishJobs(requestId)).toHaveLength(0)
    expect(await requestStatus(requestId)).toBe("ready_for_review")
  })

  it("publishes an approved request to both channels", async () => {
    const requestId = await seedApprovedRequest()

    const response = await publishCampaign(
      publishRequest(requestId, { cookie: await adminSessionCookie() }),
      queueParams(requestId)
    )

    expect(response.status).toBe(200)
    expect(await requestStatus(requestId)).toBe("published")
    const jobs = await publishJobs(requestId)
    expect(jobs.map((job) => `${job.channel}:${job.status}`)).toEqual([
      "gbp:published",
      "instagram:published",
    ])
    expect(jobs.every((job) => job.externalRef !== null)).toBe(true)
  })

  it("fails the GBP job when no org credential is configured", async () => {
    const requestId = await seedApprovedRequest()
    await deleteOrgCredential()

    await publishCampaign(
      publishRequest(requestId, { cookie: await adminSessionCookie() }),
      queueParams(requestId)
    )

    // The credential is a *job* failure, not an eligibility gate: the store is
    // publishable, the organization simply isn't connected yet, and Instagram
    // still goes out on its own per-store credential.
    const jobs = await publishJobs(requestId)
    expect(jobs.map((job) => `${job.channel}:${job.status}`)).toEqual([
      "gbp:failed",
      "instagram:published",
    ])
    expect(await requestStatus(requestId)).toBe("partially_published")
    expect(jobs[0]?.lastError).toContain(
      "No organization publishing credential"
    )
  })

  it("fails the GBP job when the org credential has expired", async () => {
    const requestId = await seedApprovedRequest()
    await setOrgCredentialExpiry("2020-01-01T00:00:00.000Z")

    await publishCampaign(
      publishRequest(requestId, { cookie: await adminSessionCookie() }),
      queueParams(requestId)
    )

    const jobs = await publishJobs(requestId)
    expect(jobs[0]).toMatchObject({ channel: "gbp", status: "failed" })
    expect(jobs[0]?.lastError).toContain("expired")
  })

  it("publishes Instagram with the store's own token when the link carries one", async () => {
    const requestId = await seedApprovedRequest()
    await setStoreInstagramToken("encrypted:store-instagram-token")

    await publishCampaign(
      publishRequest(requestId, { cookie: await adminSessionCookie() }),
      queueParams(requestId)
    )

    // The per-store account reaches the adapter — not the global env token that
    // v1 published every store with.
    expect(instagramCalls.at(-1)?.account).toEqual({
      accessToken: "store-instagram-token",
      accountRef: "17841400000000000",
    })
  })

  it("falls back to the environment account when the link has no token yet", async () => {
    const requestId = await seedApprovedRequest()

    await publishCampaign(
      publishRequest(requestId, { cookie: await adminSessionCookie() }),
      queueParams(requestId)
    )

    expect(instagramCalls.at(-1)?.account).toBeUndefined()
  })

  it("fails the Instagram job when the stored token cannot be decrypted", async () => {
    const requestId = await seedApprovedRequest()
    await setStoreInstagramToken("v1:not:real:ciphertext")

    await publishCampaign(
      publishRequest(requestId, { cookie: await adminSessionCookie() }),
      queueParams(requestId)
    )

    const jobs = await publishJobs(requestId)
    expect(jobs[1]).toMatchObject({ channel: "instagram", status: "failed" })
    expect(jobs[1]?.lastError).toContain("could not be read")
  })

  it("rejects a channel the store's gates do not allow, before any job exists", async () => {
    const requestId = await seedApprovedRequest()
    await setInstagramLinkStatus("revoked")

    const response = await publishCampaign(
      publishRequest(requestId, { cookie: await adminSessionCookie() }),
      queueParams(requestId)
    )
    const payload = (await response.json()) as { readonly status: string }

    expect(response.status).toBe(422)
    expect(payload.status).toBe("CHANNEL_NOT_ELIGIBLE")
    // The whole run is refused rather than half-run: the campaign never leaves
    // approved and no channel is posted to.
    expect(await requestStatus(requestId)).toBe("approved")
    expect(await publishJobs(requestId)).toHaveLength(0)
  })

  it("leaves a campaign partially published when one channel fails", async () => {
    const requestId = await seedApprovedRequest()
    instagramFails.value = true

    await publishCampaign(
      publishRequest(requestId, { cookie: await adminSessionCookie() }),
      queueParams(requestId)
    )

    expect(await requestStatus(requestId)).toBe("partially_published")
    const jobs = await publishJobs(requestId)
    expect(jobs.map((job) => `${job.channel}:${job.status}`)).toEqual([
      "gbp:published",
      "instagram:failed",
    ])
  })

  it("replays the published channel instead of posting to it twice on retry", async () => {
    const requestId = await seedApprovedRequest()
    const cookie = await adminSessionCookie()
    instagramFails.value = true
    await publishCampaign(
      publishRequest(requestId, { cookie }),
      queueParams(requestId)
    )
    const [gbpAfterFirst] = await publishJobs(requestId)

    instagramFails.value = false
    const retry = await publishCampaign(
      publishRequest(requestId, { cookie }),
      queueParams(requestId)
    )
    const payload = (await retry.json()) as {
      readonly outcomes: readonly { channel: string; kind: string }[]
    }

    expect(payload.outcomes).toEqual([
      {
        channel: "gbp",
        kind: "already_published",
        message: expect.any(String),
      },
      { channel: "instagram", kind: "published", message: null },
    ])
    const jobs = await publishJobs(requestId)
    // The already-live channel keeps its original attempt count and post id —
    // a retry must never mint a second GBP post.
    expect(jobs[0]).toMatchObject({
      channel: "gbp",
      attemptCount: gbpAfterFirst?.attemptCount,
      externalRef: gbpAfterFirst?.externalRef,
    })
    expect(await requestStatus(requestId)).toBe("published")
  })

  it("locks a channel after three failures and tells the owner in chat", async () => {
    const requestId = await seedApprovedRequest()
    const cookie = await adminSessionCookie()
    instagramFails.value = true

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await publishCampaign(
        publishRequest(requestId, { cookie, channels: ["instagram"] }),
        queueParams(requestId)
      )
    }

    const jobs = await publishJobs(requestId)
    expect(jobs[0]).toMatchObject({
      channel: "instagram",
      status: "failed",
      attemptCount: 3,
    })

    const fourth = await publishCampaign(
      publishRequest(requestId, { cookie, channels: ["instagram"] }),
      queueParams(requestId)
    )
    const payload = (await fourth.json()) as {
      readonly outcomes: readonly { channel: string; kind: string }[]
    }

    expect(payload.outcomes).toEqual([
      {
        channel: "instagram",
        kind: "retry_limit",
        message: expect.any(String),
      },
    ])
    // Still 3: a refused reservation must not burn a fourth attempt.
    expect((await publishJobs(requestId))[0]?.attemptCount).toBe(3)

    const messages = await ownerVisibleMessages()
    expect(messages.some((body) => body.includes("인스타그램"))).toBe(true)
  })

  it("refuses a request with no final copy", async () => {
    const requestId = await seedApprovedRequest()
    await withDatabase(async (queryable) => {
      await queryable.execute(
        "UPDATE campaign_requests SET final_copy = NULL WHERE id = ?",
        [requestId]
      )
    })

    const response = await publishCampaign(
      publishRequest(requestId, { cookie: await adminSessionCookie() }),
      queueParams(requestId)
    )
    const payload = (await response.json()) as { readonly status: string }

    expect(response.status).toBe(422)
    expect(payload.status).toBe("INCOMPLETE_MATERIAL")
    expect(await publishJobs(requestId)).toHaveLength(0)
  })

  it("rejects a payload that names the same channel twice", async () => {
    const requestId = await seedApprovedRequest()

    const response = await publishCampaign(
      publishRequest(requestId, {
        cookie: await adminSessionCookie(),
        channels: ["gbp", "gbp"],
      }),
      queueParams(requestId)
    )

    expect(response.status).toBe(400)
    expect(await publishJobs(requestId)).toHaveLength(0)
  })
})
