import { randomUUID } from "node:crypto"

import type { ConversationSlotInput } from "@/conversations/repository"
import type {
  AdapterBusinessProfileCandidate,
  MissingBusinessField,
  OnboardingSlotTurnRequest,
} from "@/domain/schemas"
import type { IntegrationAdapters } from "@/integrations/contracts"
import type { ConversationStore } from "@/server/repositories/conversation-store"

import type { OnboardingConversationOutput } from "@/conversations/contracts"
import { requestedFieldForTurn } from "./guided-slot-output"
import { extractGuidedSlotOutput } from "./slot-extraction"

type OnboardingSlotTurnOptions = {
  readonly adapters: IntegrationAdapters
  readonly conversationStore: ConversationStore
  readonly request: OnboardingSlotTurnRequest
  readonly storeId: string
}

type OnboardingSlotTurnResponse = {
  readonly assistantMessage: string
  readonly confidence: OnboardingConversationOutput["confidence"]
  readonly draft: AdapterBusinessProfileCandidate
  readonly missingFields: readonly MissingBusinessField[]
  readonly needsOwnerConfirmation: boolean
  readonly nextState: OnboardingConversationOutput["nextState"]
  readonly sessionId: string
  readonly status: "ONBOARDING_CONVERSATION_TURN"
}

function confidenceScore(
  confidence: OnboardingConversationOutput["confidence"] | undefined
): number {
  switch (confidence) {
    case "high":
      return 0.95
    case "medium":
      return 0.72
    case "low":
      return 0.4
    case undefined:
      return 0.4
    default:
      return assertNever(confidence)
  }
}

function updateCandidate(
  candidate: AdapterBusinessProfileCandidate,
  output: OnboardingConversationOutput
): AdapterBusinessProfileCandidate {
  return {
    ...candidate,
    ...(output.extractedFields.hours === undefined
      ? {}
      : { hours: output.extractedFields.hours }),
    ...(output.extractedFields.phone === undefined
      ? {}
      : { phone: output.extractedFields.phone }),
    missingFields: [...output.missingFields],
  }
}

function slotInputs(
  output: OnboardingConversationOutput
): readonly ConversationSlotInput[] {
  // Persist only accepted owner-provided slots so replayed turns rebuild the same public response.
  return [
    ...(output.extractedFields.hours === undefined
      ? []
      : [
          {
            confidence: confidenceScore(output.fieldConfidence.hours),
            key: "hours",
            source: "owner_message",
            value: output.extractedFields.hours,
          },
        ]),
    ...(output.extractedFields.phone === undefined
      ? []
      : [
          {
            confidence: confidenceScore(output.fieldConfidence.phone),
            key: "phone",
            source: "owner_message",
            value: output.extractedFields.phone,
          },
        ]),
  ]
}

async function readOrCreateSession(
  conversationStore: ConversationStore,
  request: OnboardingSlotTurnRequest,
  storeId: string,
  now: Date
) {
  if (request.sessionId !== undefined) {
    // Existing session ids must belong to this store; missing sessions become a typed not-found response.
    return conversationStore.resumeSession({
      kind: "onboarding",
      sessionId: request.sessionId,
      storeId,
    })
  }

  return conversationStore.createSession({
    id: randomUUID(),
    kind: "onboarding",
    now,
    state: request.currentState,
    storeId,
  })
}

export async function processOnboardingSlotTurn(
  options: OnboardingSlotTurnOptions
): Promise<OnboardingSlotTurnResponse | Readonly<Record<string, unknown>>> {
  const now = options.adapters.clock.now()
  const session = await readOrCreateSession(
    options.conversationStore,
    options.request,
    options.storeId,
    now
  )

  if (session === undefined) {
    return {
      status: "CONVERSATION_NOT_FOUND",
      message: "대화 세션을 찾지 못했습니다.",
    }
  }

  const replay = await options.conversationStore.readReplay({
    clientEventId: options.request.clientEventId,
    sessionId: session.id,
    storeId: options.storeId,
  })
  if (replay !== undefined) {
    // clientEventId is the idempotency key for double submits and browser retries.
    return replay
  }

  const requestedField = requestedFieldForTurn(options.request)
  const conversationOutput = await extractGuidedSlotOutput({
    adapters: options.adapters,
    request: options.request,
    requestedField,
  })

  const draft = updateCandidate(options.request.candidate, conversationOutput)
  const response: OnboardingSlotTurnResponse = {
    assistantMessage: conversationOutput.assistantMessage,
    confidence: conversationOutput.confidence,
    draft,
    missingFields: conversationOutput.missingFields,
    needsOwnerConfirmation: conversationOutput.needsOwnerConfirmation,
    nextState: conversationOutput.nextState,
    sessionId: session.id,
    status: "ONBOARDING_CONVERSATION_TURN",
  }

  const turn = await options.conversationStore.recordTurn({
    assistantMessage: response.assistantMessage,
    clientEventId: options.request.clientEventId,
    eventId: randomUUID(),
    kind: "onboarding",
    nextState: response.nextState,
    now,
    ownerMessage: options.request.ownerMessage,
    publicResponse: response,
    sessionId: session.id,
    slots: slotInputs(conversationOutput),
    storeId: options.storeId,
  })

  return turn.response
}

class UnexpectedConfidenceError extends Error {
  readonly name = "UnexpectedConfidenceError"
}

function assertNever(value: never): never {
  throw new UnexpectedConfidenceError(
    `Unexpected conversation confidence: ${String(value)}`
  )
}
