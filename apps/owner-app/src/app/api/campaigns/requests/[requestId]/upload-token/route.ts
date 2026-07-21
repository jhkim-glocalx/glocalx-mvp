import type { NextRequest } from "next/server"

import { createUploadTokenRequestSchema } from "@glocalx/domain/campaign-contracts"
import { MediaStoreValidationError } from "@glocalx/integrations/media-store"
import {
  parseJsonRoutePayload,
  readDatabaseSession,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

type UploadTokenRouteContext = {
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

function uploadValidationErrorResponse(message: string): Response {
  return Response.json({ status: "VALIDATION_ERROR", message }, { status: 400 })
}

export async function POST(
  request: NextRequest,
  routeContext: UploadTokenRouteContext
) {
  return withQueryableRouteDatabase(async (context) => {
    const session = await readDatabaseSession(request, context.sessionStore)
    if (session === undefined) {
      return requiredSessionResponse()
    }

    const parsed = await parseJsonRoutePayload(
      request,
      createUploadTokenRequestSchema
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

    let result
    try {
      result = await context.adapters.mediaStore.createUploadToken({
        storeId: session.storeId,
        filename: parsed.value.filename,
        contentType: parsed.value.contentType,
        sizeBytes: parsed.value.sizeBytes,
      })
    } catch (error) {
      if (error instanceof MediaStoreValidationError) {
        return uploadValidationErrorResponse(error.message)
      }
      throw error
    }
    if (result.kind === "blocked_by_credentials") {
      return mediaStoreUnavailableResponse()
    }

    return Response.json({
      mode: context.adapters.mode,
      uploadToken: result.value.uploadToken,
      pathname: result.value.pathname,
      blobUrl: result.value.blobUrl,
      expiresAt: result.value.expiresAt,
    })
  })
}
