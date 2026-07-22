import { randomUUID } from "node:crypto"

import Database from "better-sqlite3"
import { beforeEach, describe, expect, it } from "vitest"

import { createSqliteQueryable } from "../sqlite-client.ts"
import { applyMigrations } from "../sqlite.ts"
import type { Queryable } from "../types.ts"
import {
  CampaignRequestNotFoundError,
  type CampaignStore,
  createDatabaseCampaignStore,
} from "./campaign-store.ts"

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

function makeQueryable(): Queryable {
  const database = new Database(":memory:")
  database.pragma("foreign_keys = ON")
  applyMigrations(database)
  seed(database)
  return createSqliteQueryable(database)
}

let queryable: Queryable
let campaigns: CampaignStore

beforeEach(() => {
  queryable = makeQueryable()
  campaigns = createDatabaseCampaignStore(queryable)
})

function at(seconds: number): Date {
  return new Date(Date.UTC(2026, 6, 21, 0, 0, seconds))
}

describe("campaign store", () => {
  it("creates a campaign request in submitted status", async () => {
    const request = await campaigns.createCampaignRequest({
      id: randomUUID(),
      storeId,
      brief: "Promote our new brunch menu",
      now: at(0),
    })

    expect(request.status).toBe("submitted")
    expect(request.storeId).toBe(storeId)
    expect(request.brief).toBe("Promote our new brunch menu")
  })

  it("registers an asset against an owned request and bumps updated_at", async () => {
    const request = await campaigns.createCampaignRequest({
      id: randomUUID(),
      storeId,
      brief: "Promote our new brunch menu",
      now: at(0),
    })

    const asset = await campaigns.registerCampaignAsset({
      id: randomUUID(),
      requestId: request.id,
      storeId,
      kind: "original",
      blobUrl: "https://blob.example/stores/store-1/asset-1.jpg",
      contentType: "image/jpeg",
      sizeBytes: 512_000,
      uploadedBy: "owner",
      now: at(5),
    })

    expect(asset.requestId).toBe(request.id)
    expect(asset.sizeBytes).toBe(512_000)

    const withAssets = await campaigns.getCampaignRequestById(
      request.id,
      storeId
    )
    expect(withAssets?.updatedAt).toBe(at(5).toISOString())
    expect(withAssets?.assets).toHaveLength(1)
    expect(withAssets?.assets[0]?.contentType).toBe("image/jpeg")
  })

  it("rejects registering an asset against a request from another store", async () => {
    const request = await campaigns.createCampaignRequest({
      id: randomUUID(),
      storeId: otherStoreId,
      brief: "Other store's campaign",
      now: at(0),
    })

    await expect(
      campaigns.registerCampaignAsset({
        id: randomUUID(),
        requestId: request.id,
        storeId,
        kind: "original",
        blobUrl: "https://blob.example/stores/store-2/asset-1.jpg",
        contentType: "image/jpeg",
        sizeBytes: 1000,
        uploadedBy: "owner",
        now: at(1),
      })
    ).rejects.toThrow(CampaignRequestNotFoundError)
  })

  it("cascades asset deletion when the owning request is deleted", async () => {
    const request = await campaigns.createCampaignRequest({
      id: randomUUID(),
      storeId,
      brief: "Promote our new brunch menu",
      now: at(0),
    })
    await campaigns.registerCampaignAsset({
      id: randomUUID(),
      requestId: request.id,
      storeId,
      kind: "original",
      blobUrl: "https://blob.example/stores/store-1/asset-1.jpg",
      contentType: "image/jpeg",
      sizeBytes: 1000,
      uploadedBy: "owner",
      now: at(1),
    })

    await queryable.execute(`DELETE FROM campaign_requests WHERE id = ?`, [
      request.id,
    ])

    const remaining = await queryable.query(
      `SELECT * FROM campaign_assets WHERE request_id = ?`,
      [request.id]
    )
    expect(remaining).toHaveLength(0)
  })

  it("lists a store's requests newest-first with an asset count", async () => {
    const first = await campaigns.createCampaignRequest({
      id: randomUUID(),
      storeId,
      brief: "First request",
      now: at(0),
    })
    const second = await campaigns.createCampaignRequest({
      id: randomUUID(),
      storeId,
      brief: "Second request",
      now: at(1),
    })
    await campaigns.registerCampaignAsset({
      id: randomUUID(),
      requestId: first.id,
      storeId,
      kind: "original",
      blobUrl: "https://blob.example/stores/store-1/asset-1.jpg",
      contentType: "image/jpeg",
      sizeBytes: 1000,
      uploadedBy: "owner",
      now: at(2),
    })

    const list = await campaigns.listCampaignRequestsForStore(storeId)

    expect(list.map((r) => r.id)).toEqual([first.id, second.id])
    expect(list.find((r) => r.id === first.id)?.assetCount).toBe(1)
    expect(list.find((r) => r.id === second.id)?.assetCount).toBe(0)
  })

  it("scopes list and get reads to the requesting store", async () => {
    await campaigns.createCampaignRequest({
      id: randomUUID(),
      storeId: otherStoreId,
      brief: "Not visible to store-1",
      now: at(0),
    })

    const list = await campaigns.listCampaignRequestsForStore(storeId)
    expect(list).toHaveLength(0)
  })

  it("returns undefined for a request id that doesn't belong to the store", async () => {
    const request = await campaigns.createCampaignRequest({
      id: randomUUID(),
      storeId: otherStoreId,
      brief: "Not visible to store-1",
      now: at(0),
    })

    const result = await campaigns.getCampaignRequestById(request.id, storeId)
    expect(result).toBeUndefined()
  })
})

describe("campaign queue and review writes", () => {
  async function submittedRequest(brief = "Promote our new brunch menu") {
    return campaigns.createCampaignRequest({
      id: randomUUID(),
      storeId,
      brief,
      now: at(0),
    })
  }

  async function countReviewEvents(requestId: string): Promise<number> {
    const rows = await queryable.query(
      "SELECT id FROM campaign_review_events WHERE request_id = ?",
      [requestId]
    )
    return rows.length
  }

  it("stores and reads back the operator's final copy", async () => {
    const request = await submittedRequest()

    const updated = await campaigns.setCampaignFinalCopy({
      requestId: request.id,
      finalCopy: "Brunch is back — every Saturday from 10am.",
      now: at(5),
    })

    expect(updated?.finalCopy).toBe(
      "Brunch is back — every Saturday from 10am."
    )
    const detail = await campaigns.getCampaignRequestForOperator(request.id)
    expect(detail?.finalCopy).toBe("Brunch is back — every Saturday from 10am.")
  })

  it("applies a status update when the expected status still holds", async () => {
    const request = await submittedRequest()

    const updated = await campaigns.updateCampaignRequestStatus({
      requestId: request.id,
      expectedStatus: "submitted",
      nextStatus: "in_production",
      now: at(5),
    })

    expect(updated?.status).toBe("in_production")
  })

  // The stale-view guard: whoever read an older status loses, and learns it.
  it("refuses a status update whose expected status no longer holds", async () => {
    const request = await submittedRequest()
    await campaigns.updateCampaignRequestStatus({
      requestId: request.id,
      expectedStatus: "submitted",
      nextStatus: "in_production",
      now: at(5),
    })

    const late = await campaigns.updateCampaignRequestStatus({
      requestId: request.id,
      expectedStatus: "submitted",
      nextStatus: "in_production",
      now: at(6),
    })

    expect(late).toBeUndefined()
    const detail = await campaigns.getCampaignRequestForOperator(request.id)
    expect(detail?.status).toBe("in_production")
  })

  it("records a review decision with its note and flips the status", async () => {
    const request = await submittedRequest()
    await campaigns.updateCampaignRequestStatus({
      requestId: request.id,
      expectedStatus: "submitted",
      nextStatus: "ready_for_review",
      now: at(5),
    })

    const updated = await campaigns.recordCampaignReviewDecision({
      id: randomUUID(),
      requestId: request.id,
      expectedStatus: "ready_for_review",
      nextStatus: "changes_requested",
      actor: "owner",
      decision: "changes_requested",
      note: "Please brighten the second photo.",
      now: at(6),
    })

    expect(updated?.status).toBe("changes_requested")
    const detail = await campaigns.getCampaignRequestForOperator(request.id)
    expect(detail?.reviewEvents).toHaveLength(1)
    expect(detail?.reviewEvents[0]?.decision).toBe("changes_requested")
    expect(detail?.reviewEvents[0]?.note).toBe(
      "Please brighten the second photo."
    )
  })

  // Delivery-plan acceptance: rapid duplicate go/no-go actions create exactly
  // one campaign_review_events row.
  it("writes exactly one review event for a double-submitted decision", async () => {
    const request = await submittedRequest()
    await campaigns.updateCampaignRequestStatus({
      requestId: request.id,
      expectedStatus: "submitted",
      nextStatus: "ready_for_review",
      now: at(5),
    })

    const decision = {
      requestId: request.id,
      expectedStatus: "ready_for_review",
      nextStatus: "approved",
      actor: "owner",
      decision: "go",
      now: at(6),
    } as const

    const first = await campaigns.recordCampaignReviewDecision({
      ...decision,
      id: randomUUID(),
    })
    const second = await campaigns.recordCampaignReviewDecision({
      ...decision,
      id: randomUUID(),
    })

    expect(first?.status).toBe("approved")
    expect(second).toBeUndefined()
    expect(await countReviewEvents(request.id)).toBe(1)
  })

  it("lists the queue across stores with names and split asset counts", async () => {
    const mine = await submittedRequest("Store 1 campaign")
    await campaigns.createCampaignRequest({
      id: randomUUID(),
      storeId: otherStoreId,
      brief: "Store 2 campaign",
      now: at(1),
    })
    await campaigns.registerCampaignAsset({
      id: randomUUID(),
      requestId: mine.id,
      storeId,
      kind: "original",
      blobUrl: "https://blob.example/original.jpg",
      contentType: "image/jpeg",
      sizeBytes: 1024,
      uploadedBy: "owner",
      now: at(2),
    })
    await campaigns.registerCampaignAsset({
      id: randomUUID(),
      requestId: mine.id,
      storeId,
      kind: "processed",
      blobUrl: "https://blob.example/processed.jpg",
      contentType: "image/jpeg",
      sizeBytes: 2048,
      uploadedBy: "admin",
      now: at(3),
    })

    const queue = await campaigns.listCampaignQueue()

    expect(queue).toHaveLength(2)
    const entry = queue.find((row) => row.id === mine.id)
    expect(entry?.storeName).toBe(storeId)
    expect(entry?.originalCount).toBe(1)
    expect(entry?.processedCount).toBe(1)
  })

  it("keeps the owner's detail read scoped to their own store", async () => {
    const foreign = await campaigns.createCampaignRequest({
      id: randomUUID(),
      storeId: otherStoreId,
      brief: "Not visible to store-1",
      now: at(0),
    })

    expect(
      await campaigns.getCampaignRequestDetail(foreign.id, storeId)
    ).toBeUndefined()
    // The operator view spans every store, so the same row does resolve there.
    expect(
      await campaigns.getCampaignRequestForOperator(foreign.id)
    ).toBeDefined()
  })
})
