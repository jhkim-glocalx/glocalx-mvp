import type { NextRequest } from "next/server"

import { ensureDemoOwnerStore } from "@/auth/session"
import { postPublishRequestSchema } from "@/domain/schemas"
import { publishPostDraft } from "@/posts/post-flow"
import {
  parseJsonRoutePayload,
  readDemoSession,
  requireSessionStoreAccess,
  requiredSessionResponse,
  withRouteDatabase,
} from "@/server/http"

type PublishRouteContext = {
  // Next canary provides dynamic route params as a promise in route handlers.
  readonly params: Promise<{
    readonly draftId: string
  }>
}

export async function POST(request: NextRequest, context: PublishRouteContext) {
  // Publish requires a session before the draft ID or payload can affect state.
  const session = readDemoSession(request)
  if (session === undefined) {
    return requiredSessionResponse()
  }

  const parsed = await parseJsonRoutePayload(request, postPublishRequestSchema)
  if (parsed.kind === "response") {
    return parsed.response
  }

  // The publish request must target the same store as the authenticated session.
  const forbiddenResponse = requireSessionStoreAccess(
    session,
    parsed.value.storeId
  )
  if (forbiddenResponse !== undefined) {
    return forbiddenResponse
  }

  ensureDemoOwnerStore()
  // Await after auth/validation so Next's promise params are consumed at the route boundary.
  const { draftId } = await context.params

  return withRouteDatabase(({ adapters, database }) => {
    const result =
      parsed.value.idempotencyKey === undefined
        ? publishPostDraft({
            adapters,
            database,
            draftId,
            storeId: session.storeId,
          })
        : publishPostDraft({
            adapters,
            database,
            draftId,
            idempotencyKey: parsed.value.idempotencyKey,
            storeId: session.storeId,
          })
    const status =
      result.status === "BLOCKED" || result.status === "MANUAL_PUBLISH_REQUIRED"
        ? 409
        : 200
    return Response.json(result, { status })
  })
}
