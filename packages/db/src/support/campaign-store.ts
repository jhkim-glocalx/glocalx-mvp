import type {
  CampaignAsset,
  CampaignRequest,
  CampaignRequestWithAssets,
  CampaignReviewEvent,
} from "@glocalx/domain/campaign-contracts"
import type {
  CampaignAssetKind,
  CampaignAssetUploadedBy,
  CampaignReviewActor,
  CampaignReviewDecision,
  CampaignStatus,
} from "@glocalx/domain/campaign-state-machine"
import { z } from "zod"

import type { Queryable } from "../types.ts"
import {
  jsonColumnSchema,
  nullableTimestampSchema,
  timestampSchema,
} from "./row-codecs.ts"

export type CreateCampaignRequestInput = {
  readonly id: string
  readonly storeId: string
  readonly brief: string
  readonly now: Date
}

export type RegisterCampaignAssetInput = {
  readonly id: string
  readonly requestId: string
  readonly storeId: string
  readonly kind: CampaignAssetKind
  readonly blobUrl: string
  readonly contentType: string
  readonly sizeBytes: number
  readonly width?: number
  readonly height?: number
  readonly uploadedBy: CampaignAssetUploadedBy
  readonly now: Date
}

// The status/updated_at index (architecture §2) backs this ordering — newest
// activity first, matching the owner's status-timeline read pattern.
export type CampaignRequestSummary = CampaignRequest & {
  readonly assetCount: number
}

// The operator queue spans every store, so unlike the owner reads it carries
// the store name and splits the asset counts the kanban card shows.
export type CampaignQueueEntry = CampaignRequest & {
  readonly storeName: string
  readonly originalCount: number
  readonly processedCount: number
}

export type CampaignRequestDetail = CampaignRequestWithAssets & {
  readonly storeName: string
  readonly reviewEvents: readonly CampaignReviewEvent[]
}

// `expectedStatus` is the status the caller read before computing nextStatus
// through the domain transition function. It becomes the WHERE clause, so the
// status column itself is the concurrency token: a caller that lost the race
// updates zero rows and gets `undefined` back rather than clobbering whatever
// the winner wrote. Mirrors CsMessageStore.sendDraft's guarded no-op.
export type UpdateCampaignStatusInput = {
  readonly requestId: string
  readonly expectedStatus: CampaignStatus
  readonly nextStatus: CampaignStatus
  readonly now: Date
}

export type RecordCampaignReviewDecisionInput = UpdateCampaignStatusInput & {
  readonly id: string
  readonly actor: CampaignReviewActor
  readonly decision: CampaignReviewDecision
  readonly note?: string
}

export type SetCampaignFinalCopyInput = {
  readonly requestId: string
  readonly finalCopy: string
  readonly now: Date
}

export type MarkCampaignNudgedInput = {
  readonly requestId: string
  readonly now: Date
}

export interface CampaignStore {
  createCampaignRequest(
    input: CreateCampaignRequestInput
  ): Promise<CampaignRequest>
  // Throws if requestId doesn't resolve to a row scoped to storeId — an asset
  // can never attach to a request the caller doesn't own.
  registerCampaignAsset(
    input: RegisterCampaignAssetInput
  ): Promise<CampaignAsset>
  listCampaignRequestsForStore(
    storeId: string
  ): Promise<readonly CampaignRequestSummary[]>
  getCampaignRequestById(
    requestId: string,
    storeId: string
  ): Promise<CampaignRequestWithAssets | undefined>
  // Owner-facing detail for the go/no-go screen: assets plus the decision
  // trail, still scoped to the owning store.
  getCampaignRequestDetail(
    requestId: string,
    storeId: string
  ): Promise<CampaignRequestDetail | undefined>
  // Operator reads span every store, so these take no storeId.
  listCampaignQueue(): Promise<readonly CampaignQueueEntry[]>
  getCampaignRequestForOperator(
    requestId: string
  ): Promise<CampaignRequestDetail | undefined>
  // Returns undefined when the guard missed — the row is gone or its status
  // moved on. Callers surface that as a stale-view conflict, never a retry.
  updateCampaignRequestStatus(
    input: UpdateCampaignStatusInput
  ): Promise<CampaignRequest | undefined>
  recordCampaignReviewDecision(
    input: RecordCampaignReviewDecisionInput
  ): Promise<CampaignRequest | undefined>
  setCampaignFinalCopy(
    input: SetCampaignFinalCopyInput
  ): Promise<CampaignRequest | undefined>
  // Records that an operator personally notified the owner that their material
  // is waiting. Guarded on the request still being unnudged and still in
  // ready_for_review, so a double-click writes one row and the second caller is
  // told it lost — the same status-as-token story every other write here uses.
  markCampaignNudged(
    input: MarkCampaignNudgedInput
  ): Promise<CampaignRequest | undefined>
}

export class CampaignRequestNotFoundError extends Error {
  constructor(requestId: string) {
    super(`No campaign request "${requestId}" found for this store`)
    this.name = "CampaignRequestNotFoundError"
  }
}

const campaignRequestRowSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  brief: z.string(),
  status: z.string(),
  finalCopy: z.string().nullable(),
  nudgedAt: nullableTimestampSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

const campaignReviewEventRowSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  actor: z.string(),
  decision: z.string(),
  note: z.string().nullable(),
  createdAt: timestampSchema,
})

const assetMetaSchema = z.object({
  sizeBytes: z.number().int().positive(),
})

const campaignAssetRowSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  kind: z.string(),
  blobUrl: z.string(),
  contentType: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  metaJson: jsonColumnSchema(assetMetaSchema),
  uploadedBy: z.string(),
  createdAt: timestampSchema,
})

const campaignRequestProjection = `
  id,
  store_id AS "storeId",
  brief,
  status,
  final_copy AS "finalCopy",
  nudged_at AS "nudgedAt",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`

// Table-qualified twin for the queue's join against stores.
const queueRequestProjection = `
  r.id,
  r.store_id AS "storeId",
  r.brief,
  r.status,
  r.final_copy AS "finalCopy",
  r.nudged_at AS "nudgedAt",
  r.created_at AS "createdAt",
  r.updated_at AS "updatedAt"
`

const campaignReviewEventProjection = `
  id,
  request_id AS "requestId",
  actor,
  decision,
  note,
  created_at AS "createdAt"
`

const campaignAssetProjection = `
  id,
  request_id AS "requestId",
  kind,
  blob_url AS "blobUrl",
  content_type AS "contentType",
  width,
  height,
  meta_json AS "metaJson",
  uploaded_by AS "uploadedBy",
  created_at AS "createdAt"
`

function toCampaignRequest(row: unknown): CampaignRequest {
  const parsed = campaignRequestRowSchema.parse(row)
  return {
    ...parsed,
    status: parsed.status as CampaignStatus,
  }
}

function toCampaignReviewEvent(row: unknown): CampaignReviewEvent {
  const parsed = campaignReviewEventRowSchema.parse(row)
  return {
    ...parsed,
    actor: parsed.actor as CampaignReviewActor,
    decision: parsed.decision as CampaignReviewDecision,
  }
}

function toCampaignAsset(row: unknown): CampaignAsset {
  const parsed = campaignAssetRowSchema.parse(row)
  return {
    id: parsed.id,
    requestId: parsed.requestId,
    kind: parsed.kind as CampaignAssetKind,
    blobUrl: parsed.blobUrl,
    contentType: parsed.contentType,
    sizeBytes: parsed.metaJson.sizeBytes,
    width: parsed.width ?? undefined,
    height: parsed.height ?? undefined,
    uploadedBy: parsed.uploadedBy as CampaignAssetUploadedBy,
    createdAt: parsed.createdAt,
  }
}

export function createDatabaseCampaignStore(
  queryable: Queryable
): CampaignStore {
  return {
    async createCampaignRequest(input) {
      const now = input.now.toISOString()
      await queryable.execute(
        `INSERT INTO campaign_requests (
           id, store_id, brief, status, created_at, updated_at
         ) VALUES (?, ?, ?, 'submitted', ?, ?)`,
        [input.id, input.storeId, input.brief, now, now]
      )
      return {
        id: input.id,
        storeId: input.storeId,
        brief: input.brief,
        status: "submitted",
        finalCopy: null,
        nudgedAt: null,
        createdAt: now,
        updatedAt: now,
      }
    },

    async registerCampaignAsset(input) {
      const owningRequest = await queryable.queryOne(
        `SELECT id FROM campaign_requests WHERE id = ? AND store_id = ?`,
        [input.requestId, input.storeId]
      )
      if (owningRequest === undefined) {
        throw new CampaignRequestNotFoundError(input.requestId)
      }

      const now = input.now.toISOString()
      const metaJson = JSON.stringify({ sizeBytes: input.sizeBytes })
      await queryable.execute(
        `INSERT INTO campaign_assets (
           id, request_id, kind, blob_url, content_type, width, height,
           meta_json, uploaded_by, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.id,
          input.requestId,
          input.kind,
          input.blobUrl,
          input.contentType,
          input.width ?? null,
          input.height ?? null,
          metaJson,
          input.uploadedBy,
          now,
        ]
      )
      await queryable.execute(
        `UPDATE campaign_requests SET updated_at = ? WHERE id = ?`,
        [now, input.requestId]
      )

      return {
        id: input.id,
        requestId: input.requestId,
        kind: input.kind,
        blobUrl: input.blobUrl,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        width: input.width,
        height: input.height,
        uploadedBy: input.uploadedBy,
        createdAt: now,
      }
    },

    async listCampaignRequestsForStore(storeId) {
      const rows = await queryable.query(
        `SELECT ${campaignRequestProjection},
                (SELECT COUNT(*) FROM campaign_assets WHERE request_id = campaign_requests.id) AS "assetCount"
           FROM campaign_requests
          WHERE store_id = ?
          ORDER BY updated_at DESC`,
        [storeId]
      )
      return rows.map((row) => ({
        ...toCampaignRequest(row),
        assetCount: z.coerce.number().parse(row["assetCount"]),
      }))
    },

    async getCampaignRequestById(requestId, storeId) {
      const requestRow = await queryable.queryOne(
        `SELECT ${campaignRequestProjection}
           FROM campaign_requests
          WHERE id = ? AND store_id = ?`,
        [requestId, storeId]
      )
      if (requestRow === undefined) {
        return undefined
      }

      const assetRows = await queryable.query(
        `SELECT ${campaignAssetProjection}
           FROM campaign_assets
          WHERE request_id = ?
          ORDER BY created_at ASC`,
        [requestId]
      )

      return {
        ...toCampaignRequest(requestRow),
        assets: assetRows.map(toCampaignAsset),
      }
    },

    async getCampaignRequestDetail(requestId, storeId) {
      return loadDetail(queryable, requestId, storeId)
    },

    async getCampaignRequestForOperator(requestId) {
      return loadDetail(queryable, requestId, undefined)
    },

    async listCampaignQueue() {
      const rows = await queryable.query(
        `SELECT ${queueRequestProjection},
                s.name AS "storeName",
                (SELECT COUNT(*) FROM campaign_assets a
                  WHERE a.request_id = r.id AND a.kind = 'original') AS "originalCount",
                (SELECT COUNT(*) FROM campaign_assets a
                  WHERE a.request_id = r.id AND a.kind = 'processed') AS "processedCount"
           FROM campaign_requests r
           JOIN stores s ON s.id = r.store_id
          ORDER BY r.updated_at DESC`
      )
      return rows.map((row) => ({
        ...toCampaignRequest(row),
        storeName: z.string().parse(row["storeName"]),
        originalCount: z.coerce.number().parse(row["originalCount"]),
        processedCount: z.coerce.number().parse(row["processedCount"]),
      }))
    },

    async updateCampaignRequestStatus(input) {
      return applyGuardedStatusUpdate(queryable, input)
    },

    async recordCampaignReviewDecision(input) {
      // The guarded status flip and the decision row have to land together: a
      // review event without its transition would let a second submit write a
      // duplicate, and a transition without its event would lose the owner's
      // note. Both live in one transaction, and the status guard inside it is
      // what makes a rapid double-submit a no-op rather than a second row.
      let updated: CampaignRequest | undefined
      await queryable.transaction(async (transaction) => {
        updated = await applyGuardedStatusUpdate(transaction, input)
        if (updated === undefined) {
          return
        }
        await transaction.execute(
          `INSERT INTO campaign_review_events (
             id, request_id, actor, decision, note, created_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            input.id,
            input.requestId,
            input.actor,
            input.decision,
            input.note ?? null,
            input.now.toISOString(),
          ]
        )
      })
      return updated
    },

    async setCampaignFinalCopy(input) {
      const now = input.now.toISOString()
      const result = await queryable.execute(
        `UPDATE campaign_requests
            SET final_copy = ?, updated_at = ?
          WHERE id = ?`,
        [input.finalCopy, now, input.requestId]
      )
      if (result.changes === 0) {
        return undefined
      }
      const row = await queryable.queryOne(
        `SELECT ${campaignRequestProjection} FROM campaign_requests WHERE id = ?`,
        [input.requestId]
      )
      return row === undefined ? undefined : toCampaignRequest(row)
    },

    async markCampaignNudged(input) {
      const now = input.now.toISOString()
      // Both halves of the guard earn their place: the status keeps a nudge
      // from being recorded against a request the owner is no longer waiting
      // on, and the NULL check makes the write exactly-once, so a double-click
      // produces one audit entry rather than two.
      const result = await queryable.execute(
        `UPDATE campaign_requests
            SET nudged_at = ?, updated_at = ?
          WHERE id = ? AND status = 'ready_for_review' AND nudged_at IS NULL`,
        [now, now, input.requestId]
      )
      if (result.changes === 0) {
        return undefined
      }
      const row = await queryable.queryOne(
        `SELECT ${campaignRequestProjection} FROM campaign_requests WHERE id = ?`,
        [input.requestId]
      )
      return row === undefined ? undefined : toCampaignRequest(row)
    },
  }
}

// Shared by the owner-scoped and operator-wide detail reads — the only
// difference is whether the store ownership predicate applies.
async function loadDetail(
  queryable: Queryable,
  requestId: string,
  storeId: string | undefined
): Promise<CampaignRequestDetail | undefined> {
  const requestRow = await queryable.queryOne(
    `SELECT ${queueRequestProjection}, s.name AS "storeName"
       FROM campaign_requests r
       JOIN stores s ON s.id = r.store_id
      WHERE r.id = ?${storeId === undefined ? "" : " AND r.store_id = ?"}`,
    storeId === undefined ? [requestId] : [requestId, storeId]
  )
  if (requestRow === undefined) {
    return undefined
  }

  const assetRows = await queryable.query(
    `SELECT ${campaignAssetProjection}
       FROM campaign_assets
      WHERE request_id = ?
      ORDER BY created_at ASC`,
    [requestId]
  )
  const reviewRows = await queryable.query(
    `SELECT ${campaignReviewEventProjection}
       FROM campaign_review_events
      WHERE request_id = ?
      ORDER BY created_at ASC`,
    [requestId]
  )

  return {
    ...toCampaignRequest(requestRow),
    storeName: z.string().parse(requestRow["storeName"]),
    assets: assetRows.map(toCampaignAsset),
    reviewEvents: reviewRows.map(toCampaignReviewEvent),
  }
}

// The whole concurrency story in one statement: the caller's expectedStatus is
// the status it read before asking the domain transition function for
// nextStatus, so if anyone else moved the row in between, this matches zero
// rows and the caller learns it lost rather than overwriting the winner.
async function applyGuardedStatusUpdate(
  queryable: Queryable,
  input: UpdateCampaignStatusInput
): Promise<CampaignRequest | undefined> {
  const now = input.now.toISOString()
  // nudged_at is cleared on every transition rather than only on the way into
  // ready_for_review: a nudge answers "does the owner know about the state
  // they're in now", so a status change always ends the episode it belonged to.
  // Keeping it here means no caller has to remember, and a request that loops
  // back through production is owed a fresh nudge the second time.
  const result = await queryable.execute(
    `UPDATE campaign_requests
        SET status = ?, nudged_at = NULL, updated_at = ?
      WHERE id = ? AND status = ?`,
    [input.nextStatus, now, input.requestId, input.expectedStatus]
  )
  if (result.changes === 0) {
    return undefined
  }

  const row = await queryable.queryOne(
    `SELECT ${campaignRequestProjection} FROM campaign_requests WHERE id = ?`,
    [input.requestId]
  )
  return row === undefined ? undefined : toCampaignRequest(row)
}
