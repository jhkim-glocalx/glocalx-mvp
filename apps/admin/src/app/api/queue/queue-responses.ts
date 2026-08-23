import type { CampaignRequestDetail } from "@glocalx/db/support/campaign-store"
import type { CampaignStatus } from "@glocalx/domain/campaign-state-machine"

import { resolvePublishEligibility } from "@/server/campaign-publish"
import { toQueueRequestView, type QueueRequestView } from "@/server/queue-view"
import type { AdminRouteContext } from "@/server/route-database"

export function campaignRequestNotFoundResponse(): Response {
  return Response.json(
    { status: "NOT_FOUND", message: "캠페인 요청을 찾을 수 없습니다." },
    { status: 404 }
  )
}

// Mirrors queue-console.tsx's statusLabels for this response's own
// CampaignStatus slice — kept local since that map also covers
// PublishJobStatus and isn't importable into a server route.
const campaignStatusLabels: Readonly<Record<CampaignStatus, string>> = {
  submitted: "제출됨",
  in_production: "제작 중",
  ready_for_review: "사장님 확인 대기",
  approved: "승인됨",
  changes_requested: "수정 요청됨",
  rejected: "거절됨",
  publishing: "게시 중",
  published: "게시됨",
  partially_published: "부분 게시됨",
  failed: "실패",
}

// 409 rather than 400: the request was well-formed, it just raced (or the
// operator's screen was stale). The console re-reads the detail on this and
// shows the status it actually landed on.
export function campaignConflictResponse(currentStatus: string): Response {
  const label =
    campaignStatusLabels[currentStatus as CampaignStatus] ?? currentStatus
  return Response.json(
    {
      status: "STATUS_CONFLICT",
      currentStatus,
      message: `이 요청은 이미 "${label}" 상태로 변경되었습니다. 새로고침 후 다시 시도해 주세요.`,
    },
    { status: 409 }
  )
}

export function mediaStoreUnavailableResponse(): Response {
  return Response.json(
    {
      status: "MEDIA_STORE_UNAVAILABLE",
      message:
        "지금은 미디어 저장소를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    },
    { status: 503 }
  )
}

export function assetNotUploadedResponse(): Response {
  return Response.json(
    {
      status: "ASSET_NOT_FOUND",
      message: "해당 위치에서 업로드된 파일을 찾을 수 없습니다.",
    },
    { status: 404 }
  )
}

export function assetRejectedResponse(message: string): Response {
  return Response.json({ status: "ASSET_REJECTED", message }, { status: 422 })
}

// The one place a campaign request becomes an API response. Originals and
// processed assets are private in Blob, so the console only ever receives
// short-lived signed URLs; a store that can't sign (missing credentials) yields
// a null URL rather than failing the whole detail read — the operator still
// gets the brief, the copy, and the status controls. Publish jobs and per-
// channel eligibility ride along so the panel and the publish route always
// agree on what is publishable.
export async function toQueueRequestResponse(
  context: AdminRouteContext,
  detail: CampaignRequestDetail
): Promise<QueueRequestView> {
  const signed = new Map<string, string>()
  for (const asset of detail.assets) {
    const result = await context.adapters.mediaStore.getSignedUrl(asset.blobUrl)
    if (result.kind === "ok") {
      signed.set(asset.id, result.value)
    }
  }

  const [publishJobs, eligibility] = await Promise.all([
    context.publishJobStore.listPublishJobs(detail.id),
    resolvePublishEligibility(context.publishTargetStore, detail.storeId),
  ])

  return toQueueRequestView(detail, signed, { publishJobs, eligibility })
}
