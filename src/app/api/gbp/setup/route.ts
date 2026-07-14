import type { NextRequest } from "next/server"

import { gbpSetupRequestSchema } from "@/domain/schemas"
import { hasSameRequestOrigin } from "@/auth/request-origin"
import { setupGoogleBusinessProfile } from "@/gbp/setup"
import { GoogleBusinessProfileApiError } from "@/integrations/production"
import { ZodError } from "zod"
import {
  parseJsonRoutePayload,
  readDatabaseSession,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

export async function POST(request: NextRequest) {
  if (!hasSameRequestOrigin(request)) {
    return Response.json(
      { status: "AUTH_REQUIRED", message: "요청 출처를 확인할 수 없습니다." },
      { status: 403 }
    )
  }
  const parsed = await parseJsonRoutePayload(request, gbpSetupRequestSchema)
  if (parsed.kind === "response") {
    return parsed.response
  }

  return withQueryableRouteDatabase(
    async ({ adapters, gbpStore, sessionStore, storeProfileRepository }) => {
      const session = await readDatabaseSession(request, sessionStore)
      if (session === undefined) {
        return requiredSessionResponse()
      }

      try {
        const result = await setupGoogleBusinessProfile({
          adapters,
          ...(parsed.value.reviewToken === undefined
            ? {}
            : { reviewToken: parsed.value.reviewToken }),
          gbpStore,
          mode: adapters.mode,
          storeId: session.storeId,
          storeProfileRepository,
        })
        return Response.json(result)
      } catch (error) {
        if (
          error instanceof GoogleBusinessProfileApiError ||
          error instanceof ZodError
        ) {
          return Response.json(
            {
              status: "GOOGLE_API_ERROR",
              message:
                "Google Business Profile 등록 요청을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.",
            },
            { status: 502 }
          )
        }
        throw error
      }
    }
  )
}
