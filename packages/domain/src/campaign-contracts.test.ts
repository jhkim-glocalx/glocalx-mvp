import { describe, expect, it } from "vitest"

import {
  campaignAssetSchema,
  campaignRequestSchema,
  createCampaignRequestSchema,
  createUploadTokenRequestSchema,
  registerCampaignAssetRequestSchema,
  registerProcessedAssetRequestSchema,
  setCampaignFinalCopyRequestSchema,
  submitCampaignReviewDecisionRequestSchema,
} from "./campaign-contracts"

describe("campaign-contracts", () => {
  it("parses a valid campaign request row", () => {
    const result = campaignRequestSchema.safeParse({
      id: "req_1",
      storeId: "store_1",
      brief: "Promote our new brunch menu",
      status: "submitted",
      finalCopy: null,
      nudgedAt: null,
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: "2026-07-21T00:00:00.000Z",
    })

    expect(result.success).toBe(true)
  })

  it("parses a campaign request the operator has already nudged", () => {
    const result = campaignRequestSchema.safeParse({
      id: "req_1",
      storeId: "store_1",
      brief: "Promote our new brunch menu",
      status: "ready_for_review",
      finalCopy: "Brunch is back.",
      nudgedAt: "2026-07-25T01:00:00.000Z",
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: "2026-07-25T01:00:00.000Z",
    })

    expect(result.success).toBe(true)
  })

  it("rejects a campaign request with an unrecognized status", () => {
    const result = campaignRequestSchema.safeParse({
      id: "req_1",
      storeId: "store_1",
      brief: "Promote our new brunch menu",
      status: "not_a_real_status",
      finalCopy: null,
      nudgedAt: null,
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: "2026-07-21T00:00:00.000Z",
    })

    expect(result.success).toBe(false)
  })

  it("parses a valid campaign asset row", () => {
    const result = campaignAssetSchema.safeParse({
      id: "asset_1",
      requestId: "req_1",
      kind: "original",
      blobUrl: "https://blob.example/stores/store_1/asset_1-photo.jpg",
      contentType: "image/jpeg",
      sizeBytes: 512_000,
      uploadedBy: "owner",
      createdAt: "2026-07-21T00:00:00.000Z",
    })

    expect(result.success).toBe(true)
  })

  it("rejects an empty brief on request creation", () => {
    const result = createCampaignRequestSchema.safeParse({ brief: "" })
    expect(result.success).toBe(false)
  })

  it("rejects extra fields on request creation (.strict())", () => {
    const result = createCampaignRequestSchema.safeParse({
      brief: "valid brief",
      storeId: "store_1",
    })
    expect(result.success).toBe(false)
  })

  it("requires a positive sizeBytes for upload token requests", () => {
    const result = createUploadTokenRequestSchema.safeParse({
      filename: "photo.jpg",
      contentType: "image/jpeg",
      sizeBytes: 0,
    })
    expect(result.success).toBe(false)
  })

  it("only accepts kind 'original' for owner-submitted asset registration", () => {
    const result = registerCampaignAssetRequestSchema.safeParse({
      blobUrl: "https://blob.example/stores/store_1/asset_1-photo.jpg",
      kind: "processed",
    })
    expect(result.success).toBe(false)
  })

  it("ignores any client-claimed contentType or sizeBytes on asset registration", () => {
    const result = registerCampaignAssetRequestSchema.safeParse({
      blobUrl: "https://blob.example/stores/store_1/asset_1-photo.jpg",
      kind: "original",
      contentType: "image/jpeg",
      sizeBytes: 999,
    })
    // .strict() rejects unknown keys outright rather than silently trusting them.
    expect(result.success).toBe(false)
  })

  it("only accepts kind 'processed' for operator asset registration", () => {
    const asOriginal = registerProcessedAssetRequestSchema.safeParse({
      blobUrl: "https://blob.example/stores/store_1/asset_1-photo.jpg",
      kind: "original",
    })
    const asProcessed = registerProcessedAssetRequestSchema.safeParse({
      blobUrl: "https://blob.example/stores/store_1/asset_1-photo.jpg",
      kind: "processed",
    })

    expect(asOriginal.success).toBe(false)
    expect(asProcessed.success).toBe(true)
  })

  it("rejects empty final copy", () => {
    expect(
      setCampaignFinalCopyRequestSchema.safeParse({ finalCopy: "   " }).success
    ).toBe(false)
    expect(
      setCampaignFinalCopyRequestSchema.safeParse({ finalCopy: "Come by!" })
        .success
    ).toBe(true)
  })

  it("requires a note only when the owner requests changes", () => {
    const changesWithoutNote =
      submitCampaignReviewDecisionRequestSchema.safeParse({
        decision: "changes_requested",
      })
    const changesWithNote = submitCampaignReviewDecisionRequestSchema.safeParse(
      {
        decision: "changes_requested",
        note: "Please brighten the second photo.",
      }
    )
    const goWithoutNote = submitCampaignReviewDecisionRequestSchema.safeParse({
      decision: "go",
    })

    expect(changesWithoutNote.success).toBe(false)
    expect(changesWithNote.success).toBe(true)
    expect(goWithoutNote.success).toBe(true)
  })

  it("rejects an unrecognized review decision", () => {
    const result = submitCampaignReviewDecisionRequestSchema.safeParse({
      decision: "maybe",
    })
    expect(result.success).toBe(false)
  })
})
