import { describe, expect, it } from "vitest"

import { toConfirmationState, toSetupState } from "./onboarding-model"

describe("onboarding response model parsing", () => {
  it("rejects confirmed profile responses without an extraction id", () => {
    const state = toConfirmationState({
      status: "CONFIRMED",
      message: "매장 정보를 확인했습니다.",
    })

    expect(state).toEqual({
      kind: "error",
      message: "매장 정보 확인 응답에 식별자가 없습니다.",
    })
  })

  it("rejects claim-required setup responses without an admin-rights URL", () => {
    const state = toSetupState({
      status: "CLAIM_REQUIRED",
      message: "관리자 권한 요청이 필요합니다.",
    })

    expect(state).toEqual({
      kind: "error",
      message: "GBP 관리자 권한 요청 링크가 없습니다.",
    })
  })

  it("preserves ready setup responses without inventing a follow-up job id", () => {
    const state = toSetupState({
      status: "VERIFIED",
      auditLogId: "setup-gbp-audit",
      message: "Google 비즈니스 프로필이 연결되었습니다.",
    })

    expect(state).toEqual({
      apiStatus: "VERIFIED",
      auditLogId: "setup-gbp-audit",
      followUpJobId: undefined,
      kind: "ready",
      message: "Google 비즈니스 프로필이 연결되었습니다.",
    })
  })

  it("reports blocked credentials as setup errors", () => {
    const state = toSetupState({
      status: "BLOCKED_BY_CREDENTIALS",
      message: "Google OAuth 인증 정보가 설정되지 않았습니다.",
      missingEnvVars: ["GOOGLE_CLIENT_ID"],
    })

    expect(state).toEqual({
      kind: "error",
      message: "Google OAuth 인증 정보가 설정되지 않았습니다.",
    })
  })
})
