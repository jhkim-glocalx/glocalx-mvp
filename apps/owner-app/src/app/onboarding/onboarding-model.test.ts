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

  it("separates an attached listing from a claim still under review", () => {
    // Both arrive as ALREADY_LINKED; only the attached one carries a location
    // id, and only it may finish onboarding.
    const attached = toSetupState({
      status: "ALREADY_LINKED",
      googleLocationId: "locations/org-owned",
      message: "이미 연결된 Google 비즈니스 프로필이 있습니다.",
    })
    const underReview = toSetupState({
      status: "ALREADY_LINKED",
      message: "이미 등록된 프로필인지 확인하고 있습니다.",
    })

    expect(attached).toEqual({
      connected: true,
      kind: "alreadyLinked",
      message: "이미 연결된 Google 비즈니스 프로필이 있습니다.",
    })
    expect(underReview).toEqual({
      connected: false,
      kind: "alreadyLinked",
      message: "이미 등록된 프로필인지 확인하고 있습니다.",
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

  it("surfaces a missing category as an in-place actionable state, not a dead-end error", () => {
    const state = toSetupState({
      status: "CATEGORY_REQUIRED",
      message: "GBP 대표 카테고리를 먼저 선택해주세요.",
    })

    expect(state).toEqual({
      kind: "categoryRequired",
      message: "GBP 대표 카테고리를 먼저 선택해주세요.",
    })
  })

  it("surfaces a transient upstream Google failure as a retryable state, not a malformed-response error", () => {
    const state = toSetupState({
      status: "SETUP_UPSTREAM_ERROR",
      message: "Google 연동 중 일시적인 오류가 발생했어요.",
    })

    expect(state).toEqual({
      kind: "retryable",
      message: "Google 연동 중 일시적인 오류가 발생했어요.",
    })
  })

  it("supplies a default retry message when an upstream failure omits one", () => {
    const state = toSetupState({ status: "SETUP_UPSTREAM_ERROR" })

    expect(state).toEqual({
      kind: "retryable",
      message:
        "Google 연동 중 일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요.",
    })
  })

  it("surfaces an ungeocodable address as its own address-fix state", () => {
    const state = toSetupState({
      status: "ADDRESS_NOT_GEOCODABLE",
      message: "주소를 지도에서 찾지 못했습니다. 주소를 다시 확인해주세요.",
    })

    expect(state).toEqual({
      kind: "addressUnresolved",
      message: "주소를 지도에서 찾지 못했습니다. 주소를 다시 확인해주세요.",
    })
  })
})
