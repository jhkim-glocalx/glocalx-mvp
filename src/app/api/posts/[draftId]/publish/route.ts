import type { NextRequest } from "next/server"

import { ensureDemoOwnerStore } from "@/auth/session"
import { parseRoutePayload, postPublishRequestSchema } from "@/domain/schemas"
import { createIntegrationAdapters } from "@/integrations"
import { publishPostDraft } from "@/posts/post-flow"
import { openDatabase } from "@/server/db/sqlite"

type JsonPayloadResult =
  | {
      readonly kind: "ok"
      readonly payload: unknown
    }
  | {
      readonly kind: "invalid_json"
    }

type PublishRouteContext = {
  readonly params: Promise<{
    readonly draftId: string
  }>
}

async function readJsonPayload(
  request: NextRequest
): Promise<JsonPayloadResult> {
  try {
    return {
      kind: "ok",
      payload: await request.json(),
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { kind: "invalid_json" }
    }
    throw error
  }
}

export async function POST(request: NextRequest, context: PublishRouteContext) {
  const payload = await readJsonPayload(request)
  if (payload.kind === "invalid_json") {
    return Response.json(
      {
        status: "VALIDATION_ERROR",
        message: "요청 JSON을 읽을 수 없습니다.",
      },
      { status: 400 }
    )
  }

  const parsed = parseRoutePayload(postPublishRequestSchema, payload.payload)
  if (parsed.kind === "validation_error") {
    return Response.json(
      {
        status: "VALIDATION_ERROR",
        issues: parsed.issues,
      },
      { status: 400 }
    )
  }

  ensureDemoOwnerStore()
  const database = openDatabase()
  const { draftId } = await context.params

  try {
    const adapters = createIntegrationAdapters({ database })
    const result =
      parsed.value.idempotencyKey === undefined
        ? publishPostDraft({
            adapters,
            database,
            draftId,
            storeId: parsed.value.storeId,
          })
        : publishPostDraft({
            adapters,
            database,
            draftId,
            idempotencyKey: parsed.value.idempotencyKey,
            storeId: parsed.value.storeId,
          })
    const status =
      result.status === "BLOCKED" || result.status === "MANUAL_PUBLISH_REQUIRED"
        ? 409
        : 200
    return Response.json(result, { status })
  } finally {
    database.close()
  }
}
