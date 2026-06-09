"use client"

import { useState, useSyncExternalStore, type FormEvent } from "react"

import { MobileShell } from "@/app/_components/mobile-shell"

import type { StoreProfileField } from "./onboarding-components"
import {
  toConfirmationState,
  toConfirmedStoreProfilePayload,
  toExtractionState,
  toSetupState,
  type ConfirmationState,
  type ExtractionState,
  type SetupState,
  type StoreProfileDraft,
} from "./onboarding-model"
import {
  ConfirmationPanel,
  ExtractionPanel,
  OnboardingIntro,
  OnboardingTopBar,
  SetupPanel,
} from "./onboarding-panels"

function assertNever(value: never): never {
  throw new Error(`Unexpected onboarding state: ${JSON.stringify(value)}`)
}

function subscribeToHydrationStore(): () => void {
  return () => undefined
}

function getHydratedSnapshot(): boolean {
  return true
}

function getServerHydratedSnapshot(): boolean {
  return false
}

function selectedDraftFromExtraction(
  extraction: ExtractionState
): StoreProfileDraft | undefined {
  switch (extraction.kind) {
    case "idle":
    case "loading":
    case "searchQueryRequired":
    case "error":
      return undefined
    case "manual":
      return extraction.draft
    case "candidates":
      return extraction.candidates[0]
    default:
      return assertNever(extraction)
  }
}

export function OnboardingFlow() {
  const isHydrated = useSyncExternalStore(
    subscribeToHydrationStore,
    getHydratedSnapshot,
    getServerHydratedSnapshot
  )
  const [extraction, setExtraction] = useState<ExtractionState>({
    kind: "idle",
  })
  const [confirmation, setConfirmation] = useState<ConfirmationState>({
    kind: "idle",
  })
  const [input, setInput] = useState("https://naver.me/mybrunchcafe")
  const [profileDraft, setProfileDraft] = useState<
    StoreProfileDraft | undefined
  >(undefined)
  const [setup, setSetup] = useState<SetupState>({ kind: "idle" })
  const [submittedInput, setSubmittedInput] = useState("")

  async function handleExtraction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setExtraction({ kind: "loading" })
    setConfirmation({ kind: "idle" })
    setSetup({ kind: "idle" })
    setProfileDraft(undefined)
    setSubmittedInput(input)

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

  function handleDraftFieldChange(
    field: StoreProfileField,
    value: string
  ): void {
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

  function handleCandidateSelect(candidate: StoreProfileDraft): void {
    setProfileDraft(candidate)
    setConfirmation({ kind: "idle" })
    setSetup({ kind: "idle" })
  }

  return (
    <main className="gx-route-page">
      <MobileShell
        bottomBar={
          <form
            aria-label="네이버 정보 제출"
            className="gx-inputbar"
            onSubmit={handleExtraction}
          >
            <button aria-label="첨부 추가" className="gx-input-plus" type="button">
              +
            </button>
            <label className="sr-only" htmlFor="naver-store-input">
              네이버 정보
            </label>
            <input
              className="gx-composer-input"
              id="naver-store-input"
              onChange={(event) => setInput(event.currentTarget.value)}
              placeholder="메시지 입력…"
              type="text"
              value={input}
            />
            <button
              aria-label="네이버 정보 제출"
              className="gx-input-send"
              disabled={!isHydrated || extraction.kind === "loading"}
              type="submit"
            >
              <span aria-hidden="true">➤</span>
            </button>
          </form>
        }
        topBar={<OnboardingTopBar />}
      >
        <OnboardingIntro />

        <ExtractionPanel
          extraction={extraction}
          onCandidateSelect={handleCandidateSelect}
          profileDraft={profileDraft}
          submittedInput={submittedInput}
        />
        <ConfirmationPanel
          confirmation={confirmation}
          onConfirm={handleConfirmation}
          onFieldChange={handleDraftFieldChange}
          onSetup={handleSetup}
          profileDraft={profileDraft}
          setup={setup}
        />
        <SetupPanel setup={setup} />
      </MobileShell>
    </main>
  )
}
