import { z } from "zod"

// Owner-facing surfaces the activity telemetry tags. Additive and reviewable:
// new sections land here so this enum stays the single source of truth for
// where an owner can be (architecture §3/§7).
export const activitySections = [
  "onboarding",
  "gbp_connect",
  "home",
  "marketing",
  "reviews",
  "performance",
  "chat",
] as const
export const activitySectionSchema = z.enum(activitySections)
export type ActivitySection = z.infer<typeof activitySectionSchema>

// Finer sub-step within a section; null when the section has no sub-stages.
// Only ever the screen the owner is currently on (cs_message_context.stage) —
// historical trail entries carry section + action, not stage.
export const activityStages = [
  "store_input",
  "extracting",
  "candidate_selection",
  "manual_entry",
  "profile_summary",
  "oauth",
  "location_select",
  "access_pending",
  "intake",
  "review",
] as const
export const activityStageSchema = z.enum(activityStages)
export type ActivityStage = z.infer<typeof activityStageSchema>

// Fixed action enum — the trail carries only these values, never free text.
// Grouped by flow; adding an action is a reviewable one-line change
// (architecture §7 telemetry minimization; delivery-plan Phase 1).
export const activityActions = [
  "section_viewed",
  "onboarding_started",
  "store_extraction_submitted",
  "store_extraction_failed",
  "store_confirmed",
  "gbp_connect_started",
  "gbp_oauth_completed",
  "gbp_connect_failed",
  "gbp_access_requested",
  "campaign_intake_opened",
  "campaign_upload_failed",
  "campaign_submitted",
  "campaign_review_opened",
  "campaign_decision_submitted",
  "chat_opened",
  "chat_closed",
  "chat_message_sent",
] as const
export const activityActionSchema = z.enum(activityActions)
export type ActivityAction = z.infer<typeof activityActionSchema>

// detail carries only whitelisted, non-PII keys — codes and counts, never
// prose, keystrokes, or credential material (architecture §7). Values are
// length-capped so a caller can't smuggle free text through a code field.
export const activityDetailKeys = [
  "section",
  "stage",
  "channel",
  "reason",
  "count",
  "requestId",
] as const

const activityDetailValueSchema = z.union([
  z.string().max(120),
  z.number().finite(),
  z.boolean(),
])

export const activityDetailSchema = z.partialRecord(
  z.enum(activityDetailKeys),
  activityDetailValueSchema
)
export type ActivityDetail = z.infer<typeof activityDetailSchema>

// A single recorded event: one row in activity_events, and one element of a
// message's activity_trail. Client-supplied occurredAt is validated as ISO.
export const activityEventEntrySchema = z
  .object({
    section: activitySectionSchema,
    action: activityActionSchema,
    detail: activityDetailSchema.optional(),
    occurredAt: z.iso.datetime(),
  })
  .strict()
export type ActivityEventEntry = z.infer<typeof activityEventEntrySchema>

// Ring buffer bound carried with each chat message (architecture §2: "most
// recent N events (~20)").
export const activityTrailMaxEntries = 20
export const activityTrailSchema = z
  .array(activityEventEntrySchema)
  .max(activityTrailMaxEntries)
export type ActivityTrail = z.infer<typeof activityTrailSchema>

// Periodic flush of the ring buffer to activity_events (architecture §2).
export const activityFlushMaxEvents = 50
export const activityFlushRequestSchema = z
  .object({
    events: z
      .array(activityEventEntrySchema)
      .min(1)
      .max(activityFlushMaxEvents),
  })
  .strict()
export type ActivityFlushRequest = z.infer<typeof activityFlushRequestSchema>
