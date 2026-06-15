import { randomUUID } from "node:crypto"

import {
  createConversationSession,
  readConversationReplay,
  recordConversationTurn,
  resumeConversationSession,
  type ConversationSlotInput,
} from "@/conversations/repository"
import type {
  AdapterBusinessProfileCandidate,
  MissingBusinessField,
  OnboardingSlotTurnRequest,
} from "@/domain/schemas"
import type { IntegrationAdapters } from "@/integrations/contracts"
import type { SqliteDatabase } from "@/server/db/sqlite"

import type { OnboardingConversationOutput } from "@/conversations/contracts"

type OnboardingSlotTurnOptions = {
  readonly adapters: IntegrationAdapters
  readonly database: SqliteDatabase
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

function readOrCreateSession(
  database: SqliteDatabase,
  request: OnboardingSlotTurnRequest,
  storeId: string,
  now: Date
) {
  if (request.sessionId !== undefined) {
    return resumeConversationSession(database, {
      kind: "onboarding",
      sessionId: request.sessionId,
      storeId,
    })
  }

  return createConversationSession(database, {
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
  const session = readOrCreateSession(
    options.database,
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

  const replay = readConversationReplay(options.database, {
    clientEventId: options.request.clientEventId,
    sessionId: session.id,
    storeId: options.storeId,
  })
  if (replay !== undefined) {
    return replay
  }

  const extracted = await options.adapters.onboardingConversation.extractStoreSlots(
    {
      candidateName: options.request.candidate.name,
      currentState: options.request.currentState,
      missingFields: options.request.candidate.missingFields,
      ownerMessage: options.request.ownerMessage,
    }
  )

  if (extracted.kind === "blocked_by_credentials") {
    return {
      status: "LLM_CREDENTIALS_REQUIRED",
      assistantMessage:
        "AI 정보 확인 설정이 필요합니다. 잠시 후 직원이 이어서 확인할게요.",
      missingEnvVars: extracted.missingEnvVars,
      sessionId: session.id,
    }
  }

  const draft = updateCandidate(options.request.candidate, extracted.value)
  const response: OnboardingSlotTurnResponse = {
    assistantMessage: extracted.value.assistantMessage,
    confidence: extracted.value.confidence,
    draft,
    missingFields: extracted.value.missingFields,
    needsOwnerConfirmation: extracted.value.needsOwnerConfirmation,
    nextState: extracted.value.nextState,
    sessionId: session.id,
    status: "ONBOARDING_CONVERSATION_TURN",
  }

  const turn = recordConversationTurn(options.database, {
    assistantMessage: response.assistantMessage,
    clientEventId: options.request.clientEventId,
    eventId: randomUUID(),
    kind: "onboarding",
    nextState: response.nextState,
    now,
    ownerMessage: options.request.ownerMessage,
    publicResponse: response,
    sessionId: session.id,
    slots: slotInputs(extracted.value),
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
