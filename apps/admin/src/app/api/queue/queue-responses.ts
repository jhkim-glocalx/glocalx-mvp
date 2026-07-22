import type { CampaignRequestDetail } from "@glocalx/db/support/campaign-store"
import type { MediaStore } from "@glocalx/integrations/media-store"

import { toQueueRequestView, type QueueRequestView } from "@/server/queue-view"

export function campaignRequestNotFoundResponse(): Response {
  return Response.json(
    { status: "NOT_FOUND", message: "Campaign request not found." },
    { status: 404 }
  )
}

// 409 rather than 400: the request was well-formed, it just raced (or the
// operator's screen was stale). The console re-reads the detail on this and
// shows the status it actually landed on.
export function campaignConflictResponse(currentStatus: string): Response {
  return Response.json(
    {
      status: "STATUS_CONFLICT",
      currentStatus,
      message: `This request has already moved to "${currentStatus}". Reload before acting on it again.`,
    },
    { status: 409 }
  )
}

export function mediaStoreUnavailableResponse(): Response {
  return Response.json(
    {
      status: "MEDIA_STORE_UNAVAILABLE",
      message: "Media storage is unavailable right now. Try again shortly.",
    },
    { status: 503 }
  )
}

export function assetNotUploadedResponse(): Response {
  return Response.json(
    {
      status: "ASSET_NOT_FOUND",
      message: "No uploaded file was found at that location.",
    },
    { status: 404 }
  )
}

export function assetRejectedResponse(message: string): Response {
  return Response.json({ status: "ASSET_REJECTED", message }, { status: 422 })
}

// Originals and processed assets are private in Blob, so the console only ever
// receives short-lived signed URLs. A store that can't sign (missing
// credentials) yields a null URL rather than failing the whole detail read —
// the operator still gets the brief, the copy, and the status controls.
export async function signQueueAssets(
  mediaStore: MediaStore,
  detail: CampaignRequestDetail
): Promise<QueueRequestView> {
  const signed = new Map<string, string>()
  for (const asset of detail.assets) {
    const result = await mediaStore.getSignedUrl(asset.blobUrl)
    if (result.kind === "ok") {
      signed.set(asset.id, result.value)
    }
  }
  return toQueueRequestView(detail, signed)
}
