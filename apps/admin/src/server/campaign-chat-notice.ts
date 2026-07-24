import { randomUUID } from "node:crypto"

import type { CsConversationStore } from "@glocalx/db/support/conversation-store"
import type { CsMessageStore } from "@glocalx/db/support/message-store"
import type { PublishChannel } from "@glocalx/domain/campaign-state-machine"

// Pipeline events that the owner must not have to poll for reach them on the
// channel they already use — the store's chat conversation. Written as
// sender='assistant' so the owner keeps seeing one assistant (architecture §2),
// with authorKind='admin' and no admin id: operations spoke, but no operator
// typed it. Phase 3 task 8 extends this to the other status transitions.

export type PostCampaignNoticeInput = {
  readonly csConversationStore: CsConversationStore
  readonly csMessageStore: CsMessageStore
  readonly storeId: string
  readonly body: string
  readonly now: Date
}

export async function postCampaignAssistantNotice(
  input: PostCampaignNoticeInput
): Promise<void> {
  const conversation =
    await input.csConversationStore.getOrCreateOpenConversation({
      id: randomUUID(),
      storeId: input.storeId,
      mode: "human",
      now: input.now,
    })

  await input.csMessageStore.appendMessage({
    id: randomUUID(),
    conversationId: conversation.id,
    sender: "assistant",
    authorKind: "admin",
    authorAdminId: null,
    body: input.body,
    now: input.now,
  })
  await input.csConversationStore.touch(conversation.id, input.now)
}

const channelLabels: Readonly<Record<PublishChannel, string>> = {
  gbp: "구글 비즈니스 프로필",
  instagram: "인스타그램",
}

// The owner would otherwise wait silently on a job that will never retry itself
// — architecture.md §2 makes this message part of the retry policy, not a nicety.
export function publishRetryLimitNoticeBody(
  channels: readonly PublishChannel[]
): string {
  const names = channels.map((channel) => channelLabels[channel]).join(", ")
  return `${names} 게시가 3회 실패해서 자동 재시도를 멈췄습니다. 담당자가 직접 확인하고 이어서 안내드릴게요.`
}
