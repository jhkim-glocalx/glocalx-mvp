import { z } from "zod"

import {
  activitySectionSchema,
  activityStageSchema,
  activityTrailSchema,
} from "./activity"

// What the owner sees: a single "assistant" persona vs. their own messages.
export const csMessageSenderSchema = z.enum(["owner", "assistant"])
export type CsMessageSender = z.infer<typeof csMessageSenderSchema>

// What operations knows: who actually authored an assistant message. Never
// surfaced to the owner — the sender/author_kind split is the one-assistant
// illusion (architecture §2).
export const csAuthorKindSchema = z.enum(["user", "ai", "admin"])
export type CsAuthorKind = z.infer<typeof csAuthorKindSchema>

// Which producer composes the next assistant message, flipped per conversation
// by an operator. `human`: an operator writes every reply (Phase 1 default,
// still the default for new conversations — the concierge posture). `ai_draft`:
// the AI pre-composes a reply the operator reviews and sends (owner never sees
// it unsent). `ai`: the AI composes and sends autonomously. Widened in Phase 2.
export const csConversationModeSchema = z.enum(["ai_draft", "ai", "human"])
export type CsConversationMode = z.infer<typeof csConversationModeSchema>

// Whether an assistant message has been sent to the owner (`sent`) or is an
// AI-composed draft awaiting operator review (`draft`). No owner-facing read
// ever returns a `draft` row — that exclusion is the one-assistant illusion for
// the draft posture (architecture §5). Owner and admin messages are always
// `sent`; only `author_kind='ai'` rows are ever `draft`.
export const csMessageStatusSchema = z.enum(["sent", "draft"])
export type CsMessageStatus = z.infer<typeof csMessageStatusSchema>

export const csConversationStatusSchema = z.enum(["open", "resolved"])
export type CsConversationStatus = z.infer<typeof csConversationStatusSchema>

export const csMessageBodyMaxLength = 4000
export const csMessageBodySchema = z
  .string()
  .trim()
  .min(1)
  .max(csMessageBodyMaxLength)

// The screen the owner was on when they sent a message, plus the recent-action
// trail — this is what lets an operator diagnose without asking (architecture
// §2/§4). section/stage are the current screen; activityTrail is the history.
export const csMessageContextSchema = z
  .object({
    section: activitySectionSchema,
    stage: activityStageSchema.nullable().optional(),
    activityTrail: activityTrailSchema,
  })
  .strict()
export type CsMessageContext = z.infer<typeof csMessageContextSchema>

// Owner create-message payload (trust boundary for the owner chat API, PR2).
export const csMessageCreateRequestSchema = z
  .object({
    body: csMessageBodySchema,
    context: csMessageContextSchema,
  })
  .strict()
export type CsMessageCreateRequest = z.infer<
  typeof csMessageCreateRequestSchema
>

// Operator reply payload (trust boundary for the dashboard reply API, PR3).
// Reuses the owner's body bounds — a reply is a message like any other.
export const csAdminReplyRequestSchema = z
  .object({
    body: csMessageBodySchema,
  })
  .strict()
export type CsAdminReplyRequest = z.infer<typeof csAdminReplyRequestSchema>

// Operator mode-toggle payload (trust boundary for the set-mode API, PR3). The
// operator flips a conversation between the concierge (`human`) and AI postures.
export const csAdminSetModeRequestSchema = z
  .object({
    mode: csConversationModeSchema,
  })
  .strict()
export type CsAdminSetModeRequest = z.infer<typeof csAdminSetModeRequestSchema>

// Operator send-draft payload (PR3). `messageId` pins which pending draft is
// being promoted — the store guards on status='draft', so a stale id is a no-op
// rather than sending the wrong message. `body` carries the operator's edits.
export const csAdminSendDraftRequestSchema = z
  .object({
    messageId: z.string().min(1),
    body: csMessageBodySchema,
  })
  .strict()
export type CsAdminSendDraftRequest = z.infer<
  typeof csAdminSendDraftRequestSchema
>

// Operator discard-draft payload (PR3): reject an AI draft outright (the
// operator writes their own reply instead). `messageId` pins the draft.
export const csAdminDiscardDraftRequestSchema = z
  .object({
    messageId: z.string().min(1),
  })
  .strict()
export type CsAdminDiscardDraftRequest = z.infer<
  typeof csAdminDiscardDraftRequestSchema
>

// Owner-facing message DTO: deliberately omits author_kind/author_admin_id so
// no owner-facing read can ever reveal whether a human or the AI replied.
export type OwnerFacingMessage = {
  readonly id: string
  readonly sender: CsMessageSender
  readonly body: string
  readonly createdAt: string
}

// Operations-facing message DTO: the full authorship picture for the console,
// including draft status so the console can render un-sent AI drafts distinctly.
export type AdminFacingMessage = {
  readonly id: string
  readonly sender: CsMessageSender
  readonly authorKind: CsAuthorKind
  readonly status: CsMessageStatus
  readonly authorAdminId: string | null
  readonly body: string
  readonly createdAt: string
  readonly ownerReadAt: string | null
  readonly adminReadAt: string | null
}
