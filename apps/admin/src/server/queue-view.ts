import type {
  CampaignQueueEntry,
  CampaignRequestDetail,
  CampaignStore,
} from "@glocalx/db/support/campaign-store"
import type { CampaignAsset } from "@glocalx/domain/campaign-contracts"
import {
  InvalidCampaignTransitionError,
  transitionCampaignRequest,
} from "@glocalx/domain/campaign-state-machine"
import type {
  CampaignAction,
  CampaignStatus,
} from "@glocalx/domain/campaign-state-machine"

// Wire shapes shared by the queue API routes and the ops client, mirroring
// inbox-view.ts so the console and the endpoints feeding it never drift.

export type QueueAssetView = {
  readonly id: string
  readonly kind: string
  readonly contentType: string
  readonly sizeBytes: number
  readonly uploadedBy: string
  readonly createdAt: string
  // Blob URLs are never handed to the client raw — this is a time-limited
  // signed URL, or null when the media store can't sign right now.
  readonly signedUrl: string | null
}

export type QueueReviewEventView = {
  readonly id: string
  readonly actor: string
  readonly decision: string
  readonly note: string | null
  readonly createdAt: string
}

export type QueueRequestView = {
  readonly id: string
  readonly storeId: string
  readonly storeName: string
  readonly brief: string
  readonly status: string
  readonly finalCopy: string | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly assets: readonly QueueAssetView[]
  readonly reviewEvents: readonly QueueReviewEventView[]
}

export type QueueEntryView = {
  readonly id: string
  readonly storeId: string
  readonly storeName: string
  readonly brief: string
  readonly status: string
  readonly finalCopy: string | null
  readonly originalCount: number
  readonly processedCount: number
  readonly updatedAt: string
}

export function toQueueEntryView(entry: CampaignQueueEntry): QueueEntryView {
  return {
    id: entry.id,
    storeId: entry.storeId,
    storeName: entry.storeName,
    brief: entry.brief,
    status: entry.status,
    finalCopy: entry.finalCopy,
    originalCount: entry.originalCount,
    processedCount: entry.processedCount,
    updatedAt: entry.updatedAt,
  }
}

export function toQueueRequestView(
  detail: CampaignRequestDetail,
  signedUrlByAssetId: ReadonlyMap<string, string>
): QueueRequestView {
  return {
    id: detail.id,
    storeId: detail.storeId,
    storeName: detail.storeName,
    brief: detail.brief,
    status: detail.status,
    finalCopy: detail.finalCopy,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    assets: detail.assets.map((asset) =>
      toQueueAssetView(asset, signedUrlByAssetId.get(asset.id) ?? null)
    ),
    reviewEvents: detail.reviewEvents.map((event) => ({
      id: event.id,
      actor: event.actor,
      decision: event.decision,
      note: event.note,
      createdAt: event.createdAt,
    })),
  }
}

function toQueueAssetView(
  asset: CampaignAsset,
  signedUrl: string | null
): QueueAssetView {
  return {
    id: asset.id,
    kind: asset.kind,
    contentType: asset.contentType,
    sizeBytes: asset.sizeBytes,
    uploadedBy: asset.uploadedBy,
    createdAt: asset.createdAt,
    signedUrl,
  }
}

export type CampaignTransitionOutcome =
  | { readonly kind: "applied"; readonly request: CampaignRequestDetail }
  | { readonly kind: "not_found" }
  | {
      readonly kind: "conflict"
      readonly currentStatus: CampaignStatus
    }

// Composes the pure domain state machine with the store's guarded write. Two
// distinct things both mean "your view was stale", and both land here as
// `conflict`: the domain function refusing the transition outright (the status
// already moved somewhere this action can't start from), and the guarded UPDATE
// matching zero rows (it moved between this read and this write). Keeping the
// transition out of packages/db is deliberate — the db package depends on
// @glocalx/domain for types only.
export async function applyCampaignAction(
  campaignStore: CampaignStore,
  requestId: string,
  action: CampaignAction,
  now: Date
): Promise<CampaignTransitionOutcome> {
  const current = await campaignStore.getCampaignRequestForOperator(requestId)
  if (current === undefined) {
    return { kind: "not_found" }
  }

  let nextStatus: CampaignStatus
  try {
    nextStatus = transitionCampaignRequest(current.status, action)
  } catch (error) {
    if (error instanceof InvalidCampaignTransitionError) {
      return { kind: "conflict", currentStatus: current.status }
    }
    throw error
  }

  const updated = await campaignStore.updateCampaignRequestStatus({
    requestId,
    expectedStatus: current.status,
    nextStatus,
    now,
  })
  if (updated === undefined) {
    return { kind: "conflict", currentStatus: current.status }
  }

  const detail = await campaignStore.getCampaignRequestForOperator(requestId)
  return detail === undefined
    ? { kind: "not_found" }
    : { kind: "applied", request: detail }
}
