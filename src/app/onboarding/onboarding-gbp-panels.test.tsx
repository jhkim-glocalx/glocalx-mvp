import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { SetupPanel, StoreProfileFormPanel } from "./onboarding-gbp-panels"
import type {
  ConfirmationState,
  SetupState,
  StoreProfileDraft,
} from "./onboarding-model"

const idleConfirmation = { kind: "idle" } satisfies ConfirmationState

const naverDraftMissingRequiredFields = {
  candidateId: "candidate-1",
  source: "NAVER_LOCAL",
  sourceInput: "브런치모먼트",
  name: "브런치모먼트 홍대점",
  address: "서울 마포구 와우산로 123",
  phone: "02-1234-5678",
  category: "브런치 카페",
  hours: "",
  naverPlaceUrl: "https://naver.me/store",
  missingFields: ["hours"],
} satisfies StoreProfileDraft

const completeNaverDraft = {
  ...naverDraftMissingRequiredFields,
  hours: "평일 09:00-18:00",
  missingFields: [],
} satisfies StoreProfileDraft

describe("onboarding GBP panels", () => {
  it("hides the editable confirmation form while Naver required fields are missing", () => {
    // Given
    const draft = naverDraftMissingRequiredFields

    // When
    const html = renderToStaticMarkup(
      <StoreProfileFormPanel
        confirmation={idleConfirmation}
        onConfirm={() => undefined}
        onFieldChange={() => undefined}
        profileDraft={draft}
      />
    )

    // Then
    expect(html).toBe("")
  })

  it("uses agreement wording for the completed profile confirmation CTA", () => {
    // Given
    const draft = completeNaverDraft

    // When
    const html = renderToStaticMarkup(
      <StoreProfileFormPanel
        confirmation={idleConfirmation}
        onConfirm={() => undefined}
        onFieldChange={() => undefined}
        profileDraft={draft}
      />
    )

    // Then
    expect(html).toContain("예, 맞아요")
    expect(html).not.toContain("매장 정보 확인")
  })

  it("uses the first-promotion wording for the final GBP setup CTA", () => {
    // Given
    const setup = {
      apiStatus: "VERIFICATION_PENDING",
      auditLogId: "setup-gbp-audit",
      followUpJobId: "gbp-follow-up",
      kind: "ready",
      message: "GBP 세팅 상태를 확인했어요.",
    } satisfies SetupState

    // When
    const html = renderToStaticMarkup(<SetupPanel setup={setup} />)

    // Then
    expect(html).toContain("매장 홍보 처음 시키러 가기")
    expect(html).not.toContain("대시보드로 이동")
  })

  it("offers Google authorization when live registration needs an owner token", () => {
    // Given
    const setup = {
      kind: "googleOAuthRequired",
      message: "Google 계정을 연결하면 실제 비즈니스 프로필 등록을 시작합니다.",
    } satisfies SetupState

    // When
    const html = renderToStaticMarkup(<SetupPanel setup={setup} />)

    // Then
    expect(html).toContain('action="/api/auth/google/start"')
    expect(html).toContain('name="intent"')
    expect(html).toContain('value="gbp"')
    expect(html).toContain("Google 계정 연결하기")
  })

  it("shows the exact registration review and explicit storefront approval", () => {
    const setup = {
      accountDisplayName: "Owner GBP",
      accountName: "accounts/owner",
      address: "서울 마포구 와우산로 123",
      businessName: "브런치모먼트 홍대점",
      categoryDisplayName: "브런치 카페",
      categoryName: "categories/gcid:brunch_restaurant",
      kind: "reviewRequired",
      languageCode: "ko",
      message: "매장형 비즈니스인지 확인해주세요.",
      phone: "02-1234-5678",
      reviewToken: "review-token",
      storeCode: "demo-store",
    } satisfies SetupState

    const html = renderToStaticMarkup(
      <SetupPanel onConfirmCreate={() => undefined} setup={setup} />
    )

    expect(html).toContain("Owner GBP")
    expect(html).toContain("브런치모먼트 홍대점")
    expect(html).toContain("서울 마포구 와우산로 123")
    expect(html).toContain("매장형 비즈니스로 GBP 등록 승인")
  })
})
