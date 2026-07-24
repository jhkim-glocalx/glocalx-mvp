import type { QueueEntryView, QueueRequestView } from "@/server/queue-view"

// Fetch helpers for the production queue console, kept out of the component so
// the request/response shapes live in one place (mirrors the owner app's
// campaign-requests.ts).

const queueUrl = "/api/queue/requests"

export type QueueActionResult =
  | { readonly kind: "ok"; readonly request: QueueRequestView }
  | { readonly kind: "error"; readonly message: string }

function jsonInit(body: unknown): RequestInit {
  return {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  }
}

async function readRequestResult(
  response: Response
): Promise<QueueActionResult> {
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return {
      kind: "error",
      message: "The server returned an unreadable response.",
    }
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "request" in payload &&
    response.ok
  ) {
    return {
      kind: "ok",
      request: (payload as { request: QueueRequestView }).request,
    }
  }

  const message =
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof (payload as { message: unknown }).message === "string"
      ? (payload as { message: string }).message
      : "That action could not be completed."
  return { kind: "error", message }
}

export async function fetchQueue(): Promise<readonly QueueEntryView[]> {
  const response = await fetch(queueUrl)
  if (!response.ok) {
    return []
  }
  const payload = (await response.json()) as {
    readonly requests?: readonly QueueEntryView[]
  }
  return payload.requests ?? []
}

export async function fetchQueueRequest(
  requestId: string
): Promise<QueueActionResult> {
  return readRequestResult(await fetch(`${queueUrl}/${requestId}`))
}

export async function startProduction(
  requestId: string
): Promise<QueueActionResult> {
  return readRequestResult(
    await fetch(`${queueUrl}/${requestId}/production`, jsonInit({}))
  )
}

export async function saveFinalCopy(
  requestId: string,
  finalCopy: string
): Promise<QueueActionResult> {
  return readRequestResult(
    await fetch(`${queueUrl}/${requestId}/final-copy`, jsonInit({ finalCopy }))
  )
}

export async function submitForReview(
  requestId: string
): Promise<QueueActionResult> {
  return readRequestResult(
    await fetch(`${queueUrl}/${requestId}/review`, jsonInit({}))
  )
}

// No body: the operator is asserting one fact — "I reached the owner" — and the
// server stamps the time.
export async function markOwnerNudged(
  requestId: string
): Promise<QueueActionResult> {
  return readRequestResult(
    await fetch(`${queueUrl}/${requestId}/nudge`, jsonInit({}))
  )
}

// Both first publish and retry go through this one call — the route picks
// START_PUBLISHING or RETRY_PUBLISHING from the request's current status, so
// the console never has to track which one it means.
export async function publishCampaign(
  requestId: string,
  channels: readonly string[]
): Promise<QueueActionResult> {
  return readRequestResult(
    await fetch(`${queueUrl}/${requestId}/publish`, jsonInit({ channels }))
  )
}

type UploadToken = {
  readonly mode: "stub" | "production"
  readonly uploadToken: string
  readonly pathname: string
  readonly blobUrl: string
}

// Same two-path upload the owner app uses: in production the browser puts the
// bytes straight into Blob (never through the 4.5MB route body cap), while stub
// mode has no real store behind it, so the fabricated URL is registered as-is.
export async function uploadProcessedAsset(
  requestId: string,
  file: File
): Promise<QueueActionResult> {
  const tokenResponse = await fetch(
    `${queueUrl}/${requestId}/upload-token`,
    jsonInit({
      filename: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    })
  )
  if (!tokenResponse.ok) {
    return readRequestResult(tokenResponse)
  }
  const token = (await tokenResponse.json()) as UploadToken

  let blobUrl = token.blobUrl
  if (token.mode === "production") {
    const { put } = await import("@vercel/blob/client")
    const blob = await put(token.pathname, file, {
      access: "private",
      contentType: file.type,
      token: token.uploadToken,
    })
    blobUrl = blob.url
  }

  return readRequestResult(
    await fetch(
      `${queueUrl}/${requestId}/assets`,
      jsonInit({ blobUrl, kind: "processed" })
    )
  )
}
