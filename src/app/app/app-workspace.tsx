"use client"

import { useState } from "react"

import { MobileShell } from "@/app/_components/mobile-shell"
import { ReferenceComposer } from "@/app/_components/reference-composer"
import {
  toExtractionState,
  type ExtractionState,
  type StoreProfileDraft,
} from "@/app/onboarding/onboarding-model"

import {
  appNavItems,
  parsePublishState,
  type AppNavId,
  type PublishState,
} from "./app-workspace-model"
import { AppWorkspaceTopBar } from "./app-workspace-topbar"
import { ReferenceFlowScreens } from "./reference-flow-screens"

type AppWorkspaceProps = {
  readonly storeId: string
}

const publishNetworkErrorMessage =
  "게시 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요."

function selectedDraftFromExtraction(
  extraction: ExtractionState
): StoreProfileDraft | undefined {
  switch (extraction.kind) {
    case "candidates":
      return extraction.candidates[0]
    case "manual":
      return extraction.draft
    case "error":
    case "idle":
    case "loading":
    case "searchQueryRequired":
      return undefined
  }
}

export function AppWorkspace({ storeId }: AppWorkspaceProps) {
  const [activeNavId, setActiveNavId] = useState<AppNavId>("photo")
  const [composerFocusKey, setComposerFocusKey] = useState(0)
  const [composerMessage, setComposerMessage] = useState("")
  const [onboardingExtraction, setOnboardingExtraction] =
    useState<ExtractionState>({ kind: "idle" })
  const [onboardingProfileDraft, setOnboardingProfileDraft] = useState<
    StoreProfileDraft | undefined
  >(undefined)
  const [onboardingSubmittedInput, setOnboardingSubmittedInput] = useState("")
  const [publish, setPublish] = useState<PublishState>({ kind: "idle" })

  function handleNavChange(navId: string) {
    if (appNavItems.some((item) => item.id === navId)) {
      setActiveNavId(navId as AppNavId)
    }
  }

  async function handlePublish() {
    setPublish({ kind: "loading" })
    try {
      const response = await fetch("/api/posts/demo-post-draft/publish", {
        body: JSON.stringify({ storeId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload: unknown = await response.json()
      setPublish(parsePublishState(payload))
    } catch {
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

  function handleComposerAttach(): void {
    if (activeNavId === "onboarding") {
      handleComposerPreset("https://naver.me/mybrunchcafe")
      return
    }

    focusComposer()
  }

  async function handleOnboardingSearch(input: string): Promise<void> {
    setOnboardingExtraction({ kind: "loading" })
    setOnboardingProfileDraft(undefined)
    setOnboardingSubmittedInput(input)

    try {
      const response = await fetch("/api/onboarding/extractions", {
        body: JSON.stringify({ input }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload: unknown = await response.json()
      const nextExtraction = toExtractionState(payload, input)
      setOnboardingExtraction(nextExtraction)
      setOnboardingProfileDraft(selectedDraftFromExtraction(nextExtraction))
    } catch (error) {
      setOnboardingExtraction({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "가게 정보 조회에 실패했습니다.",
      })
    }
  }

  function handleComposerSubmit(message: string): void {
    if (activeNavId === "onboarding") {
      void handleOnboardingSearch(message)
    }
  }

  return (
    <main className="gx-route-page">
      <MobileShell
        bottomBar={
          activeNavId === "dashboard" ? undefined : (
            <ReferenceComposer
              focusKey={composerFocusKey}
              onAttach={handleComposerAttach}
              onChange={setComposerMessage}
              onSubmit={handleComposerSubmit}
              value={composerMessage}
            />
          )
        }
        key={activeNavId}
        screenClassName={
          activeNavId === "dashboard" ? "gx-dashboard-screen" : "gx-chat-screen"
        }
        testId="app-stage"
        topBar={activeNavId === "dashboard" ? undefined : <AppWorkspaceTopBar />}
      >
        <ReferenceFlowScreens
          activeNavId={activeNavId}
          onComposerPreset={handleComposerPreset}
          onboardingExtraction={onboardingExtraction}
          onboardingProfileDraft={onboardingProfileDraft}
          onboardingSubmittedInput={onboardingSubmittedInput}
          onOnboardingCandidateSelect={setOnboardingProfileDraft}
          onPublish={handlePublish}
          onSelect={handleNavChange}
          publish={publish}
        />
      </MobileShell>
    </main>
  )
}
