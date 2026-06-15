"use client"

import { useState } from "react"

import type { StoreProfileField } from "@/app/onboarding/onboarding-components"
import {
  toConfirmationState,
  toConfirmedStoreProfilePayload,
  toExtractionState,
  toSetupState,
  type ConfirmationState,
  type ExtractionState,
  type SetupState,
  type StoreProfileDraft,
} from "@/app/onboarding/onboarding-model"

function selectedDraftFromExtraction(
  extraction: ExtractionState
): StoreProfileDraft | undefined {
  switch (extraction.kind) {
    case "candidates":
      return extraction.requiresSelection ? undefined : extraction.candidates[0]
    case "manual":
      return extraction.draft
    case "error":
    case "idle":
    case "loading":
    case "searchQueryRequired":
      return undefined
  }
}

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

  async function search(input: string): Promise<void> {
    setExtraction({ kind: "loading" })
    setProfileDraft(undefined)
    setSubmittedInput(input)
    setConfirmation({ kind: "idle" })
    setSetup({ kind: "idle" })

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
        message:
          error instanceof Error
            ? error.message
            : "가게 정보 조회에 실패했습니다.",
      })
    }
  }

  function selectCandidate(candidate: StoreProfileDraft): void {
    setProfileDraft(candidate)
    setConfirmation({ kind: "idle" })
    setSetup({ kind: "idle" })
  }

  function changeDraftField(field: StoreProfileField, value: string): void {
    setProfileDraft((currentDraft) =>
      currentDraft === undefined
        ? currentDraft
        : {
            ...currentDraft,
            [field]: value,
          }
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

  async function checkSetup(): Promise<void> {
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

  return {
    changeDraftField,
    checkSetup,
    confirm,
    confirmation,
    extraction,
    profileDraft,
    search,
    selectCandidate,
    setup,
    submittedInput,
  }
}
