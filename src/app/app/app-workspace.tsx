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
  parseDraftState,
  parsePublishState,
  type AppNavId,
  type DraftState,
  type MarketingImageAsset,
  type MarketingPlatform,
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

const maxImageBytes = 1_200_000

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
        return
      }
      reject(new Error("이미지를 읽지 못했습니다."))
    })
    reader.addEventListener("error", () => reject(reader.error))
    reader.readAsDataURL(file)
  })
}

function isSupportedImageType(
  mimeType: string
): mimeType is MarketingImageAsset["mimeType"] {
  return (
    mimeType === "image/jpeg" ||
    mimeType === "image/png" ||
    mimeType === "image/webp"
  )
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
  const [activePlatform, setActivePlatform] = useState<MarketingPlatform>("GBP")
  const [draft, setDraft] = useState<DraftState>({ kind: "idle" })
  const [imageAssets, setImageAssets] = useState<
    readonly MarketingImageAsset[]
  >([])
  const [intent, setIntent] = useState("이번 주말 브런치 신메뉴 홍보")
  const [publish, setPublish] = useState<PublishState>({ kind: "idle" })

  function handleNavChange(navId: string) {
    if (appNavItems.some((item) => item.id === navId)) {
      setActiveNavId(navId as AppNavId)
    }
  }

  async function handleImageFiles(files: FileList | null) {
    if (files === null || files.length === 0) {
      return
    }

    const selectedFiles = Array.from(files).slice(0, 4)
    const unsupportedFile = selectedFiles.find(
      (file) => !isSupportedImageType(file.type)
    )
    if (unsupportedFile !== undefined) {
      setDraft({
        kind: "error",
        message: "JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.",
      })
      return
    }

    const oversizedFile = selectedFiles.find(
      (file) => file.size > maxImageBytes
    )
    if (oversizedFile !== undefined) {
      setDraft({
        kind: "error",
        message: "이미지는 장당 1.2MB 이하로 올려주세요.",
      })
      return
    }

    const nextAssets = await Promise.all(
      selectedFiles.map(async (file, index) => ({
        dataUrl: await readFileAsDataUrl(file),
        id: `asset-${file.name}-${file.lastModified}-${index}`,
        mimeType: file.type as MarketingImageAsset["mimeType"],
        name: file.name,
        sizeBytes: file.size,
      }))
    )
    setImageAssets(nextAssets)
    setDraft({ kind: "idle" })
    setPublish({ kind: "idle" })
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
      const payload: unknown = await response.json()
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
    await requestDraft({ suggestionMode: "request" })
  }

  async function handleSuggestionAccept() {
    if (draft.kind !== "ready" || draft.suggestion === null) {
      return
    }

    const nextIntent = draft.suggestion.revisedIntent || intent
    setIntent(nextIntent)
    await requestDraft({
      acceptedSuggestionId: draft.suggestion.id,
      nextIntent,
      suggestionMode: "accepted",
    })
  }

  function handleSuggestionSkip() {
    setActiveNavId("posting")
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
          onboardingExtraction={onboardingExtraction}
          onboardingProfileDraft={onboardingProfileDraft}
          onboardingSubmittedInput={onboardingSubmittedInput}
          onOnboardingCandidateSelect={setOnboardingProfileDraft}
          onPublish={handlePublish}
          onSelect={handleNavChange}
          onSuggestionAccept={handleSuggestionAccept}
          onSuggestionSkip={handleSuggestionSkip}
          publish={publish}
        />
      </MobileShell>
    </main>
  )
}
