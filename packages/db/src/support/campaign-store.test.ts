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
