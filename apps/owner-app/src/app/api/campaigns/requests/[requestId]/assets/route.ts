import { randomUUID } from "node:crypto"

import type { NextRequest } from "next/server"

import { registerCampaignAssetRequestSchema } from "@glocalx/domain/campaign-contracts"
import {
  mediaStoreAllowedContentTypes,
  mediaStoreMaxFileSizeBytes,
  MediaStoreAssetNotFoundError,
} from "@glocalx/integrations/media-store"
import type { MediaStoreAllowedContentType } from "@glocalx/integrations/media-store"
import {
  parseJsonRoutePayload,
  readDatabaseSession,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

type AssetsRouteContext = {
  // Next canary provides dynamic route params as a promise in route handlers.
  readonly params: Promise<{
    readonly requestId: string
  }>
}

function campaignRequestNotFoundResponse(): Response {
  return Response.json(
    {
      status: "NOT_FOUND",
      message: "요청을 찾을 수 없습니다.",
    },
    { status: 404 }
  )
}

function mediaStoreUnavailableResponse(): Response {
  return Response.json(
    {
      status: "MEDIA_STORE_UNAVAILABLE",
      message: "지금은 업로드를 사용할 수 없습니다. 잠시 후 다시 시도해주세요.",
    },
    { status: 503 }
  )
}

function assetNotUploadedResponse(): Response {
  return Response.json(
    {
      status: "ASSET_NOT_FOUND",
      message: "업로드된 파일을 찾을 수 없습니다. 다시 업로드해주세요.",
    },
    { status: 404 }
  )
}

function assetRejectedResponse(message: string): Response {
  return Response.json({ status: "ASSET_REJECTED", message }, { status: 422 })
}

export async function POST(
  request: NextRequest,
  routeContext: AssetsRouteContext
) {
  return withQueryableRouteDatabase(async (context) => {
    const session = await readDatabaseSession(request, context.sessionStore)
    if (session === undefined) {
      return requiredSessionResponse()
    }

    const parsed = await parseJsonRoutePayload(
      request,
      registerCampaignAssetRequestSchema
    )
    if (parsed.kind === "response") {
      return parsed.response
    }

    const { requestId } = await routeContext.params
    const owningRequest = await context.campaignStore.getCampaignRequestById(
      requestId,
      session.storeId
    )
    if (owningRequest === undefined) {
      return campaignRequestNotFoundResponse()
    }

    // The client's own claimed content type/size are never trusted here — the
    // real values are re-derived from the store itself, so a bypassed or
    // abused upload token flow still can't register a mislabeled asset
    // (delivery-plan Phase 3 acceptance: "upload re-validation").
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
      return assetRejectedResponse(
        `허용되지 않는 파일 형식입니다: ${contentType}`
      )
    }
    if (sizeBytes > mediaStoreMaxFileSizeBytes) {
      await context.adapters.mediaStore.deleteAsset(parsed.value.blobUrl)
      return assetRejectedResponse("파일 크기가 10MB를 초과했습니다.")
    }

    const asset = await context.campaignStore.registerCampaignAsset({
      id: randomUUID(),
      requestId,
      storeId: session.storeId,
      kind: parsed.value.kind,
      blobUrl: parsed.value.blobUrl,
      contentType,
      sizeBytes,
      uploadedBy: "owner",
      now: new Date(),
    })

    return Response.json({ asset }, { status: 201 })
  })
}
