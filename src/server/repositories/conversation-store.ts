import type {
  ConversationDraft,
  ConversationKind,
  ConversationMessage,
  ConversationSession,
  ConversationSlotInput,
  ConversationSlotValue,
  PublicConversationResponse,
  RecordConversationTurnResult,
} from "@/conversations/repository"

export type ConversationSessionLookup = {
  readonly kind?: ConversationKind
  readonly sessionId: string
  readonly storeId: string
}

export interface ConversationStore {
  createSession(options: {
    readonly id: string
    readonly kind: ConversationKind
    readonly now: Date
    readonly state: string
    readonly storeId: string
  }): ConversationSession
  readCurrentSession(options: {
    readonly kind: ConversationKind
    readonly storeId: string
  }): ConversationSession | undefined
  resumeSession(
    lookup: ConversationSessionLookup
  ): ConversationSession | undefined
  appendOwnerMessage(
    options: ConversationSessionLookup & {
      readonly clientEventId: string
      readonly content: string
      readonly now: Date
    }
  ): ConversationMessage
  appendAssistantMessage(
    options: ConversationSessionLookup & {
      readonly content: string
      readonly now: Date
    }
  ): ConversationMessage
  upsertSlots(
    options: ConversationSessionLookup & {
      readonly now: Date
      readonly slots: readonly ConversationSlotInput[]
    }
  ): readonly ConversationSlotValue[]
  recordTurn(
    options: ConversationSessionLookup & {
      readonly assistantMessage: string
      readonly clientEventId: string
      readonly eventId: string
      readonly nextState: string
      readonly now: Date
      readonly ownerMessage: string
      readonly publicResponse: PublicConversationResponse
      readonly slots: readonly ConversationSlotInput[]
    }
  ): RecordConversationTurnResult
  readReplay(options: {
    readonly clientEventId: string
    readonly sessionId: string
    readonly storeId: string
  }): PublicConversationResponse | undefined
  readDraft(lookup: {
    readonly sessionId: string
    readonly storeId: string
  }): ConversationDraft | undefined
  completeSession(options: {
    readonly now: Date
    readonly sessionId: string
    readonly storeId: string
  }): ConversationSession
  selectCandidate(options: {
    readonly candidateId: string
    readonly candidateJson: PublicConversationResponse
    readonly now: Date
    readonly sessionId: string
    readonly storeId: string
  }): ConversationSession
}
