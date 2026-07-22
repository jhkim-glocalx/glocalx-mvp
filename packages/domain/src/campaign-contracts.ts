import { z } from "zod"

import {
  campaignAssetKindSchema,
  campaignAssetUploadedBySchema,
  campaignReviewActorSchema,
  campaignReviewDecisionSchema,
  campaignStatusSchema,
} from "./campaign-state-machine"

const nonEmptyStringSchema = z.string().trim().min(1)

export const campaignFinalCopyMaxLength = 2000

export const campaignRequestSchema = z
  .object({
    id: nonEmptyStringSchema,
    storeId: nonEmptyStringSchema,
    brief: nonEmptyStringSchema,
    status: campaignStatusSchema,
    // The operator-authored caption that ships with the processed assets. Null
    // until an operator writes it during production (migration 0010).
    finalCopy: z.string().nullable(),
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

// The append-only decision trail. One row per accepted go/no-go/changes
// decision — the guarded status update is what keeps a double-submit from
// writing a second row (see CampaignStore.submitCampaignReviewDecision).
export const campaignReviewEventSchema = z
  .object({
    id: nonEmptyStringSchema,
    requestId: nonEmptyStringSchema,
    actor: campaignReviewActorSchema,
    decision: campaignReviewDecisionSchema,
    note: z.string().nullable(),
    createdAt: nonEmptyStringSchema,
  })
  .strict()
export type CampaignReviewEvent = z.infer<typeof campaignReviewEventSchema>

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

// Deliberately a separate schema from the owner's rather than a widened `kind`
// union: only an operator may attach a `processed` asset, and only an owner may
// attach an `original`, so neither route can be talked into the other's role.
export const registerProcessedAssetRequestSchema = z
  .object({
    blobUrl: nonEmptyStringSchema,
    kind: z.literal("processed"),
  })
  .strict()
export type RegisterProcessedAssetRequest = z.infer<
  typeof registerProcessedAssetRequestSchema
>

export const setCampaignFinalCopyRequestSchema = z
  .object({
    finalCopy: nonEmptyStringSchema.max(campaignFinalCopyMaxLength),
  })
  .strict()
export type SetCampaignFinalCopyRequest = z.infer<
  typeof setCampaignFinalCopyRequestSchema
>

// The owner's go/no-go. A "request changes" decision without a note would send
// the request back to production with nothing for the operator to act on, so
// the note is mandatory there and optional for the other two decisions.
export const submitCampaignReviewDecisionRequestSchema = z
  .object({
    decision: campaignReviewDecisionSchema,
    note: nonEmptyStringSchema.max(campaignFinalCopyMaxLength).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.decision === "changes_requested" && value.note === undefined) {
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "A note is required when requesting changes.",
      })
    }
  })
export type SubmitCampaignReviewDecisionRequest = z.infer<
  typeof submitCampaignReviewDecisionRequestSchema
>
