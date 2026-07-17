"use client"

import { useState } from "react"

import type { StoreProfileField } from "@/app/onboarding/onboarding-components"
import { toConversationCandidate } from "@/app/onboarding/onboarding-conversation-candidate"
import {
  firstMissingStoreProfileField,
  updateStoreProfileDraftField,
} from "@/app/onboarding/onboarding-draft-fields"
import {
  isStoreProfileConfirmationMessage,
  storeSearchAgainPrompt,
} from "@/app/onboarding/onboarding-copy"
import {
  toExtractionState,
  toOnboardingSlotTurnState,
  type ConfirmationState,
  type ExtractionState,
  type OnboardingChatTurn,
  type OnboardingSlotTurnState,
  type SetupState,
  type StoreProfileDraft,
} from "@/app/onboarding/onboarding-model"
import { selectedDraftFromExtraction } from "@/app/onboarding/selected-draft"

import {
  gbpSetupFailed,
  profileConfirmFailed,
  slotReplyFailed,
  storeSearchFailed,
} from "./app-error-message"
import {
  requestGbpSetupState,
  requestStoreProfileConfirmation,
} from "./app-onboarding-requests"
import { readAppJsonResponse } from "./app-workspace-response"

export function useAppOnboarding() {
  const [extraction, setExtraction] = useState<ExtractionState>({
    kind: "idle",
  })
  const [profileDraft, setProfileDraft] = useState<
    StoreProfileDraft | undefined
  >(undefined)
  const [submittedInput, setSubmittedInput] = useState("")
  const [confirmation, setConfirmation] = useState<ConfirmationState>({
    kind: "idle",
  })
  const [setup, setSetup] = useState<SetupState>({ kind: "idle" })
  const [slotMessages, setSlotMessages] = useState<
    readonly OnboardingChatTurn[]
  >([])
  const [slotSessionId, setSlotSessionId] = useState<string>()
  const [slotState, setSlotState] = useState<OnboardingSlotTurnState>({
    kind: "idle",
  })

  function resetSlotConversation(): void {
    // The app shell reuses onboarding state, so slot history is scoped to one selected draft.
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

  async function search(input: string): Promise<void> {
    setExtraction({ kind: "loading" })
    setProfileDraft(undefined)
    setSubmittedInput(input)
    setConfirmation({ kind: "idle" })
    setSetup({ kind: "idle" })
    // New searches clear derived onboarding state before parsing the replacement extraction.
    resetSlotConversation()

    try {
      const response = await fetch("/api/onboarding/extractions", {
        body: JSON.stringify({ input }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload: unknown = await response.json()
      const nextExtraction = toExtractionState(payload, input)
      setExtraction(nextExtraction)
      setProfileDraft(selectedDraftFromExtraction(nextExtraction))
    } catch (error) {
      setExtraction({
        kind: "error",
        message: error instanceof Error ? error.message : storeSearchFailed,
      })
    }
  }

  async function fillMissingFields(ownerMessage: string): Promise<void> {
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
            slotSessionId === undefined
              ? "slot_elicitation"
              : "slot_clarification",
          ...(slotSessionId === undefined ? {} : { sessionId: slotSessionId }),
          ownerMessage,
          requestedField,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload = await readAppJsonResponse(
        response,
        "답변에서 매장 정보를 확인하지 못했습니다."
      )
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
        message: error instanceof Error ? error.message : slotReplyFailed,
      })
    }
  }

  async function submitComposerMessage(message: string): Promise<void> {
    if (
      profileDraft?.missingFields.length === 0 &&
      isStoreProfileConfirmationMessage(message)
    ) {
      await confirm()
      return
    }

    // The shared composer routes to slot fill only while the active draft still has missing fields.
    if (isSlotCollectionActive()) {
      await fillMissingFields(message)
      return
    }

    await search(message)
  }

  function selectCandidate(candidate: StoreProfileDraft): void {
    setProfileDraft(candidate)
    setConfirmation({ kind: "idle" })
    setSetup({ kind: "idle" })
    resetSlotConversation()
  }

  function searchAgain(): void {
    setExtraction({
      kind: "searchQueryRequired",
      message: storeSearchAgainPrompt,
    })
    setProfileDraft(undefined)
    setConfirmation({ kind: "idle" })
    setSetup({ kind: "idle" })
    resetSlotConversation()
  }

  function changeDraftField(field: StoreProfileField, value: string): void {
    setProfileDraft((currentDraft) =>
      currentDraft === undefined
        ? currentDraft
        : updateStoreProfileDraftField(currentDraft, field, value)
    )
    setConfirmation({ kind: "idle" })
    setSetup({ kind: "idle" })
  }

  async function confirm(): Promise<void> {
    if (profileDraft === undefined) {
      return
    }

    setConfirmation({ kind: "loading" })
    setSetup({ kind: "idle" })

    try {
      setConfirmation(await requestStoreProfileConfirmation(profileDraft))
    } catch (error) {
      setConfirmation({
        kind: "error",
        message: error instanceof Error ? error.message : profileConfirmFailed,
      })
    }
  }

  async function checkSetup(): Promise<void> {
    setSetup({ kind: "loading" })

    try {
      setSetup(await requestGbpSetupState())
    } catch (error) {
      setSetup({
        kind: "error",
        message: error instanceof Error ? error.message : gbpSetupFailed,
      })
    }
  }

  return {
    changeDraftField,
    checkSetup,
    confirm,
    confirmation,
    extraction,
    profileDraft,
    search,
    searchAgain,
    selectCandidate,
    setup,
    slotMessages,
    slotState,
    submittedInput,
    submitComposerMessage,
  }
}
