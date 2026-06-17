import type {
  ConversationConfidence,
  OnboardingConversationOutput,
} from "@/conversations/contracts"
import type {
  MissingBusinessField,
  OnboardingSlotTurnRequest,
} from "@/domain/schemas"

export function requestedFieldForTurn(
  request: OnboardingSlotTurnRequest
): MissingBusinessField {
  // Prefer the requested field only while it is still missing, otherwise continue the stored queue.
  const requestedMissingField = request.candidate.missingFields.find(
    (field) => field === request.requestedField
  )
  return (
    requestedMissingField ??
    request.candidate.missingFields[0] ??
    request.requestedField
  )
}

export function normalizeGuidedOutput(
  request: OnboardingSlotTurnRequest,
  output: OnboardingConversationOutput,
  requestedField: MissingBusinessField
): OnboardingConversationOutput {
  const value = extractedValueForField(output, requestedField)
  const confidence = confidenceForField(output, requestedField)
  // Low-confidence extraction asks again instead of mutating the draft with uncertain owner input.
  const accepted =
    value !== undefined && confidence !== undefined && confidence !== "low"
  const missingFields = remainingMissingFields(
    request,
    requestedField,
    accepted
  )
  const nextField = missingFields[0]
  const nextState =
    nextField === undefined ? "profile_summary" : "slot_clarification"
  const responseConfidence = accepted ? confidence : "low"

  return {
    assistantMessage:
      nextField === undefined
        ? formReviewPromptForField(requestedField)
        : accepted
          ? promptForMissingField(nextField)
          : retryPromptForField(requestedField),
    confidence: responseConfidence,
    extractedFields:
      accepted && value !== undefined
        ? extractedFieldsForField(requestedField, value)
        : {},
    fieldConfidence: accepted
      ? fieldConfidenceForField(requestedField, responseConfidence)
      : {},
    missingFields: [...missingFields],
    needsOwnerConfirmation: nextState === "profile_summary",
    nextState,
  }
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

function confidenceForField(
  output: OnboardingConversationOutput,
  field: MissingBusinessField
): ConversationConfidence | undefined {
  switch (field) {
    case "hours":
      return output.fieldConfidence.hours
    case "phone":
      return output.fieldConfidence.phone
    default:
      return assertNeverMissingField(field)
  }
}

function extractedFieldsForField(
  field: MissingBusinessField,
  value: string
): OnboardingConversationOutput["extractedFields"] {
  switch (field) {
    case "hours":
      return { hours: value }
    case "phone":
      return { phone: value }
    default:
      return assertNeverMissingField(field)
  }
}

function fieldConfidenceForField(
  field: MissingBusinessField,
  confidence: ConversationConfidence
): OnboardingConversationOutput["fieldConfidence"] {
  switch (field) {
    case "hours":
      return { hours: confidence }
    case "phone":
      return { phone: confidence }
    default:
      return assertNeverMissingField(field)
  }
}

function promptForMissingField(field: MissingBusinessField): string {
  switch (field) {
    case "phone":
      return "전화번호를 메시지로 알려주세요. 예: 010-1234-5678"
    case "hours":
      return "영업시간을 메시지로 알려주세요. 예: 평일 오후 6시부터 10시까지"
    default:
      return assertNeverMissingField(field)
  }
}

function retryPromptForField(field: MissingBusinessField): string {
  switch (field) {
    case "phone":
      return "전화번호를 확인하지 못했어요. 전화번호만 다시 입력해주세요. 예: 010-1234-5678"
    case "hours":
      return "영업시간을 확인하지 못했어요. 영업시간만 다시 입력해주세요. 예: 평일 오후 6시부터 10시까지"
    default:
      return assertNeverMissingField(field)
  }
}

function formReviewPromptForField(field: MissingBusinessField): string {
  switch (field) {
    case "phone":
      return "전화번호를 확인했어요. 정보가 맞으면 ‘예’ 또는 ‘맞아요’라고 답해주세요."
    case "hours":
      return "영업시간까지 확인했어요. 정보가 맞으면 ‘예’ 또는 ‘맞아요’라고 답해주세요."
    default:
      return assertNeverMissingField(field)
  }
}

function remainingMissingFields(
  request: OnboardingSlotTurnRequest,
  requestedField: MissingBusinessField,
  accepted: boolean
): readonly MissingBusinessField[] {
  if (!accepted) {
    // Rejections preserve the missing-field list so the next turn retries the same slot.
    return request.candidate.missingFields
  }
  return request.candidate.missingFields.filter(
    (field) => field !== requestedField
  )
}

class UnexpectedMissingFieldError extends Error {
  readonly name = "UnexpectedMissingFieldError"
}

function assertNeverMissingField(value: never): never {
  throw new UnexpectedMissingFieldError(
    `Unexpected missing field: ${String(value)}`
  )
}
