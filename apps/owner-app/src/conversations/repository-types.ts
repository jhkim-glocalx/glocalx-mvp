export const conversationKinds = ["onboarding", "posting"] as const
export type ConversationKind = (typeof conversationKinds)[number]
export type PublicConversationResponse = Readonly<Record<string, unknown>>

export type ConversationSession = {
  readonly id: string
  readonly storeId: string
  readonly kind: ConversationKind
  readonly state: string
  readonly status: "active" | "completed"
  readonly selectedCandidateId: string | null
  readonly selectedCandidate: unknown | null
  readonly supportMetadata: PublicConversationResponse
  readonly createdAt: string
  readonly updatedAt: string
  readonly completedAt: string | null
}

export type ConversationMessage = {
  readonly id: string
  readonly sessionId: string
  readonly role: "owner" | "assistant"
  readonly clientEventId: string | null
  readonly content: string
  readonly redactedContent: string
  readonly sequence: number
  readonly createdAt: string
}

export type ConversationSlotInput = {
  readonly key: string
  readonly value: string
  readonly source: string
  readonly confidence: number
}

export type ConversationSlotValue = ConversationSlotInput & {
  readonly id: string
  readonly sessionId: string
  readonly createdAt: string
  readonly updatedAt: string
}

export type ConversationDraft = {
  readonly session: ConversationSession
  readonly messages: readonly ConversationMessage[]
  readonly slots: readonly ConversationSlotValue[]
}

export type RecordConversationTurnResult =
  | {
      readonly kind: "created"
      readonly assistantMessage: ConversationMessage
      readonly ownerMessage: ConversationMessage
      readonly response: PublicConversationResponse
      readonly slots: readonly ConversationSlotValue[]
    }
  | { readonly kind: "replayed"; readonly response: PublicConversationResponse }

export type RedactedConversationSupportView = {
  readonly events: readonly {
    readonly clientEventId: string
    readonly createdAt: string
    readonly eventType: string
    readonly redactedPayload: PublicConversationResponse
  }[]
  readonly messages: readonly {
    readonly content: string
    readonly createdAt: string
    readonly role: "owner" | "assistant"
  }[]
  readonly sessionId: string
  readonly storeId: string
}

export class ConversationNotFoundError extends Error {
  readonly name = "ConversationNotFoundError"
  constructor(readonly sessionId: string) {
    super("ConversationNotFoundError")
  }
}

export class ConversationSessionCompletedError extends Error {
  readonly name = "ConversationSessionCompletedError"
  constructor(readonly sessionId: string) {
    super("ConversationSessionCompletedError")
  }
}

export class ConversationInvalidSlotError extends Error {
  readonly name = "ConversationInvalidSlotError"
  constructor(
    readonly key: string,
    readonly confidence: number
  ) {
    super("ConversationInvalidSlotError")
  }
}
