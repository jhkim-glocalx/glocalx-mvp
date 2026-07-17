import type {
  ConversationSlotInput,
  PublicConversationResponse,
} from "./repository-types"

const phoneLikePattern = /\+?\d[\d -]{5,}\d/g

export function redactSupportText(value: string): string {
  return value.replace(phoneLikePattern, "[REDACTED_PHONE]")
}

export function redactedTurnPayload(options: {
  readonly assistantMessage: string
  readonly ownerMessage: string
  readonly slots: readonly ConversationSlotInput[]
}): PublicConversationResponse {
  return {
    assistantMessage: redactSupportText(options.assistantMessage),
    ownerMessage: redactSupportText(options.ownerMessage),
    slots: options.slots.map((slot) => ({
      confidence: slot.confidence,
      key: slot.key,
      source: slot.source,
      value: redactSupportText(slot.value),
    })),
  }
}
