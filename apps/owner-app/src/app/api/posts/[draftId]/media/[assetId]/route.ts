import type { NextRequest } from "next/server"

import { isValidPostMediaSignature } from "@/posts/post-media"
import { withQueryableRouteDatabase } from "@/server/http"

type MediaRouteContext = {
  readonly params: Promise<{
    readonly assetId: string
    readonly draftId: string
  }>
}

function dataUrlResponse(dataUrl: string, mimeType: string): Response {
  const prefix = `data:${mimeType};base64,`
  if (!dataUrl.startsWith(prefix)) {
    return new Response(null, { status: 404 })
  }
  return new Response(Buffer.from(dataUrl.slice(prefix.length), "base64"), {
    headers: {
      "Cache-Control": "public, max-age=3600, immutable",
      "Content-Type": mimeType,
      "X-Content-Type-Options": "nosniff",
    },
  })
}

export async function GET(request: NextRequest, context: MediaRouteContext) {
  const { assetId, draftId } = await context.params
  const signature = request.nextUrl.searchParams.get("signature") ?? ""
  const expires = request.nextUrl.searchParams.get("expires") ?? ""
  if (!isValidPostMediaSignature(draftId, assetId, signature, expires)) {
    return new Response(null, { status: 404 })
  }

  return withQueryableRouteDatabase(async ({ postStore }) => {
    const draft = await postStore.readDraftMedia(draftId)
    const asset = draft?.preview?.sourceImages?.find(
      (candidate) => candidate.id === assetId
    )
    if (asset?.dataUrl === undefined) {
      return new Response(null, { status: 404 })
    }
    return dataUrlResponse(asset.dataUrl, asset.mimeType)
  })
}
