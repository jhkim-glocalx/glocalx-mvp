import type { OnboardingConversationOutput } from "@/conversations/contracts"
import { extractLocalOnboardingSlots } from "@glocalx/domain/conversation/onboarding-slot-extraction"
import type {
  MissingBusinessField,
  OnboardingSlotTurnRequest,
} from "@glocalx/domain"
import type { IntegrationAdapters } from "@glocalx/integrations/contracts"
import { MalformedLlmResponseError } from "@glocalx/integrations/openai-conversation"

import { normalizeGuidedOutput } from "./guided-slot-output"

type GuidedSlotExtractionOptions = {
  readonly adapters: IntegrationAdapters
  readonly request: OnboardingSlotTurnRequest
  readonly requestedField: MissingBusinessField
}

function extractLocalSlots(
  request: OnboardingSlotTurnRequest,
  requestedField: MissingBusinessField
): OnboardingConversationOutput {
  return extractLocalOnboardingSlots({
    missingFields: request.candidate.missingFields,
    ownerMessage: request.ownerMessage,
    requestedField,
  })
}

function extractedValueForField(
  output: OnboardingConversationOutput,
  field: MissingBusinessField
): string | undefined {
  switch (field) {
    case "hours":
      return output.extractedFields.hours
    case "phone":
      return output.extractedFields.phone
    default:
      return assertNeverMissingField(field)
  }
}

function includesRequestedField(
  output: OnboardingConversationOutput,
  requestedField: MissingBusinessField
): boolean {
  return extractedValueForField(output, requestedField) !== undefined
}

function isRecoverableSlotLlmError(error: unknown): boolean {
  if (error instanceof MalformedLlmResponseError) {
    return error.contract === "onboarding_slot_extraction"
  }
  return (
    error instanceof TypeError ||
    error instanceof SyntaxError ||
    (error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError"))
  )
}

export async function extractGuidedSlotOutput({
  adapters,
  request,
  requestedField,
}: GuidedSlotExtractionOptions): Promise<OnboardingConversationOutput> {
  const localOutput = normalizeGuidedOutput(
    request,
    extractLocalSlots(request, requestedField),
    requestedField
  )
  if (includesRequestedField(localOutput, requestedField)) {
    return localOutput
  }

  try {
    const extracted = await adapters.onboardingConversation.extractStoreSlots({
      candidateName: request.candidate.name,
      currentState: request.currentState,
      missingFields: request.candidate.missingFields,
      ownerMessage: request.ownerMessage,
      requestedField,
    })
    if (extracted.kind === "blocked_by_credentials") {
      return localOutput
    }
    return normalizeGuidedOutput(request, extracted.value, requestedField)
  } catch (error) {
    if (isRecoverableSlotLlmError(error)) {
      return localOutput
    }
    throw error
  }
}

class UnexpectedMissingFieldError extends Error {
  readonly name = "UnexpectedMissingFieldError"
}

function assertNeverMissingField(value: never): never {
  throw new UnexpectedMissingFieldError(
    `Unexpected missing field: ${String(value)}`
  )
}
