import type { NextRequest } from "next/server"

import {
  campaignConflictResponse,
  campaignRequestNotFoundResponse,
  mediaStoreUnavailableResponse,
} from "@/app/api/queue/queue-responses"
import { parseAdminJson, withAdminRoute } from "@/server/route-database"
import { createUploadTokenRequestSchema } from "@glocalx/domain/campaign-contracts"
import { MediaStoreValidationError } from "@glocalx/integrations/media-store"

type QueueRequestRouteContext = {
  readonly params: Promise<{ readonly requestId: string }>
}

function uploadValidationErrorResponse(message: string): Response {
  return Response.json({ status: "VALIDATION_ERROR", message }, { status: 400 })
}

// Mints a direct-to-Blob upload token for an operator's processed asset. The
// object key is namespaced under the owning store, not the operator, so
// processed and original assets for one campaign live together.
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
        createUploadTokenRequestSchema
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

      let result
      try {
        result = await context.adapters.mediaStore.createUploadToken({
          storeId: current.storeId,
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
    },
    { requireSameOrigin: true }
  )
}
