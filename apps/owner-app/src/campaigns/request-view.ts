import type { CampaignRequestDetail } from "@glocalx/db/support/campaign-store"
import type { MediaStore } from "@glocalx/integrations/media-store"

// The owner-facing shape of a campaign request. Deliberately narrower than the
// operator's view: no raw blob URLs (signed, time-limited URLs only) and no
// store name, which the owner already knows.

export type OwnerCampaignAssetView = {
  readonly id: string
  readonly kind: string
  readonly contentType: string
  readonly signedUrl: string | null
}

export type OwnerCampaignReviewEventView = {
  readonly id: string
  readonly actor: string
  readonly decision: string
  readonly note: string | null
  readonly createdAt: string
}

export type OwnerCampaignRequestView = {
  readonly id: string
  readonly brief: string
  readonly status: string
  readonly finalCopy: string | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly assets: readonly OwnerCampaignAssetView[]
  readonly reviewEvents: readonly OwnerCampaignReviewEventView[]
}

export async function toOwnerCampaignRequestView(
  mediaStore: MediaStore,
  detail: CampaignRequestDetail
): Promise<OwnerCampaignRequestView> {
  const assets: OwnerCampaignAssetView[] = []
  for (const asset of detail.assets) {
    const signed = await mediaStore.getSignedUrl(asset.blobUrl)
    assets.push({
      id: asset.id,
      kind: asset.kind,
      contentType: asset.contentType,
      // A store that can't sign yields null rather than failing the read — the
      // owner still sees the copy and the decision buttons.
      signedUrl: signed.kind === "ok" ? signed.value : null,
    })
  }

  return {
    id: detail.id,
    brief: detail.brief,
    status: detail.status,
    finalCopy: detail.finalCopy,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    assets,
    reviewEvents: detail.reviewEvents.map((event) => ({
      id: event.id,
      actor: event.actor,
      decision: event.decision,
      note: event.note,
      createdAt: event.createdAt,
    })),
  }
}
