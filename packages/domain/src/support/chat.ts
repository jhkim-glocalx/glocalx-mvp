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

// Which producer composes the next assistant message. Flips per conversation
// (Phase 2); Phase 1 conversations are created in "human" mode.
export const csConversationModeSchema = z.enum(["ai", "human"])
export type CsConversationMode = z.infer<typeof csConversationModeSchema>

export const csConversationStatusSchema = z.enum(["open", "resolved"])
export type CsConversationStatus = z.infer<typeof csConversationStatusSchema>

export const csMessageBodyMaxLength = 4000
export const csMessageBodySchema = z.string().trim().min(1).max(csMessageBodyMaxLength)

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
export type CsMessageCreateRequest = z.infer<typeof csMessageCreateRequestSchema>

// Owner-facing message DTO: deliberately omits author_kind/author_admin_id so
// no owner-facing read can ever reveal whether a human or the AI replied.
export type OwnerFacingMessage = {
  readonly id: string
  readonly sender: CsMessageSender
  readonly body: string
  readonly createdAt: string
}

// Operations-facing message DTO: the full authorship picture for the console.
export type AdminFacingMessage = {
  readonly id: string
  readonly sender: CsMessageSender
  readonly authorKind: CsAuthorKind
  readonly authorAdminId: string | null
  readonly body: string
  readonly createdAt: string
  readonly ownerReadAt: string | null
  readonly adminReadAt: string | null
}
