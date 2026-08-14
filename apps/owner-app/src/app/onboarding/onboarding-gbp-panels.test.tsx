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

  it("asks about Instagram once GBP setup is ready, before offering the exit", () => {
    // Given
    const setup = {
      apiStatus: "VERIFICATION_PENDING",
      auditLogId: "setup-gbp-audit",
      followUpJobId: "gbp-follow-up",
      kind: "ready",
      message: "GBP 세팅 상태를 확인했어요.",
    } satisfies SetupState

    // When
    const html = renderToStaticMarkup(
      <SetupPanel onRetry={() => undefined} setup={setup} />
    )

    // Then
    expect(html).toContain("인스타그램 계정도 운영하고 계신가요?")
    expect(html).toContain("네, 연결할게요")
    expect(html).toContain("아니요, 없어요")
    // The onboarding exit now sits behind that answer, so it is not yet on
    // screen — InstagramConnectPanel owns it from here.
    expect(html).not.toContain("매장 홍보 처음 시키러 가기")
    expect(html).not.toContain("대시보드로 이동")
  })

  it("offers an inline category picker and retry when the category is missing", () => {
    // Given
    const setup = {
      kind: "categoryRequired",
      message: "GBP 대표 카테고리를 먼저 선택해주세요.",
    } satisfies SetupState

    // When
    const html = renderToStaticMarkup(
      <SetupPanel onRetry={() => undefined} setup={setup} />
    )

    // Then
    expect(html).toContain("GBP 대표 카테고리를 먼저 선택해주세요.")
    // The picker is rendered inline so the owner fixes it here, not by scrolling.
    expect(html).toContain("업종(카테고리) 선택")
    expect(html).toContain("카테고리 선택 후 다시 시도")
  })

  it("offers a retry button when Google fails transiently, instead of a dead-end alert", () => {
    // Given
    const setup = {
      kind: "retryable",
      message: "Google 연동 중 일시적인 오류가 발생했어요.",
    } satisfies SetupState

    // When
    const html = renderToStaticMarkup(
      <SetupPanel onRetry={() => undefined} setup={setup} />
    )

    // Then
    expect(html).toContain("Google 연동 중 일시적인 오류가 발생했어요.")
    expect(html).toContain("다시 시도")
  })

  it("moves an owner whose adopted listing is attached on to the Instagram step", () => {
    // Given an operator has confirmed the adoption claim, so a listing is live
    // on the store. This owner never runs GBP setup, so `ready` — the panel that
    // normally leads to the onboarding exit — is unreachable for them.
    const setup = {
      connected: true,
      kind: "alreadyLinked",
      message: "이미 연결된 Google 비즈니스 프로필이 있습니다.",
    } satisfies SetupState

    // When
    const html = renderToStaticMarkup(
      <SetupPanel onRetry={() => undefined} setup={setup} />
    )

    // Then they land on the same last step as everyone else rather than exiting
    // straight to the app, so the Instagram question is not skippable by taking
    // the adoption branch.
    expect(html).toContain("인스타그램 계정도 운영하고 계신가요?")
    expect(html).toContain("GBP 연결 확인")
    expect(html).not.toContain("매장 홍보 처음 시키러 가기")
  })

  it("makes an owner wait while an operator is still ruling on the claim", () => {
    // Given
    const setup = {
      connected: false,
      kind: "alreadyLinked",
      message: "이미 등록된 프로필인지 확인하고 있습니다.",
    } satisfies SetupState

    // When
    const html = renderToStaticMarkup(
      <SetupPanel onRetry={() => undefined} setup={setup} />
    )

    // Then advancing here would drop the owner into an app with no listing to
    // publish to, so the only thing on screen is the wait message.
    expect(html).toContain("이미 등록된 프로필인지 확인하고 있습니다.")
    expect(html).not.toContain("인스타그램 계정도 운영하고 계신가요?")
  })

  it("guides the owner to re-check the address when it cannot be geocoded", () => {
    // Given
    const setup = {
      kind: "addressUnresolved",
      message: "매장 주소를 지도에서 찾지 못했습니다.",
    } satisfies SetupState

    // When
    const html = renderToStaticMarkup(
      <SetupPanel onRetry={() => undefined} setup={setup} />
    )

    // Then
    expect(html).toContain("매장 주소를 지도에서 찾지 못했습니다.")
    expect(html).toContain("주소 확인 필요")
  })
})
