import type {
  CampaignStatus,
  PublishChannel,
  PublishJobStatus,
} from "@glocalx/domain/campaign-state-machine"

// Owner-facing Korean labels for every campaign status. Lives outside the
// client model so route handlers can build the same wording into their
// responses — a second copy on the server would drift the moment one side
// gained a status.
const campaignStatusLabels: Record<CampaignStatus, string> = {
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
  return campaignStatusLabels[status as CampaignStatus] ?? status
}

const publishChannelLabels: Record<PublishChannel, string> = {
  gbp: "구글",
  instagram: "인스타",
}

export function publishChannelLabel(channel: string): string {
  return publishChannelLabels[channel as PublishChannel] ?? channel
}

// The owner sees where each channel stands, not how many attempts it took —
// the attempt count and the failure text are operator detail.
const publishJobStatusLabels: Record<PublishJobStatus, string> = {
  queued: "대기 중",
  publishing: "게시 중",
  published: "게시 완료",
  failed: "실패",
}

export function publishJobStatusLabel(status: string): string {
  return publishJobStatusLabels[status as PublishJobStatus] ?? status
}
