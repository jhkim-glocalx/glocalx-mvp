import { useEffect, useRef, useState, type FormEvent } from "react"

import type { OnboardingInputMode } from "./onboarding-composer"
import type { StoreProfileField } from "./onboarding-components"
import {
  isStoreProfileConfirmationMessage,
  storeSearchAgainPrompt,
} from "./onboarding-copy"
import {
  dummyNaverPlaceUrl,
  dummyStoreName,
} from "./onboarding-dummy-inputs"
import {
  updateStoreProfileDraftField,
} from "./onboarding-draft-fields"
import type {
  ConfirmationState,
  ExtractionState,
  SetupState,
  StoreProfileDraft,
} from "./onboarding-model"
import {
  requestExtractionState,
  requestGbpSetupState,
  requestStoreProfileConfirmationState,
} from "./onboarding-requests"
import { selectedDraftFromExtraction } from "./selected-draft"
import { useOnboardingSlotTurn } from "./use-onboarding-slot-turn"

export function useOnboardingFlow() {
  const [extraction, setExtraction] = useState<ExtractionState>({
    kind: "idle",
  })
  const [confirmation, setConfirmation] = useState<ConfirmationState>({
    kind: "idle",
  })
  const [input, setInput] = useState("")
  const [inputMode, setInputMode] =
    useState<OnboardingInputMode>("naverLink")
  const inputRef = useRef<HTMLInputElement>(null)
  const screenRef = useRef<HTMLDivElement>(null)
  const [profileDraft, setProfileDraft] = useState<
    StoreProfileDraft | undefined
  >(undefined)
  const [setup, setSetup] = useState<SetupState>({ kind: "idle" })
  const [submittedInput, setSubmittedInput] = useState("")
  const slotTurn = useOnboardingSlotTurn({
    profileDraft,
    setConfirmation,
    setProfileDraft,
    setSetup,
  })

  useEffect(() => {
    const hasNewResult =
      extraction.kind !== "idle" ||
      slotTurn.state.kind !== "idle" ||
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
  }, [confirmation.kind, extraction.kind, setup.kind, slotTurn.state.kind])

  function focusStoreInput(): void {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }

  function slotCollectionActive(): boolean {
    return (
      profileDraft !== undefined &&
      profileDraft.source !== "MANUAL" &&
      profileDraft.missingFields.length > 0 &&
      extraction.kind !== "loading"
    )
  }

  function handleNaverLinkAttach(): void {
    setInputMode("naverLink")
    setInput(dummyNaverPlaceUrl)
    focusStoreInput()
  }

  function handleStoreNameSearch(): void {
    setInputMode("storeName")
    setInput(dummyStoreName)
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
    slotTurn.reset()
    focusStoreInput()
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
    slotTurn.reset()

    try {
      const nextExtraction = await requestExtractionState(nextInput)
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

  async function handleBottomSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextInput = input.trim()
    if (nextInput === "") {
      focusStoreInput()
      return
    }

    setInput("")
    if (
      profileDraft?.missingFields.length === 0 &&
      isStoreProfileConfirmationMessage(nextInput)
    ) {
      await handleConfirmation()
      return
    }

    if (slotCollectionActive()) {
      await slotTurn.submit(nextInput)
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
      setConfirmation(await requestStoreProfileConfirmationState(profileDraft))
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
      setSetup(await requestGbpSetupState())
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
    slotTurn.reset()
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

  return {
    actions: {
      changeDraftField: handleDraftFieldChange,
      checkSetup: handleSetup,
      confirm: handleConfirmation,
      inputChange: setInput,
      naverLinkAttach: handleNaverLinkAttach,
      searchAgain: handleCandidateSearchAgain,
      selectCandidate: handleCandidateSelect,
      storeNameSearch: handleStoreNameSearch,
      submit: handleBottomSubmit,
    },
    refs: { inputRef, screenRef },
    state: {
      confirmation,
      extraction,
      input,
      inputMode,
      profileDraft,
      setup,
      slotCollectionActive: slotCollectionActive(),
      slotMessages: slotTurn.messages,
      slotState: slotTurn.state,
      submittedInput,
    },
  }
}
