"use client"

import { useEffect, useRef, useState } from "react"

import { MobileShell } from "@/app/_components/mobile-shell"
import { ReferenceComposer } from "@/app/_components/reference-composer"

import {
  appNavItems,
  parseDraftState,
  parsePostingDecisionTurnState,
  parsePublishState,
  type AppNavId,
  type DraftState,
  type MarketingPlatform,
  type PostingChatTurn,
  type PostingDecisionTurnState,
  type PublishState,
} from "./app-workspace-model"
import { AppWorkspaceTopBar } from "./app-workspace-topbar"
import { readAppJsonResponse } from "./app-workspace-response"
import { ReferenceFlowScreens } from "./reference-flow-screens"
import { useAppOnboarding } from "./use-app-onboarding"
import { useImageAssets } from "./use-image-assets"

type AppWorkspaceProps = {
  readonly storeId: string
}

const publishNetworkErrorMessage =
  "게시 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요."

function isAppNavId(navId: string): navId is AppNavId {
  return appNavItems.some((item) => item.id === navId)
}

export function AppWorkspace({ storeId }: AppWorkspaceProps) {
  const [activeNavId, setActiveNavId] = useState<AppNavId>("dashboard")
  const [composerFocusKey, setComposerFocusKey] = useState(0)
  const [composerMessage, setComposerMessage] = useState("")
  const screenRef = useRef<HTMLDivElement>(null)
  const onboarding = useAppOnboarding()
  const [activePlatform, setActivePlatform] = useState<MarketingPlatform>("GBP")
  const [draft, setDraft] = useState<DraftState>({ kind: "idle" })
  const [intent, setIntent] = useState("이번 주말 브런치 신메뉴 홍보")
  const [postingChatTurns, setPostingChatTurns] = useState<
    readonly PostingChatTurn[]
  >([])
  const [postingDecision, setPostingDecision] =
    useState<PostingDecisionTurnState>({ kind: "idle" })
  const [postingSessionId, setPostingSessionId] = useState<string>()
  const [publish, setPublish] = useState<PublishState>({ kind: "idle" })
  const { handleImageFiles, imageAssets } = useImageAssets({
    onImagesSelected: () => {
      setDraft({ kind: "idle" })
      setPostingChatTurns([])
      setPostingDecision({ kind: "idle" })
      setPostingSessionId(undefined)
      setPublish({ kind: "idle" })
    },
    onInvalidImage: (message) => {
      setDraft({ kind: "error", message })
    },
  })

  useEffect(() => {
    const hasOnboardingResult =
      onboarding.extraction.kind !== "idle" ||
      onboarding.slotState.kind !== "idle" ||
      onboarding.slotMessages.length > 0 ||
      onboarding.confirmation.kind !== "idle" ||
      onboarding.setup.kind !== "idle"

    if (activeNavId !== "onboarding" || !hasOnboardingResult) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      const screen = screenRef.current
      screen?.scrollTo({ behavior: "smooth", top: screen.scrollHeight })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [
    activeNavId,
    onboarding.confirmation.kind,
    onboarding.extraction.kind,
    onboarding.setup.kind,
    onboarding.slotMessages.length,
    onboarding.slotState.kind,
  ])

  function handleNavChange(navId: string) {
    if (isAppNavId(navId)) {
      setActiveNavId(navId)
    }
  }

  async function requestDraft(options: {
    readonly acceptedSuggestionId?: string
    readonly nextIntent?: string
    readonly suggestionMode: "request" | "accepted" | "skipped"
  }) {
    const ownerIntent = options.nextIntent ?? intent
    if (imageAssets.length === 0) {
      setDraft({
        kind: "error",
        message: "게시물에 사용할 이미지를 먼저 업로드해주세요.",
      })
      return
    }

    setDraft({ kind: "loading" })
    setPostingDecision({ kind: "idle" })
    setPublish({ kind: "idle" })
    try {
      const response = await fetch("/api/posts/drafts", {
        body: JSON.stringify({
          ...(options.acceptedSuggestionId === undefined
            ? {}
            : { acceptedSuggestionId: options.acceptedSuggestionId }),
          imageAssets,
          ownerIntent,
          storeId,
          suggestionMode: options.suggestionMode,
          targetChannel: "GBP",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload = await readAppJsonResponse(
        response,
        "마케팅 초안을 생성하지 못했습니다."
      )
      setDraft(parseDraftState(payload))
      setActivePlatform("GBP")
    } catch (caught) {
      setDraft({
        kind: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "마케팅 초안을 생성하지 못했습니다.",
      })
    }
  }

  async function handleDraftSubmit() {
    setPostingChatTurns([])
    setPostingDecision({ kind: "idle" })
    setPostingSessionId(undefined)
    await requestDraft({ suggestionMode: "request" })
  }

  async function handleSuggestionReply(ownerMessage: string) {
    if (draft.kind !== "ready" || draft.suggestion === null) {
      return
    }

    const clientEventId = window.crypto.randomUUID()
    setPostingChatTurns((currentTurns) => [
      ...currentTurns,
      {
        id: `owner-${clientEventId}`,
        message: ownerMessage,
        speaker: "owner",
      },
    ])
    setPostingDecision({ kind: "loading" })
    setPublish({ kind: "idle" })

    try {
      const response = await fetch("/api/posts/conversation/decision", {
        body: JSON.stringify({
          activeSuggestionId: draft.suggestion.id,
          clientEventId,
          draftId: draft.draftId,
          draftSummary: draft.koreanCopy,
          imageAssets,
          ownerIntent: intent,
          ownerMessage,
          ...(postingSessionId === undefined
            ? {}
            : { sessionId: postingSessionId }),
          storeId,
          suggestionMessage: draft.suggestion.message,
          suggestionRevisedIntent: draft.suggestion.revisedIntent,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload = await readAppJsonResponse(
        response,
        "제안 응답을 처리하지 못했습니다."
      )
      const nextDecision = parsePostingDecisionTurnState(payload)
      setPostingDecision(nextDecision)
      if (nextDecision.kind !== "ready") {
        return
      }

      setPostingSessionId(nextDecision.sessionId)
      if (nextDecision.revisedIntent !== null) {
        setIntent(nextDecision.revisedIntent)
      }
      setPostingChatTurns((currentTurns) => [
        ...currentTurns,
        {
          id: `assistant-${clientEventId}`,
          message: nextDecision.assistantMessage,
          speaker: "assistant",
        },
      ])
      if (nextDecision.draft !== null) {
        setDraft(nextDecision.draft)
        setActivePlatform("GBP")
        setActiveNavId("posting")
      }
      setPostingDecision({ kind: "idle" })
    } catch (caught) {
      setPostingDecision({
        kind: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "제안 응답을 처리하지 못했습니다.",
      })
    }
  }

  async function handleSuggestionAccept() {
    await handleSuggestionReply("좋아, 제안 반영해줘")
  }

  async function handleSuggestionSkip() {
    await handleSuggestionReply("그냥 진행할게")
  }

  async function handlePublish() {
    if (draft.kind !== "ready") {
      setPublish({
        kind: "blocked",
        message: "먼저 이미지와 홍보 의도를 분석해 게시물 초안을 만들어주세요.",
      })
      return
    }

    setPublish({ kind: "loading" })
    try {
      const response = await fetch(`/api/posts/${draft.draftId}/publish`, {
        body: JSON.stringify({ storeId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload = await readAppJsonResponse(
        response,
        publishNetworkErrorMessage
      )
      setPublish(parsePublishState(payload))
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error
      }

      setPublish({
        kind: "blocked",
        message: publishNetworkErrorMessage,
      })
    }
  }

  function focusComposer(): void {
    setComposerFocusKey((currentKey) => currentKey + 1)
  }

  function handleComposerPreset(message: string): void {
    setComposerMessage(message)
    focusComposer()
  }

  function handleOnboardingSearchAgain(): void {
    onboarding.searchAgain()
    handleComposerPreset("")
  }

  function handleComposerAttach(): void {
    if (activeNavId === "onboarding") {
      handleComposerPreset("https://naver.me/mybrunchcafe")
      return
    }

    focusComposer()
  }

  function handleComposerSubmit(message: string): void {
    if (activeNavId === "onboarding") {
      void onboarding.submitComposerMessage(message)
      return
    }

    if (
      (activeNavId === "photo" || activeNavId === "posting") &&
      draft.kind === "ready" &&
      draft.suggestion !== null
    ) {
      void handleSuggestionReply(message)
    }
  }

  const showComposer = activeNavId !== "dashboard"

  return (
    <main className="gx-route-page">
      <MobileShell
        bottomBar={
          showComposer ? (
            <ReferenceComposer
              focusKey={composerFocusKey}
              onAttach={handleComposerAttach}
              onChange={setComposerMessage}
              onSubmit={handleComposerSubmit}
              value={composerMessage}
            />
          ) : undefined
        }
        key={activeNavId}
        screenClassName={
          activeNavId === "dashboard" ? "gx-dashboard-screen" : "gx-chat-screen"
        }
        screenRef={screenRef}
        testId="app-stage"
        topBar={
          activeNavId === "dashboard" ? undefined : <AppWorkspaceTopBar />
        }
      >
        <ReferenceFlowScreens
          activeNavId={activeNavId}
          activePlatform={activePlatform}
          draft={draft}
          imageAssets={imageAssets}
          intent={intent}
          onDraftSubmit={handleDraftSubmit}
          onImageFiles={handleImageFiles}
          onIntentChange={setIntent}
          onPlatformChange={setActivePlatform}
          onComposerPreset={handleComposerPreset}
          onboardingConfirmation={onboarding.confirmation}
          onboardingExtraction={onboarding.extraction}
          onboardingProfileDraft={onboarding.profileDraft}
          onboardingSetup={onboarding.setup}
          onboardingSlotMessages={onboarding.slotMessages}
          onboardingSlotState={onboarding.slotState}
          onboardingSubmittedInput={onboarding.submittedInput}
          onOnboardingCandidateSearchAgain={handleOnboardingSearchAgain}
          onOnboardingCandidateSelect={onboarding.selectCandidate}
          onOnboardingConfirm={onboarding.confirm}
          onOnboardingFieldChange={onboarding.changeDraftField}
          onOnboardingSetup={onboarding.checkSetup}
          onPublish={handlePublish}
          onSelect={handleNavChange}
          onSuggestionAccept={handleSuggestionAccept}
          onSuggestionSkip={handleSuggestionSkip}
          postingChatTurns={postingChatTurns}
          postingDecision={postingDecision}
          publish={publish}
        />
      </MobileShell>
    </main>
  )
}
