"use client"

import { useEffect, useRef, useState } from "react"

import { MobileShell } from "@/app/_components/mobile-shell"
import { ReferenceComposer } from "@/app/_components/reference-composer"

import { isAppNavId, type AppNavId } from "./app-workspace-model"
import { AppWorkspaceTopBar } from "./app-workspace-topbar"
import { ReferenceFlowScreens } from "./reference-flow-screens"
import { useAppOnboarding } from "./use-app-onboarding"
import { usePostingWorkspace } from "./use-posting-workspace"

type AppWorkspaceProps = {
  readonly initialNavId?: AppNavId
  readonly storeId: string
}

export function AppWorkspace({
  initialNavId = "dashboard",
  storeId,
}: AppWorkspaceProps) {
  const [activeNavId, setActiveNavId] = useState<AppNavId>(initialNavId)
  const [composerFocusKey, setComposerFocusKey] = useState(0)
  const [composerMessage, setComposerMessage] = useState("")
  const screenRef = useRef<HTMLDivElement>(null)
  const onboarding = useAppOnboarding()
  const posting = usePostingWorkspace({
    onMoveToPosting: () => setActiveNavId("posting"),
    storeId,
  })

  useEffect(() => {
    const hasOnboardingResult =
      onboarding.extraction.kind !== "idle" ||
      onboarding.slotState.kind !== "idle" ||
      onboarding.slotMessages.length > 0 ||
      onboarding.confirmation.kind !== "idle" ||
      onboarding.setup.kind !== "idle"

    // Background onboarding updates must not scroll dashboard/posting screens in the app shell.
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
      handleComposerPreset("")
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
      posting.draft.kind === "ready" &&
      posting.draft.suggestion !== null
    ) {
      void posting.replyToSuggestion(message)
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
          activePreviewKey={posting.activePreviewKey}
          draft={posting.draft}
          imageAssets={posting.imageAssets}
          intent={posting.intent}
          onDraftSubmit={posting.submitDraft}
          onImageFiles={posting.handleImageFiles}
          onIntentChange={posting.setIntent}
          onPreviewChange={posting.setActivePreviewKey}
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
          onPublish={posting.publishDraft}
          onSelect={handleNavChange}
          onSuggestionAccept={posting.acceptSuggestion}
          onSuggestionSkip={posting.skipSuggestion}
          postingChatTurns={posting.postingChatTurns}
          postingDecision={posting.postingDecision}
          publish={posting.publish}
        />
      </MobileShell>
    </main>
  )
}
