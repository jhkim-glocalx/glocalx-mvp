import type { NextRequest } from "next/server"

import { ensureDemoOwnerStore } from "@/auth/session"
import { parseRoutePayload, postDraftRequestSchema } from "@/domain/schemas"
import { createIntegrationAdapters } from "@/integrations"
import { createPostDraft } from "@/posts/post-flow"
import { openDatabase } from "@/server/db/sqlite"

type JsonPayloadResult =
  | {
      readonly kind: "ok"
      readonly payload: unknown
    }
  | {
      readonly kind: "invalid_json"
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

export async function POST(request: NextRequest) {
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

  const parsed = parseRoutePayload(postDraftRequestSchema, payload.payload)
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

  try {
    const adapters = createIntegrationAdapters({ database })
    const result = createPostDraft({
      adapters,
      database,
      ownerIntent: parsed.value.ownerIntent,
      storeId: parsed.value.storeId,
      targetChannel: parsed.value.targetChannel,
    })
    return Response.json(result)
  } finally {
    database.close()
  }
}
