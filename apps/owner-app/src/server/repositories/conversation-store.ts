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
  }): Promise<ConversationSession>
  readCurrentSession(options: {
    readonly kind: ConversationKind
    readonly storeId: string
  }): Promise<ConversationSession | undefined>
  resumeSession(
    lookup: ConversationSessionLookup
  ): Promise<ConversationSession | undefined>
  appendOwnerMessage(
    options: ConversationSessionLookup & {
      readonly clientEventId: string
      readonly content: string
      readonly now: Date
    }
  ): Promise<ConversationMessage>
  appendAssistantMessage(
    options: ConversationSessionLookup & {
      readonly content: string
      readonly now: Date
    }
  ): Promise<ConversationMessage>
  upsertSlots(
    options: ConversationSessionLookup & {
      readonly now: Date
      readonly slots: readonly ConversationSlotInput[]
    }
  ): Promise<readonly ConversationSlotValue[]>
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
  ): Promise<RecordConversationTurnResult>
  readReplay(options: {
    readonly clientEventId: string
    readonly sessionId: string
    readonly storeId: string
  }): Promise<PublicConversationResponse | undefined>
  readDraft(lookup: {
    readonly sessionId: string
    readonly storeId: string
  }): Promise<ConversationDraft | undefined>
  completeSession(options: {
    readonly now: Date
    readonly sessionId: string
    readonly storeId: string
  }): Promise<ConversationSession>
  selectCandidate(options: {
    readonly candidateId: string
    readonly candidateJson: PublicConversationResponse
    readonly now: Date
    readonly sessionId: string
    readonly storeId: string
  }): Promise<ConversationSession>
}

export { createDatabaseConversationStore } from "./conversation-store-queryable"
