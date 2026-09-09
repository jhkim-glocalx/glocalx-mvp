import type { CsMessageContextRecord } from "@glocalx/db/support/message-context-store"
import type { InboxConversationSummary } from "@glocalx/db/support/conversation-store"
import type { GbpAccessRequest } from "@glocalx/db/support/gbp-access-store"
import type { GbpAccessState } from "@glocalx/domain/gbp-access"
import type {
  ActivityTrail,
  AdminFacingMessage,
} from "@glocalx/domain/support/contracts"

// Wire shapes shared by the inbox API routes and the ops client. Kept in one
// place so the operator console and the endpoints that feed it never drift.

export type InboxConversationView = {
  readonly id: string
  readonly storeId: string
  readonly storeName: string
  readonly mode: string
  readonly status: string
  readonly assignedAdminId: string | null
  // Set when an AI composition failed (architecture §5) so the console can
  // surface the conversation for operator attention. Null when healthy.
  readonly flaggedAt: string | null
  readonly flagReason: string | null
  readonly unreadFromOwner: number
  readonly lastMessageSender: string | null
  readonly lastMessageBody: string | null
  readonly lastMessageAt: string | null
  readonly updatedAt: string
}

// The per-message diagnostic context (delivery-plan §5): the screen the owner
// was on and the recent-action trail. Only owner messages carry it.
export type InboxMessageContextView = {
  readonly section: string
  readonly stage: string | null
  readonly activityTrail: ActivityTrail
}

// The operator sees the full authorship picture (sender + authorKind), unlike
// the owner. Read receipts drive the "awaiting reply" affordance in the list.
export type InboxMessageView = {
  readonly id: string
  readonly sender: string
  readonly authorKind: string
  // `sent` vs `draft`: a `draft` is an un-sent AI composition the console
  // reviews before it ever reaches the owner (the one-assistant illusion).
  readonly status: string
  readonly authorAdminId: string | null
  readonly body: string
  readonly createdAt: string
  readonly ownerReadAt: string | null
  readonly adminReadAt: string | null
  readonly context: InboxMessageContextView | null
}

// The store's GBP org-access posture, carried on the conversation DETAIL only
// (never the list): "GBP가 안 돼요" is the most common thing an owner writes,
// and answering it without this means matching store names by eye in another
// tab. Null when the store has no request row yet — itself the answer to
// "where is this store stuck".
export type InboxGbpAccessView = {
  readonly requestId: string
  readonly state: GbpAccessState
} | null

export function toInboxGbpAccessView(
  request: GbpAccessRequest | undefined
): InboxGbpAccessView {
  return request === undefined
    ? null
    : { requestId: request.id, state: request.state }
}

export function toInboxConversationView(
  summary: InboxConversationSummary
): InboxConversationView {
  return summary
}

export function toInboxMessageView(
  message: AdminFacingMessage,
  context: CsMessageContextRecord | undefined
): InboxMessageView {
  return {
    id: message.id,
    sender: message.sender,
    authorKind: message.authorKind,
    status: message.status,
    authorAdminId: message.authorAdminId,
    body: message.body,
    createdAt: message.createdAt,
    ownerReadAt: message.ownerReadAt,
    adminReadAt: message.adminReadAt,
    context:
      context === undefined
        ? null
        : {
            section: context.section,
            stage: context.stage,
            activityTrail: context.activityTrail,
          },
  }
}
