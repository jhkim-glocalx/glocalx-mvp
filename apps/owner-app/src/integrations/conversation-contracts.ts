import type { MissingBusinessField } from "@/domain/schemas"
import type {
  OnboardingConversationOutput,
  OnboardingConversationState,
  PostingConversationDecision,
  PostingConversationState,
} from "@/conversations/contracts"
import type { AdapterResult } from "./contracts"

export type OnboardingSlotExtractionInput = {
  readonly candidateName?: string
  readonly currentState: Extract<
    OnboardingConversationState,
    "manual_collection" | "slot_elicitation" | "slot_clarification"
  >
  readonly missingFields: readonly MissingBusinessField[]
  readonly ownerMessage: string
  readonly requestedField: MissingBusinessField
}

export type OnboardingNextPromptInput = {
  readonly currentState: OnboardingConversationState
  readonly missingFields: readonly MissingBusinessField[]
}

export type OnboardingNextPromptOutput = {
  readonly assistantMessage: string
  readonly nextState: OnboardingConversationState
}

export type PostingOwnerReplyInput = {
  readonly activeSuggestionId: string
  readonly currentState: Extract<
    PostingConversationState,
    "awaiting_suggestion_decision" | "question_answered"
  >
  readonly draftSummary: string
  readonly imageAssets?: readonly {
    readonly id: string
    readonly name: string
  }[]
  readonly ownerMessage: string
  readonly suggestionMessage: string
}

export interface OnboardingConversationAdapter {
  extractStoreSlots(
    input: OnboardingSlotExtractionInput
  ): Promise<AdapterResult<OnboardingConversationOutput>>
  composeNextPrompt(
    input: OnboardingNextPromptInput
  ): Promise<AdapterResult<OnboardingNextPromptOutput>>
}

export interface PostingConversationAdapter {
  classifyOwnerReply(
    input: PostingOwnerReplyInput
  ): Promise<AdapterResult<PostingConversationDecision>>
}
