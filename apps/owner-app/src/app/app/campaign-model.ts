import { isRecord, readString } from "@/app/_components/json-value"

export type CampaignRequestSummary = {
  readonly id: string
  readonly brief: string
  readonly status: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly assetCount: number
}

// Owner-facing labels for the status timeline — later phases (review/publish)
// add UI for approved/publishing/etc.; PR2 only ever produces "submitted".
const campaignStatusLabels: Record<string, string> = {
  submitted: "제출됨",
  in_production: "제작 중",
  ready_for_review: "검토 대기",
  approved: "승인됨",
  changes_requested: "수정 요청됨",
  rejected: "반려됨",
  publishing: "게시 중",
  published: "게시 완료",
  partially_published: "일부 게시 완료",
  failed: "실패",
}

export function campaignStatusLabel(status: string): string {
  return campaignStatusLabels[status] ?? status
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

  return { id, brief, status, createdAt, updatedAt, assetCount }
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
