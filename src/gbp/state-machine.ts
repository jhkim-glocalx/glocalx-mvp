import type { LocationStatus } from "@/domain/location-status"

export type LiveGbpActionResult =
  | {
      readonly kind: "allowed"
    }
  | {
      readonly kind: "blocked"
      readonly code: "LOCATION_NOT_VERIFIED"
      readonly status: LocationStatus
      readonly message: string
    }

export function canUseLiveGbpActions(
  status: LocationStatus
): LiveGbpActionResult {
  if (status === "VERIFIED") {
    return { kind: "allowed" }
  }

  return {
    kind: "blocked",
    code: "LOCATION_NOT_VERIFIED",
    status,
    message:
      "Google 비즈니스 프로필 인증이 완료되어야 게시글과 리뷰 답글을 라이브로 진행할 수 있습니다.",
  }
}

export function shouldScheduleGbpFollowUp(status: LocationStatus): boolean {
  return (
    status === "CLAIM_REQUIRED" ||
    status === "VERIFICATION_PENDING" ||
    status === "MANUAL_FOLLOW_UP"
  )
}
