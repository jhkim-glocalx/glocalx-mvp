import { randomUUID } from "node:crypto"

import Database from "better-sqlite3"
import { beforeEach, describe, expect, it } from "vitest"

import { createSqliteQueryable } from "../sqlite-client.ts"
import { applyMigrations } from "../sqlite.ts"
import type { Queryable } from "../types.ts"
import {
  createDatabaseCampaignStore,
  type CampaignStore,
} from "./campaign-store.ts"
import {
  createDatabasePublishJobStore,
  publishJobIdempotencyKey,
  publishJobLastErrorMaxLength,
  type PublishJobStore,
} from "./publish-job-store.ts"

const storeId = "store-1"
const otherStoreId = "store-2"

function seed(database: Database.Database): void {
  database
    .prepare(
      "INSERT INTO users (id, email, display_name, role, created_at) VALUES (?, ?, ?, 'OWNER', ?)"
    )
    .run("user-1", "owner@example.com", "Owner", "2026-07-21T00:00:00.000Z")
  for (const id of [storeId, otherStoreId]) {
    database
      .prepare(
        "INSERT INTO stores (id, owner_user_id, name, address, category, onboarding_status, created_at) VALUES (?, 'user-1', ?, 'addr', 'cat', 'COMPLETED', ?)"
      )
      .run(id, id, "2026-07-21T00:00:00.000Z")
  }
}

let database: Database.Database
let queryable: Queryable
let campaigns: CampaignStore
let jobs: PublishJobStore

beforeEach(() => {
  database = new Database(":memory:")
  database.pragma("foreign_keys = ON")
  applyMigrations(database)
  seed(database)
  queryable = createSqliteQueryable(database)
  campaigns = createDatabaseCampaignStore(queryable)
  jobs = createDatabasePublishJobStore(queryable)
})

function at(seconds: number): Date {
  return new Date(Date.UTC(2026, 6, 21, 0, 0, seconds))
}

async function createRequest(owner: string = storeId): Promise<string> {
  const request = await campaigns.createCampaignRequest({
    id: randomUUID(),
    storeId: owner,
    brief: "Promote the new brunch menu",
    now: at(0),
  })
  return request.id
}

function readIdempotencyKey(requestId: string, channel: string): string {
  const row = database
    .prepare(
      "SELECT idempotency_key AS key FROM publish_jobs WHERE request_id = ? AND channel = ?"
    )
    .get(requestId, channel) as { readonly key: string }
  return row.key
}

async function failOnce(requestId: string, second: number): Promise<void> {
  await jobs.reservePublishJob({
    id: randomUUID(),
    requestId,
    channel: "gbp",
    now: at(second),
  })
  await jobs.failPublishJob({
    requestId,
    channel: "gbp",
    error: "The channel rejected the publish request.",
    now: at(second),
  })
}

describe("publish job store", () => {
  it("creates a publishing job on the channel's first reservation", async () => {
    const requestId = await createRequest()

    const reservation = await jobs.reservePublishJob({
      id: randomUUID(),
      requestId,
      channel: "gbp",
      now: at(1),
    })

    expect(reservation.kind).toBe("reserved")
    expect(reservation.job).toMatchObject({
      channel: "gbp",
      status: "publishing",
      attemptCount: 1,
      externalRef: null,
      lastError: null,
    })
  })

  it("settles a reserved job as published with the channel's post id", async () => {
    const requestId = await createRequest()
    await jobs.reservePublishJob({
      id: randomUUID(),
      requestId,
      channel: "instagram",
      now: at(1),
    })

    const completed = await jobs.completePublishJob({
      requestId,
      channel: "instagram",
      externalRef: "ig-post-1",
      now: at(2),
    })

    expect(completed).toMatchObject({
      status: "published",
      externalRef: "ig-post-1",
      lastError: null,
    })
  })

  it("reports a replay rather than reserving a channel that already published", async () => {
    const requestId = await createRequest()
    await jobs.reservePublishJob({
      id: randomUUID(),
      requestId,
      channel: "gbp",
      now: at(1),
    })
    await jobs.completePublishJob({
      requestId,
      channel: "gbp",
      externalRef: "gbp-post-1",
      now: at(2),
    })

    const replay = await jobs.reservePublishJob({
      id: randomUUID(),
      requestId,
      channel: "gbp",
      now: at(3),
    })

    // The attempt count must not move: a replay is not another try at the
    // channel, it is the caller learning the post is already live.
    expect(replay).toMatchObject({
      kind: "replay",
      job: { status: "published", attemptCount: 1 },
    })
  })

  it("refuses a second reservation while a run holds the channel", async () => {
    const requestId = await createRequest()
    await jobs.reservePublishJob({
      id: randomUUID(),
      requestId,
      channel: "gbp",
      now: at(1),
    })

    const second = await jobs.reservePublishJob({
      id: randomUUID(),
      requestId,
      channel: "gbp",
      now: at(2),
    })

    expect(second.kind).toBe("in_progress")
    expect(second.job.attemptCount).toBe(1)
  })

  it("locks the job terminal after the third failed attempt", async () => {
    const requestId = await createRequest()

    await failOnce(requestId, 1)
    await failOnce(requestId, 2)
    await failOnce(requestId, 3)

    const fourth = await jobs.reservePublishJob({
      id: randomUUID(),
      requestId,
      channel: "gbp",
      now: at(4),
    })

    expect(fourth).toMatchObject({
      kind: "retry_limit",
      job: { status: "failed", attemptCount: 3 },
    })
  })

  it("holds the idempotency key constant across every attempt", async () => {
    const requestId = await createRequest()
    const expected = publishJobIdempotencyKey(requestId, "gbp")

    await failOnce(requestId, 1)
    const afterFirst = readIdempotencyKey(requestId, "gbp")
    await failOnce(requestId, 2)
    const afterSecond = readIdempotencyKey(requestId, "gbp")

    expect(afterFirst).toBe(expected)
    expect(afterSecond).toBe(expected)
  })

  it("truncates a long failure message rather than storing it whole", async () => {
    const requestId = await createRequest()
    await jobs.reservePublishJob({
      id: randomUUID(),
      requestId,
      channel: "gbp",
      now: at(1),
    })

    const failed = await jobs.failPublishJob({
      requestId,
      channel: "gbp",
      error: "x".repeat(publishJobLastErrorMaxLength + 50),
      now: at(2),
    })

    expect(failed?.lastError).toHaveLength(publishJobLastErrorMaxLength)
  })

  it("ignores a settle call for a job that is no longer publishing", async () => {
    const requestId = await createRequest()
    await jobs.reservePublishJob({
      id: randomUUID(),
      requestId,
      channel: "gbp",
      now: at(1),
    })
    await jobs.completePublishJob({
      requestId,
      channel: "gbp",
      externalRef: "gbp-post-1",
      now: at(2),
    })

    // A late response from an abandoned run must not overwrite the live post.
    const late = await jobs.failPublishJob({
      requestId,
      channel: "gbp",
      error: "too late",
      now: at(3),
    })

    expect(late).toBeUndefined()
    const [job] = await jobs.listPublishJobs(requestId)
    expect(job).toMatchObject({
      status: "published",
      externalRef: "gbp-post-1",
    })
  })

  it("scopes the store-wide read to the owning store", async () => {
    const ownRequestId = await createRequest()
    const otherRequestId = await createRequest(otherStoreId)
    await jobs.reservePublishJob({
      id: randomUUID(),
      requestId: ownRequestId,
      channel: "gbp",
      now: at(1),
    })
    await jobs.reservePublishJob({
      id: randomUUID(),
      requestId: otherRequestId,
      channel: "gbp",
      now: at(2),
    })

    const mine = await jobs.listPublishJobsForStore(storeId)

    expect(mine).toHaveLength(1)
    expect(mine[0]?.requestId).toBe(ownRequestId)
  })
})
