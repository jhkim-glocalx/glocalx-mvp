"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"

import { MobileShell } from "@/app/_components/mobile-shell"

import type { StoreProfileField } from "./onboarding-components"
import { toConversationCandidate } from "./onboarding-conversation-candidate"
import { storeSearchAgainPrompt } from "./onboarding-copy"
import {
  firstMissingStoreProfileField,
  updateStoreProfileDraftField,
  type MissingStoreProfileField,
} from "./onboarding-draft-fields"
import {
  toConfirmationState,
  toConfirmedStoreProfilePayload,
  toExtractionState,
  toOnboardingSlotTurnState,
  toSetupState,
  type ConfirmationState,
  type ExtractionState,
  type OnboardingChatTurn,
  type OnboardingSlotTurnState,
  type SetupState,
  type StoreProfileDraft,
} from "./onboarding-model"
import {
  GbpHandoffPanel,
  SetupPanel,
  StoreProfileFormPanel,
} from "./onboarding-gbp-panels"
import {
  ExtractionPanel,
  OnboardingIntro,
  OnboardingTopBar,
  SlotCollectionPanel,
} from "./onboarding-panels"
import { selectedDraftFromExtraction } from "./selected-draft"

function slotPlaceholder(
  requestedField: MissingStoreProfileField | undefined
): string {
  switch (requestedField) {
    case "phone":
      return "전화번호를 입력해주세요"
    case "hours":
      return "예: 평일 오후 6시부터 10시까지"
    case undefined:
      return "매장 정보를 입력해주세요"
  }
}

export function OnboardingFlow() {
  const [extraction, setExtraction] = useState<ExtractionState>({
    kind: "idle",
  })
  const [confirmation, setConfirmation] = useState<ConfirmationState>({
    kind: "idle",
  })
  const [input, setInput] = useState("https://naver.me/mybrunchcafe")
  const [inputMode, setInputMode] = useState<"naverLink" | "storeName">(
    "naverLink"
  )
  const inputRef = useRef<HTMLInputElement>(null)
  const screenRef = useRef<HTMLDivElement>(null)
  const [profileDraft, setProfileDraft] = useState<
    StoreProfileDraft | undefined
  >(undefined)
  const [setup, setSetup] = useState<SetupState>({ kind: "idle" })
  const [submittedInput, setSubmittedInput] = useState("")
  const [slotMessages, setSlotMessages] = useState<
    readonly OnboardingChatTurn[]
  >([])
  const [slotSessionId, setSlotSessionId] = useState<string>()
  const [slotState, setSlotState] = useState<OnboardingSlotTurnState>({
    kind: "idle",
  })

  useEffect(() => {
    const hasNewResult =
      extraction.kind !== "idle" ||
      slotState.kind !== "idle" ||
      confirmation.kind !== "idle" ||
      setup.kind !== "idle"

    if (!hasNewResult) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      const screen = screenRef.current
      screen?.scrollTo({ behavior: "smooth", top: screen.scrollHeight })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [confirmation.kind, extraction.kind, setup.kind, slotState.kind])

  function focusStoreInput(): void {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }

  function handleNaverLinkAttach(): void {
    setInputMode("naverLink")
    setInput((currentInput) =>
      currentInput.trim() === ""
        ? "https://naver.me/mybrunchcafe"
        : currentInput
    )
    focusStoreInput()
  }

  function handleStoreNameSearch(): void {
    setInputMode("storeName")
    setInput((currentInput) =>
      currentInput.trim() === "https://naver.me/mybrunchcafe"
        ? ""
        : currentInput
    )
    focusStoreInput()
  }

  function handleCandidateSearchAgain(): void {
    setInputMode("storeName")
    setInput("")
    setProfileDraft(undefined)
    setConfirmation({ kind: "idle" })
    setSetup({ kind: "idle" })
    setExtraction({
      kind: "searchQueryRequired",
      message: storeSearchAgainPrompt,
    })
    resetSlotConversation()
    focusStoreInput()
  }

  function resetSlotConversation(): void {
    setSlotMessages([])
    setSlotSessionId(undefined)
    setSlotState({ kind: "idle" })
  }

  function isSlotCollectionActive(): boolean {
    return (
      profileDraft !== undefined &&
      profileDraft.source !== "MANUAL" &&
      profileDraft.missingFields.length > 0 &&
      extraction.kind !== "loading"
    )
  }

  async function handleExtraction(nextInput: string) {
    if (nextInput === "") {
      focusStoreInput()
      return
    }

    setExtraction({ kind: "loading" })
    setConfirmation({ kind: "idle" })
    setSetup({ kind: "idle" })
    setProfileDraft(undefined)
    setSubmittedInput(nextInput)
    resetSlotConversation()

    try {
      const response = await fetch("/api/onboarding/extractions", {
        body: JSON.stringify({ input: nextInput }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload: unknown = await response.json()
      const nextExtraction = toExtractionState(payload, nextInput)
      setExtraction(nextExtraction)
      setProfileDraft(selectedDraftFromExtraction(nextExtraction))
    } catch (error) {
      setExtraction({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "가게 정보 조회에 실패했습니다.",
      })
    }
  }

  async function handleSlotTurn(ownerMessage: string): Promise<void> {
    if (profileDraft === undefined) {
      return
    }
    const requestedField = firstMissingStoreProfileField(profileDraft)
    if (requestedField === undefined) {
      return
    }

    const clientEventId = window.crypto.randomUUID()
    const ownerTurn: OnboardingChatTurn = {
      id: `owner-${clientEventId}`,
      message: ownerMessage,
      speaker: "owner",
    }
    setSlotMessages((currentTurns) => [...currentTurns, ownerTurn])
    setSlotState({ kind: "loading" })
    setConfirmation({ kind: "idle" })
    setSetup({ kind: "idle" })

    try {
      const response = await fetch("/api/onboarding/conversation/slots", {
        body: JSON.stringify({
          candidate: toConversationCandidate(profileDraft),
          clientEventId,
          currentState:
            profileDraft.source === "MANUAL"
              ? "manual_collection"
              : slotSessionId === undefined
                ? "slot_elicitation"
                : "slot_clarification",
          ...(slotSessionId === undefined ? {} : { sessionId: slotSessionId }),
          ownerMessage,
          requestedField,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload: unknown = await response.json()
      const nextState = toOnboardingSlotTurnState(payload)
      setSlotState(nextState)
      if (nextState.kind !== "ready") {
        return
      }

      setSlotSessionId(nextState.sessionId)
      setProfileDraft(nextState.draft)
      setSlotMessages((currentTurns) => [
        ...currentTurns,
        {
          id: `assistant-${clientEventId}`,
          message: nextState.assistantMessage,
          speaker: "assistant",
        },
      ])
      setSlotState({ kind: "idle" })
    } catch (error) {
      setSlotState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "답변에서 매장 정보를 확인하지 못했습니다.",
      })
    }
  }

  async function handleBottomSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextInput = input.trim()
    if (nextInput === "") {
      focusStoreInput()
      return
    }

    setInput("")
    if (isSlotCollectionActive()) {
      await handleSlotTurn(nextInput)
      return
    }

    await handleExtraction(nextInput)
  }

  async function handleConfirmation() {
    if (profileDraft === undefined) {
      return
    }

    setConfirmation({ kind: "loading" })
    setSetup({ kind: "idle" })
    try {
      const response = await fetch("/api/onboarding/store-profile/confirm", {
        body: JSON.stringify(toConfirmedStoreProfilePayload(profileDraft)),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload: unknown = await response.json()
      setConfirmation(toConfirmationState(payload))
    } catch (error) {
      setConfirmation({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "매장 정보 확인에 실패했습니다.",
      })
    }
  }

  async function handleSetup() {
    setSetup({ kind: "loading" })

    try {
      const response = await fetch("/api/gbp/setup", {
        body: JSON.stringify({ mode: "stub" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload: unknown = await response.json()
      setSetup(toSetupState(payload))
    } catch (error) {
      setSetup({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "GBP 세팅 확인에 실패했습니다.",
      })
    }
  }

  function handleCandidateSelect(candidate: StoreProfileDraft): void {
    setProfileDraft(candidate)
    setConfirmation({ kind: "idle" })
    setSetup({ kind: "idle" })
    resetSlotConversation()
  }

  function handleDraftFieldChange(
    field: StoreProfileField,
    value: string
  ): void {
    setProfileDraft((currentDraft) =>
      currentDraft === undefined
        ? currentDraft
        : updateStoreProfileDraftField(currentDraft, field, value)
    )
    setConfirmation({ kind: "idle" })
    setSetup({ kind: "idle" })
  }

  return (
    <main className="gx-route-page">
      <MobileShell
        bottomBar={
          <form
            aria-label={
              isSlotCollectionActive() ? "매장 정보 답변" : "네이버 정보 제출"
            }
            className="gx-inputbar"
            onSubmit={handleBottomSubmit}
          >
            <button
              aria-label="네이버 링크 첨부"
              className="gx-input-plus"
              onClick={handleNaverLinkAttach}
              type="button"
            >
              +
            </button>
            <label className="sr-only" htmlFor="naver-store-input">
              네이버 정보
            </label>
            <input
              className="gx-composer-input"
              id="naver-store-input"
              onChange={(event) => setInput(event.currentTarget.value)}
              placeholder={
                isSlotCollectionActive()
                  ? slotPlaceholder(
                      profileDraft === undefined
                        ? undefined
                        : firstMissingStoreProfileField(profileDraft)
                    )
                  : inputMode === "naverLink"
                    ? "네이버 플레이스 링크 붙여넣기"
                    : "상호명을 입력하세요"
              }
              ref={inputRef}
              type="text"
              value={input}
            />
            <button
              aria-label="네이버 정보 제출"
              className="gx-input-send"
              disabled={
                extraction.kind === "loading" ||
                slotState.kind === "loading" ||
                input.trim() === ""
              }
              type="submit"
            >
              <span aria-hidden="true">➤</span>
            </button>
          </form>
        }
        screenRef={screenRef}
        topBar={<OnboardingTopBar />}
      >
        <OnboardingIntro
          onNaverLinkAttach={handleNaverLinkAttach}
          onStoreNameSearch={handleStoreNameSearch}
        />

        <ExtractionPanel
          extraction={extraction}
          onCandidateSearchAgain={handleCandidateSearchAgain}
          onCandidateSelect={handleCandidateSelect}
          profileDraft={profileDraft}
          submittedInput={submittedInput}
        />
        <StoreProfileFormPanel
          confirmation={confirmation}
          onConfirm={handleConfirmation}
          onFieldChange={handleDraftFieldChange}
          profileDraft={profileDraft}
        />
        <SlotCollectionPanel
          profileDraft={profileDraft}
          slotMessages={slotMessages}
          slotState={slotState}
        />
        <GbpHandoffPanel
          confirmation={confirmation}
          onSetup={handleSetup}
          setup={setup}
        />
        <SetupPanel setup={setup} />
      </MobileShell>
    </main>
  )
}
