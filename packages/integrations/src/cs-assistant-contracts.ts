import type { AdapterResult } from "./contracts"

// A prior turn in the support conversation, as the responder reasons over it.
// `role` is the true authorship the model sees (owner vs. the assistant); the
// owner-facing single-persona illusion is a presentation concern, not the
// model's — it composes the assistant's next turn.
export type CsAssistantTurn = {
  readonly role: "owner" | "assistant"
  readonly body: string
}

// Everything the responder grounds a reply in (architecture §5): who the store
// is, where they are in onboarding / GBP connection, what campaigns are in
// flight, where in the app they sent from (the activity context), and the
// conversation so far. Assembled by the caller from the store profile, GBP
// state, campaign statuses, and the message's activity trail — the adapter
// itself stays free of database concerns.
export type CsAssistantComposeInput = {
  readonly storeName: string
  readonly storeProfileSummary: string
  readonly gbpConnectionState: string
  readonly campaignStatuses: readonly string[]
  readonly currentSection: string
  readonly currentStage: string | null
  readonly recentActions: readonly string[]
  readonly history: readonly CsAssistantTurn[]
  readonly ownerMessage: string
}

export type CsAssistantComposeOutput = {
  readonly reply: string
}

// Composes the assistant's next reply to an owner message. Stub mode returns a
// deterministic, credential-free reply so chat is fully demoable; the
// production OpenAI implementation (Phase 2 PR2) grounds a real reply in the
// same input and is request-spec tested rather than exercised with live calls.
export interface CsAssistantAdapter {
  composeReply(
    input: CsAssistantComposeInput
  ): Promise<AdapterResult<CsAssistantComposeOutput>>
}
