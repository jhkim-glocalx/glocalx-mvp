import { isRecord, readString } from "@/app/_components/json-value"
import { campaignStatusLabel } from "@/campaigns/status-labels"

export { campaignStatusLabel }

export type CampaignRequestSummary = {
  readonly id: string
  readonly brief: string
  readonly status: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly assetCount: number
  readonly publishJobs: readonly CampaignPublishJobView[]
}

export type CampaignIntakeState =
  | { readonly kind: "idle" }
  | { readonly kind: "submitting" }
  | {
      readonly kind: "uploading"
      readonly uploadedCount: number
      readonly totalCount: number
    }
  | { readonly kind: "success" }
  | { readonly kind: "error"; readonly message: string }

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function readCampaignRequestSummary(
  value: unknown
): CampaignRequestSummary | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const id = readString(value["id"])
  const brief = readString(value["brief"])
  const status = readString(value["status"])
  const createdAt = readString(value["createdAt"])
  const updatedAt = readString(value["updatedAt"])
  const assetCount = readNumber(value["assetCount"])
  if (
    id === undefined ||
    brief === undefined ||
    status === undefined ||
    createdAt === undefined ||
    updatedAt === undefined ||
    assetCount === undefined
  ) {
    return undefined
  }

  const publishJobs = Array.isArray(value["publishJobs"])
    ? value["publishJobs"]
    : []

  return {
    id,
    brief,
    status,
    createdAt,
    updatedAt,
    assetCount,
    publishJobs: publishJobs.flatMap((row) => {
      const job = readCampaignPublishJobView(row)
      return job === undefined ? [] : [job]
    }),
  }
}

export function toCampaignRequestList(
  payload: unknown
): readonly CampaignRequestSummary[] {
  if (!isRecord(payload) || !Array.isArray(payload["requests"])) {
    return []
  }

  return payload["requests"].flatMap((row) => {
    const summary = readCampaignRequestSummary(row)
    return summary === undefined ? [] : [summary]
  })
}

export type CampaignAssetView = {
  readonly id: string
  readonly kind: string
  readonly signedUrl: string | null
}

export type CampaignReviewEventView = {
  readonly id: string
  readonly actor: string
  readonly decision: string
  readonly note: string | null
  readonly createdAt: string
}

export type CampaignPublishJobView = {
  readonly channel: string
  readonly status: string
  readonly updatedAt: string
}

export type CampaignRequestDetail = {
  readonly id: string
  readonly brief: string
  readonly status: string
  readonly finalCopy: string | null
  readonly assets: readonly CampaignAssetView[]
  readonly reviewEvents: readonly CampaignReviewEventView[]
  readonly publishJobs: readonly CampaignPublishJobView[]
}

function readCampaignAssetView(value: unknown): CampaignAssetView | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const id = readString(value["id"])
  const kind = readString(value["kind"])
  if (id === undefined || kind === undefined) {
    return undefined
  }
  return { id, kind, signedUrl: readString(value["signedUrl"]) ?? null }
}

function readCampaignPublishJobView(
  value: unknown
): CampaignPublishJobView | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const channel = readString(value["channel"])
  const status = readString(value["status"])
  const updatedAt = readString(value["updatedAt"])
  if (
    channel === undefined ||
    status === undefined ||
    updatedAt === undefined
  ) {
    return undefined
  }
  return { channel, status, updatedAt }
}

function readCampaignReviewEventView(
  value: unknown
): CampaignReviewEventView | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const id = readString(value["id"])
  const actor = readString(value["actor"])
  const decision = readString(value["decision"])
  const createdAt = readString(value["createdAt"])
  if (
    id === undefined ||
    actor === undefined ||
    decision === undefined ||
    createdAt === undefined
  ) {
    return undefined
  }
  return {
    id,
    actor,
    decision,
    note: readString(value["note"]) ?? null,
    createdAt,
  }
}

export function toCampaignRequestDetail(
  payload: unknown
): CampaignRequestDetail | undefined {
  if (!isRecord(payload) || !isRecord(payload["request"])) {
    return undefined
  }
  const request = payload["request"]
  const id = readString(request["id"])
  const brief = readString(request["brief"])
  const status = readString(request["status"])
  if (id === undefined || brief === undefined || status === undefined) {
    return undefined
  }

  const assets = Array.isArray(request["assets"]) ? request["assets"] : []
  const reviewEvents = Array.isArray(request["reviewEvents"])
    ? request["reviewEvents"]
    : []
  const publishJobs = Array.isArray(request["publishJobs"])
    ? request["publishJobs"]
    : []

  return {
    id,
    brief,
    status,
    finalCopy: readString(request["finalCopy"]) ?? null,
    assets: assets.flatMap((row) => {
      const asset = readCampaignAssetView(row)
      return asset === undefined ? [] : [asset]
    }),
    reviewEvents: reviewEvents.flatMap((row) => {
      const event = readCampaignReviewEventView(row)
      return event === undefined ? [] : [event]
    }),
    publishJobs: publishJobs.flatMap((row) => {
      const job = readCampaignPublishJobView(row)
      return job === undefined ? [] : [job]
    }),
  }
}

export type CreatedCampaignRequest = {
  readonly id: string
}

export function toCreatedCampaignRequest(
  payload: unknown
): CreatedCampaignRequest | undefined {
  if (!isRecord(payload) || !isRecord(payload["request"])) {
    return undefined
  }
  const id = readString(payload["request"]["id"])
  return id === undefined ? undefined : { id }
}

export type UploadTokenResult = {
  readonly mode: "stub" | "production"
  readonly uploadToken: string
  readonly pathname: string
  readonly blobUrl: string
}

export function toUploadTokenResult(
  payload: unknown
): UploadTokenResult | undefined {
  if (!isRecord(payload)) {
    return undefined
  }

  const mode = readString(payload["mode"])
  const uploadToken = readString(payload["uploadToken"])
  const pathname = readString(payload["pathname"])
  const blobUrl = readString(payload["blobUrl"])
  if (
    (mode !== "stub" && mode !== "production") ||
    uploadToken === undefined ||
    pathname === undefined ||
    blobUrl === undefined
  ) {
    return undefined
  }

  return { mode, uploadToken, pathname, blobUrl }
}

// Route-level responses (VALIDATION_ERROR, NOT_FOUND, MEDIA_STORE_UNAVAILABLE,
// ASSET_REJECTED, ASSET_NOT_FOUND) all carry a human-readable `message` — this
// is the single place that reads it back out for the UI.
export function readErrorMessage(
  payload: unknown,
  fallbackMessage: string
): string {
  if (!isRecord(payload)) {
    return fallbackMessage
  }
  return readString(payload["message"]) ?? fallbackMessage
}
