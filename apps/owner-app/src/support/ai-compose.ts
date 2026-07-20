import { randomUUID } from "node:crypto"

import type {
  CsAssistantAdapter,
  CsAssistantComposeInput,
  CsAssistantTurn,
} from "@glocalx/integrations/contracts"
import type { CsConversationStore } from "@glocalx/db/support/conversation-store"
import type { CsMessageContextStore } from "@glocalx/db/support/message-context-store"
import type { CsMessageStore } from "@glocalx/db/support/message-store"

// The grounding the caller assembles from the store's own records (architecture
// §5). campaignStatuses stays empty until Phase 3 wires the pipeline in.
export type CsGrounding = {
  readonly storeName: string
  readonly storeProfileSummary: string
  readonly gbpConnectionState: string
  readonly campaignStatuses: readonly string[]
}

// Courteous, owner-visible fallback when autonomous (`ai`) composition fails, so
// an owner waiting on an AI reply never sees silence or an error (architecture
// §5). `ai_draft` failures flag for the operator instead — never post this.
export const csComposeFallbackReply =
  "죄송해요, 지금 답변을 준비하는 데 문제가 있었어요. 담당자가 확인하고 곧 도와드릴게요."

export type ComposeDeps = {
  readonly conversationStore: CsConversationStore
  readonly messageStore: CsMessageStore
  readonly messageContextStore: CsMessageContextStore
  readonly csAssistant: CsAssistantAdapter
  readonly gatherGrounding: (storeId: string) => Promise<CsGrounding>
}

export type ComposeAssistantReplyInput = {
  readonly deps: ComposeDeps
  readonly conversationId: string
  // The owner message that triggered this composition — excluded from the
  // history the model reasons over (it is passed as `ownerMessage`).
  readonly triggerMessageId: string
  readonly ownerMessage: string
  readonly now: Date
}

async function buildComposeInput(
  deps: ComposeDeps,
  input: {
    readonly conversationId: string
    readonly triggerMessageId: string
    readonly ownerMessage: string
    readonly storeId: string
  }
): Promise<CsAssistantComposeInput> {
  const grounding = await deps.gatherGrounding(input.storeId)
  const context = await deps.messageContextStore.getContextForMessage(
    input.triggerMessageId
  )
  // Only sent messages are real conversation history; unsent AI drafts never
  // count as turns the model has "said".
  const page = await deps.messageStore.listAdminMessages({
    conversationId: input.conversationId,
  })
  const history: readonly CsAssistantTurn[] = page.messages
    .filter(
      (message) =>
        message.status === "sent" && message.id !== input.triggerMessageId
    )
    .map((message) => ({ role: message.sender, body: message.body }))

  return {
    storeName: grounding.storeName,
    storeProfileSummary: grounding.storeProfileSummary,
    gbpConnectionState: grounding.gbpConnectionState,
    campaignStatuses: grounding.campaignStatuses,
    currentSection: context?.section ?? "unknown",
    currentStage: context?.stage ?? null,
    recentActions: (context?.activityTrail ?? []).map(
      (entry) => `${entry.section}:${entry.action}`
    ),
    history,
    ownerMessage: input.ownerMessage,
  }
}

// Out-of-band AI composition (architecture §5). Runs after the owner's POST has
// already persisted their message and returned, so OpenAI latency or failure can
// never make the owner's send ambiguous. `ai` sends the reply immediately;
// `ai_draft` parks it as an operator-reviewable draft (invisible to the owner);
// `human` is a no-op guard in case the mode changed between send and compose.
export async function composeAssistantReply(
  input: ComposeAssistantReplyInput
): Promise<void> {
  const { deps, conversationId, now } = input
  const conversation =
    await deps.conversationStore.getConversationById(conversationId)
  if (conversation === undefined || conversation.mode === "human") {
    return
  }

  let reply: string
  try {
    const result = await deps.csAssistant.composeReply(
      await buildComposeInput(deps, {
        conversationId,
        triggerMessageId: input.triggerMessageId,
        ownerMessage: input.ownerMessage,
        storeId: conversation.storeId,
      })
    )
    if (result.kind !== "ok") {
      await handleComposeFailure(deps, conversation, result.code, now)
      return
    }
    reply = result.value.reply
  } catch {
    // The adapter error itself may carry model output; never surface it.
    await handleComposeFailure(deps, conversation, "COMPOSE_ERROR", now)
    return
  }

  if (conversation.mode === "ai") {
    await deps.messageStore.appendMessage({
      id: randomUUID(),
      conversationId,
      sender: "assistant",
      authorKind: "ai",
      authorAdminId: null,
      body: reply,
      status: "sent",
      now,
    })
  } else {
    // ai_draft: at most one pending draft at a time — replace any prior one so
    // the operator always reviews the latest composition.
    await deps.messageStore.discardPendingDrafts(conversationId)
    await deps.messageStore.appendMessage({
      id: randomUUID(),
      conversationId,
      sender: "assistant",
      authorKind: "ai",
      authorAdminId: null,
      body: reply,
      status: "draft",
      now,
    })
  }

  // A healthy composition clears any flag a prior failure raised.
  await deps.conversationStore.clearFlag(conversationId, now)
  await deps.conversationStore.touch(conversationId, now)
}

async function handleComposeFailure(
  deps: ComposeDeps,
  conversation: { readonly id: string; readonly mode: string },
  reason: string,
  now: Date
): Promise<void> {
  // Autonomous mode has no operator in the loop, so the owner gets a courteous
  // fallback. In ai_draft an operator already reviews every reply, so a flag is
  // enough — posting an owner-visible fallback would be noise.
  if (conversation.mode === "ai") {
    await deps.messageStore.appendMessage({
      id: randomUUID(),
      conversationId: conversation.id,
      sender: "assistant",
      authorKind: "ai",
      authorAdminId: null,
      body: csComposeFallbackReply,
      status: "sent",
      now,
    })
  }
  await deps.conversationStore.flagConversation(conversation.id, reason, now)
  await deps.conversationStore.touch(conversation.id, now)
}
