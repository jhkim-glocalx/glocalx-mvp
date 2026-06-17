import { useState, type Dispatch, type SetStateAction } from "react"

import { firstMissingStoreProfileField } from "./onboarding-draft-fields"
import type {
  ConfirmationState,
  OnboardingChatTurn,
  OnboardingSlotTurnState,
  SetupState,
  StoreProfileDraft,
} from "./onboarding-model"
import { requestOnboardingSlotTurnState } from "./onboarding-requests"

export function useOnboardingSlotTurn({
  profileDraft,
  setConfirmation,
  setProfileDraft,
  setSetup,
}: {
  readonly profileDraft: StoreProfileDraft | undefined
  readonly setConfirmation: Dispatch<SetStateAction<ConfirmationState>>
  readonly setProfileDraft: Dispatch<
    SetStateAction<StoreProfileDraft | undefined>
  >
  readonly setSetup: Dispatch<SetStateAction<SetupState>>
}) {
  const [messages, setMessages] = useState<readonly OnboardingChatTurn[]>([])
  const [sessionId, setSessionId] = useState<string>()
  const [state, setState] = useState<OnboardingSlotTurnState>({
    kind: "idle",
  })

  function reset(): void {
    setMessages([])
    setSessionId(undefined)
    setState({ kind: "idle" })
  }

  async function submit(ownerMessage: string): Promise<void> {
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
    setMessages((currentTurns) => [...currentTurns, ownerTurn])
    setState({ kind: "loading" })
    setConfirmation({ kind: "idle" })
    setSetup({ kind: "idle" })

    try {
      const nextState = await requestOnboardingSlotTurnState({
        clientEventId,
        ownerMessage,
        profileDraft,
        requestedField,
        slotSessionId: sessionId,
      })
      setState(nextState)
      if (nextState.kind !== "ready") {
        return
      }

      setSessionId(nextState.sessionId)
      setProfileDraft(nextState.draft)
      setMessages((currentTurns) => [
        ...currentTurns,
        {
          id: `assistant-${clientEventId}`,
          message: nextState.assistantMessage,
          speaker: "assistant",
        },
      ])
      setState({ kind: "idle" })
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "답변에서 매장 정보를 확인하지 못했습니다.",
      })
    }
  }

  return { messages, reset, state, submit }
}
