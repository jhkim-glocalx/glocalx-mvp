import { z } from "zod"

import {
  campaignAssetKindSchema,
  campaignAssetUploadedBySchema,
  campaignStatusSchema,
} from "./campaign-state-machine"

const nonEmptyStringSchema = z.string().trim().min(1)

export const campaignRequestSchema = z
  .object({
    id: nonEmptyStringSchema,
    storeId: nonEmptyStringSchema,
    brief: nonEmptyStringSchema,
    status: campaignStatusSchema,
    createdAt: nonEmptyStringSchema,
    updatedAt: nonEmptyStringSchema,
  })
  .strict()
export type CampaignRequest = z.infer<typeof campaignRequestSchema>

export const campaignAssetSchema = z
  .object({
    id: nonEmptyStringSchema,
    requestId: nonEmptyStringSchema,
    kind: campaignAssetKindSchema,
    blobUrl: nonEmptyStringSchema,
    contentType: nonEmptyStringSchema,
    // Stored in campaign_assets.meta_json (the row has no dedicated column) —
    // still re-derived from MediaStore.getAssetMetadata, never the client.
    sizeBytes: z.number().int().positive(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    uploadedBy: campaignAssetUploadedBySchema,
    createdAt: nonEmptyStringSchema,
  })
  .strict()
export type CampaignAsset = z.infer<typeof campaignAssetSchema>

export const campaignRequestWithAssetsSchema = campaignRequestSchema.extend({
  assets: z.array(campaignAssetSchema),
})
export type CampaignRequestWithAssets = z.infer<
  typeof campaignRequestWithAssetsSchema
>

// Route schemas are the single trust boundary for raw JSON payloads.
export const createCampaignRequestSchema = z
  .object({
    brief: nonEmptyStringSchema.max(2000),
  })
  .strict()
export type CreateCampaignRequest = z.infer<typeof createCampaignRequestSchema>

export const createUploadTokenRequestSchema = z
  .object({
    filename: nonEmptyStringSchema,
    contentType: nonEmptyStringSchema,
    sizeBytes: z.number().int().positive(),
  })
  .strict()
export type CreateUploadTokenRequest = z.infer<
  typeof createUploadTokenRequestSchema
>

// blobUrl is the only client-supplied field the server trusts as a lookup
// key — content type and size are always re-derived from the store itself
// (see MediaStore.getAssetMetadata), never taken from this request body, so
// a bypassed or lying client can't register a mislabeled asset.
export const registerCampaignAssetRequestSchema = z
  .object({
    blobUrl: nonEmptyStringSchema,
    kind: z.literal("original"),
  })
  .strict()
export type RegisterCampaignAssetRequest = z.infer<
  typeof registerCampaignAssetRequestSchema
>
