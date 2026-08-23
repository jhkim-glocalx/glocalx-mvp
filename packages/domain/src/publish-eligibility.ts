import type {
  PublishChannel,
  StoreChannelLinkStatus,
} from "./campaign-state-machine"
import { canUseLiveGbpActions } from "./gbp-eligibility"
import type { LocationStatus } from "./location-status"

// Per-channel publish gates for the operator's publish panel. Deliberately pure
// and fact-driven: the caller reads the store's GBP location status and
// Instagram linkage, this decides. That keeps the panel's "why is this channel
// greyed out" answer and the publish route's refusal to run the same rule —
// a channel that renders as blocked can never be published by a crafted POST.

export type PublishBlockedCode =
  | "GBP_LOCATION_MISSING"
  | "GBP_LOCATION_NOT_VERIFIED"
  | "INSTAGRAM_NOT_LINKED"
  | "INSTAGRAM_LINK_EXPIRED"
  | "INSTAGRAM_LINK_REVOKED"

export type PublishEligibility =
  | { readonly kind: "eligible" }
  | {
      readonly kind: "blocked"
      readonly code: PublishBlockedCode
      readonly message: string
    }

export type PublishEligibilityFacts = {
  // Undefined means the store has no GBP location row at all — a different
  // operator action (finish GBP setup) than a location that exists but is
  // still working through verification.
  readonly gbpLocationStatus?: LocationStatus | undefined
  readonly instagramLinkStatus?: StoreChannelLinkStatus | undefined
}

const eligible: PublishEligibility = { kind: "eligible" }

// Only this blocked-state message interpolates a raw LocationStatus value, so
// the label map lives here rather than as a general-purpose export.
const locationStatusLabels: Readonly<Record<LocationStatus, string>> = {
  DISCOVERED: "발견됨",
  CLAIM_REQUIRED: "소유권 확인 필요",
  CREATE_REQUESTED: "생성 요청됨",
  VERIFICATION_PENDING: "인증 대기 중",
  VERIFIED: "인증됨",
  DUPLICATE: "중복 리스팅",
  FAILED: "실패",
  MANUAL_FOLLOW_UP: "수동 후속 조치 필요",
}

function evaluateGbp(status: LocationStatus | undefined): PublishEligibility {
  if (status === undefined) {
    return {
      kind: "blocked",
      code: "GBP_LOCATION_MISSING",
      message:
        "이 매장은 아직 연결된 Google 비즈니스 프로필 리스팅이 없습니다.",
    }
  }

  // The same VERIFIED-only gate the owner app applies to live posts and review
  // replies — one rule, two callers, so the operator can never publish to a
  // location Google would reject.
  if (canUseLiveGbpActions(status).kind === "allowed") {
    return eligible
  }

  return {
    kind: "blocked",
    code: "GBP_LOCATION_NOT_VERIFIED",
    message: `Google 비즈니스 프로필 리스팅 상태가 "${locationStatusLabels[status]}"이며 아직 인증되지 않았습니다. 인증이 완료될 때까지 게시가 보류됩니다.`,
  }
}

function evaluateInstagram(
  status: StoreChannelLinkStatus | undefined
): PublishEligibility {
  switch (status) {
    case "linked":
      return eligible
    case "expired":
      return {
        kind: "blocked",
        code: "INSTAGRAM_LINK_EXPIRED",
        message:
          "매장의 Instagram 연결이 만료되었습니다. 게시 전 계정을 다시 연결해 주세요.",
      }
    case "revoked":
      return {
        kind: "blocked",
        code: "INSTAGRAM_LINK_REVOKED",
        message:
          "매장이 Instagram 연결을 해제했습니다. 게시 전 계정을 다시 연결해 주세요.",
      }
    default:
      return {
        kind: "blocked",
        code: "INSTAGRAM_NOT_LINKED",
        message:
          "이 매장은 연결된 Instagram 비즈니스 계정이 없습니다. 게시 전 계정을 연결해 주세요.",
      }
  }
}

export function evaluatePublishEligibility(
  channel: PublishChannel,
  facts: PublishEligibilityFacts
): PublishEligibility {
  switch (channel) {
    case "gbp":
      return evaluateGbp(facts.gbpLocationStatus)
    case "instagram":
      return evaluateInstagram(facts.instagramLinkStatus)
    default: {
      const exhaustiveCheck: never = channel
      throw new Error(`Unhandled publish channel: ${String(exhaustiveCheck)}`)
    }
  }
}
