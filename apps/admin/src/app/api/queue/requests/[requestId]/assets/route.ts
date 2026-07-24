import { randomUUID } from "node:crypto"

import type { NextRequest } from "next/server"

import {
  assetNotUploadedResponse,
  assetRejectedResponse,
  campaignConflictResponse,
  campaignRequestNotFoundResponse,
  mediaStoreUnavailableResponse,
  toQueueRequestResponse,
} from "@/app/api/queue/queue-responses"
import { parseAdminJson, withAdminRoute } from "@/server/route-database"
import { registerProcessedAssetRequestSchema } from "@glocalx/domain/campaign-contracts"
import {
  mediaStoreAllowedContentTypes,
  mediaStoreMaxFileSizeBytes,
  MediaStoreAssetNotFoundError,
} from "@glocalx/integrations/media-store"
import type { MediaStoreAllowedContentType } from "@glocalx/integrations/media-store"

type QueueRequestRouteContext = {
  readonly params: Promise<{ readonly requestId: string }>
}

// Registers an operator's processed asset. Same re-validation posture as the
// owner's upload path: content type and size come from the store itself, never
// from the client, so a bypassed token flow still can't attach a mislabeled or
// oversize file.
export async function POST(
  request: NextRequest,
  routeContext: QueueRequestRouteContext
) {
  const { requestId } = await routeContext.params
  return withAdminRoute(
    request,
    async (context) => {
      const parsed = await parseAdminJson(
        request,
        registerProcessedAssetRequestSchema
      )
      if (parsed.kind === "response") {
        return parsed.response
      }

      const current =
        await context.campaignStore.getCampaignRequestForOperator(requestId)
      if (current === undefined) {
        return campaignRequestNotFoundResponse()
      }
      if (current.status !== "in_production") {
        return campaignConflictResponse(current.status)
      }

      let metadata
      try {
        metadata = await context.adapters.mediaStore.getAssetMetadata(
          parsed.value.blobUrl
        )
      } catch (error) {
        if (error instanceof MediaStoreAssetNotFoundError) {
          return assetNotUploadedResponse()
        }
        throw error
      }
      if (metadata.kind === "blocked_by_credentials") {
        return mediaStoreUnavailableResponse()
      }

      const { contentType, sizeBytes } = metadata.value
      if (
        !mediaStoreAllowedContentTypes.includes(
          contentType as MediaStoreAllowedContentType
        )
      ) {
        await context.adapters.mediaStore.deleteAsset(parsed.value.blobUrl)
        return assetRejectedResponse(`Unsupported file type: ${contentType}`)
      }
      if (sizeBytes > mediaStoreMaxFileSizeBytes) {
        await context.adapters.mediaStore.deleteAsset(parsed.value.blobUrl)
        return assetRejectedResponse("File exceeds the 10MB limit.")
      }

      await context.campaignStore.registerCampaignAsset({
        id: randomUUID(),
        requestId,
        // Ownership still routes through the owning store, so the store-scoped
        // guard inside registerCampaignAsset keeps doing its job here.
        storeId: current.storeId,
        kind: parsed.value.kind,
        blobUrl: parsed.value.blobUrl,
        contentType,
        sizeBytes,
        uploadedBy: "admin",
        now: new Date(),
      })

      await context.auditLogStore.record({
        action: "campaign_register_asset",
        adminUserId: context.adminUserId,
        storeId: current.storeId,
        campaignRequestId: requestId,
        detail: { kind: parsed.value.kind },
      })

      const detail =
        await context.campaignStore.getCampaignRequestForOperator(requestId)
      if (detail === undefined) {
        return campaignRequestNotFoundResponse()
      }
      return Response.json(
        {
          request: await toQueueRequestResponse(context, detail),
        },
        { status: 201 }
      )
    },
    { requireSameOrigin: true }
  )
}
