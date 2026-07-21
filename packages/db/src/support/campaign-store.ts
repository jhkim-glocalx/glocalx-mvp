import type {
  CampaignAsset,
  CampaignRequest,
  CampaignRequestWithAssets,
} from "@glocalx/domain/campaign-contracts"
import type {
  CampaignAssetKind,
  CampaignAssetUploadedBy,
  CampaignStatus,
} from "@glocalx/domain/campaign-state-machine"
import { z } from "zod"

import type { Queryable } from "../types.ts"
import { jsonColumnSchema, timestampSchema } from "./row-codecs.ts"

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
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
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
  created_at AS "createdAt",
  updated_at AS "updatedAt"
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
  }
}
