// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ReferenceFlowScreens } from "./reference-flow-screens"
import type {
  AppNavId,
  DraftState,
  PlatformPostPreview,
  PostingDecisionTurnState,
} from "./app-workspace-model"

const noop = () => undefined

function baseProps(
  overrides: {
    readonly activeNavId?: AppNavId
    readonly activePreviewKey?: string
    readonly draft?: DraftState
    readonly postingDecision?: PostingDecisionTurnState
  } = {}
) {
  return {
    activeNavId: overrides.activeNavId ?? "photo",
    activePreviewKey: overrides.activePreviewKey ?? "GBP",
    draft: overrides.draft ?? { kind: "idle" },
    imageAssets: [],
    intent: "이번 주말 브런치 신메뉴 홍보",
    onComposerPreset: noop,
    onDraftSubmit: noop,
    onImageFiles: noop,
    onIntentChange: noop,
    onOnboardingCandidateSearchAgain: noop,
    onOnboardingCandidateSelect: noop,
    onOnboardingConfirm: noop,
    onOnboardingFieldChange: noop,
    onOnboardingSetup: noop,
    onPreviewChange: noop,
    onPublish: noop,
    onSelect: noop,
    onSuggestionAccept: noop,
    onSuggestionSkip: noop,
    onboardingConfirmation: { kind: "idle" },
    onboardingExtraction: { kind: "idle" },
    onboardingProfileDraft: undefined,
    onboardingSetup: { kind: "idle" },
    onboardingSlotMessages: [],
    onboardingSlotState: { kind: "idle" },
    onboardingSubmittedInput: "",
    postingChatTurns: [],
    postingDecision: overrides.postingDecision ?? { kind: "idle" },
    publish: { kind: "idle" },
  } satisfies React.ComponentProps<typeof ReferenceFlowScreens>
}

const captionTranslations = [
  {
    copy: "Try our weekend brunch menu.",
    label: "English",
    locale: "en",
  },
  {
    copy: "週末ブランチの新メニューをお楽しみください。",
    label: "Japanese",
    locale: "ja",
  },
  {
    copy: "欢迎来品尝周末早午餐新菜单。",
    label: "Chinese",
    locale: "zh",
  },
] as const

function readyDraft(
  platformPreviews: readonly PlatformPostPreview[]
): DraftState {
  return {
    draftId: "draft-ceo-feedback",
    englishCopy: "Try our weekend brunch menu.",
    generationStatus: "stub",
    images: [],
    intentAnalysis: {
      audience: "주말 방문 고객",
      keywords: ["브런치", "신메뉴"],
      objective: "주말 방문을 유도",
      promotionWindow: "이번 주말",
      tone: "따뜻한 톤",
    },
    kind: "ready",
    koreanCopy: "이번 주말 브런치 신메뉴를 만나보세요.",
    platformPreviews,
    suggestion: {
      id: "suggest-limited-weekend",
      message: "이번 주말 한정 문구를 넣으면 방문 욕구를 높일 수 있어요.",
      ownerAction: "한정 문구 추가",
      rationale: "기간과 이유가 함께 보이면 클릭 전환이 높아집니다.",
      revisedIntent: "이번 주말 브런치 신메뉴 홍보 · 한정 문구 강조",
      title: "주말 한정 문구 추가 제안",
    },
  }
}

describe("reference flow screens", () => {
  it("renders CEO-facing navigation and marketing intent copy", () => {
    render(<ReferenceFlowScreens {...baseProps()} />)

    expect(
      screen.getByRole("button", { name: "가게 인증 및 등록" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "홍보 콘텐츠 넣기" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "여러 SNS 자동홍보" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "리뷰 AI 관리" })
    ).toBeInTheDocument()
    expect(screen.getByText("알리고 싶은 말이나 단어")).toBeInTheDocument()
    expect(screen.queryByText("홍보 의도")).not.toBeInTheDocument()
  })

  it("shows completion feedback when a posting suggestion is accepted", () => {
    const draft = readyDraft([
      {
        aspectRatio: "4:3",
        callToAction: "길찾기",
        copy: "이번 주말 브런치 신메뉴를 만나보세요.",
        hashtags: ["#브런치"],
        imageAssetId: null,
        label: "Google 비즈니스 프로필",
        locale: "ko",
        platform: "GBP",
        translations: captionTranslations,
        uploadNotes: ["매장명 포함"],
      },
    ])

    render(
      <ReferenceFlowScreens
        {...baseProps({
          draft,
          postingDecision: {
            assistantMessage: "좋아요. 제안을 반영한 문구로 바꿨어요.",
            decision: "accepted",
            draft: null,
            kind: "ready",
            revisedIntent: "이번 주말 브런치 신메뉴 홍보 · 한정 문구 강조",
            sessionId: "posting-session",
          },
        })}
      />
    )

    expect(screen.getByText("방문을 늘리는 문구 제안")).toBeInTheDocument()
    expect(screen.getByText("제안 반영 완료")).toBeInTheDocument()
  })

  it("shows translations below Instagram preview without GBP verification errors", () => {
    const draft = readyDraft([
      {
        aspectRatio: "4:3",
        callToAction: "길찾기",
        copy: "이번 주말 브런치 신메뉴를 만나보세요.",
        hashtags: ["#브런치"],
        imageAssetId: null,
        label: "Google 비즈니스 프로필",
        locale: "ko",
        platform: "GBP",
        translations: captionTranslations,
        uploadNotes: ["매장명 포함"],
      },
      {
        aspectRatio: "1:1",
        callToAction: "저장과 공유",
        copy: "이번 주말 브런치 신메뉴를 인스타그램에서 소개하세요.",
        hashtags: ["#브런치", "#weekendbrunch"],
        imageAssetId: null,
        label: "Instagram 피드",
        locale: "ko",
        platform: "INSTAGRAM",
        translations: captionTranslations,
        uploadNotes: ["1:1 크롭"],
      },
    ])

    render(
      <ReferenceFlowScreens
        {...baseProps({
          activeNavId: "posting",
          activePreviewKey: "INSTAGRAM",
          draft,
        })}
        publish={{
          kind: "blocked",
          message: "Google 비즈니스 프로필 인증이 필요합니다.",
        }}
      />
    )

    expect(
      screen.queryByRole("tab", { name: "영어버전" })
    ).not.toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Instagram 피드" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    expect(
      screen.getByText("이번 주말 브런치 신메뉴를 인스타그램에서 소개하세요.")
    ).toBeInTheDocument()
    expect(screen.getByText("Try our weekend brunch menu.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Japanese" }))
    expect(
      screen.getByText("週末ブランチの新メニューをお楽しみください。")
    ).toBeInTheDocument()
    expect(screen.getByText("인스타그램 연동 준비 중")).toBeInTheDocument()
    expect(
      screen.queryByText("Google 비즈니스 프로필 인증이 필요합니다.")
    ).not.toBeInTheDocument()
  })

  it("responds to mocked review actions without backend routes", () => {
    render(
      <ReferenceFlowScreens
        {...baseProps({
          activeNavId: "reviews",
        })}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /친근하게/ }))

    expect(screen.getByText("친근한 답글 초안")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", { name: /악성 리뷰가 들어오면/ })
    )

    expect(screen.getByText("악성 리뷰 대응 가이드")).toBeInTheDocument()
  })
})
