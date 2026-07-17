import { describe, expect, it } from "vitest"

import type { LocationStatus } from "@glocalx/domain/location-status"
import { locationStatusValues } from "@glocalx/domain/location-status"

import {
  canUseLiveGbpActions,
  shouldScheduleGbpFollowUp,
} from "./state-machine"

describe("gbp-location-state-machine", () => {
  it("blocks live posts and review replies until the location is verified", () => {
    for (const status of locationStatusValues) {
      const result = canUseLiveGbpActions(status)

      if (status === "VERIFIED") {
        expect(result).toEqual({ kind: "allowed" })
      } else {
        expect(result).toEqual({
          kind: "blocked",
          code: "LOCATION_NOT_VERIFIED",
          status,
          message:
            "Google 비즈니스 프로필 인증이 완료되어야 게시글과 리뷰 답글을 라이브로 진행할 수 있습니다.",
        })
      }
    }
  })

  it("schedules follow-up only for ownership and verification waiting states", () => {
    const statusesWithFollowUp = locationStatusValues.filter((status) =>
      shouldScheduleGbpFollowUp(status)
    )

    expect(statusesWithFollowUp).toEqual([
      "CLAIM_REQUIRED",
      "VERIFICATION_PENDING",
      "MANUAL_FOLLOW_UP",
    ] satisfies readonly LocationStatus[])
  })
})
