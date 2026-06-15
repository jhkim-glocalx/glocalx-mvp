import { z } from "zod"

const nonEmptyStringSchema = z.string().trim().min(1)

export const onboardingConversationStates = [
  "awaiting_store_input",
  "retrieving_store",
  "search_query_required",
  "manual_collection",
  "manual_review_required",
  "blocked_by_credentials",
  "candidate_selection",
  "slot_elicitation",
  "slot_clarification",
  "profile_summary",
  "profile_confirmed",
] as const

export const postingConversationStates = [
  "awaiting_assets",
  "asset_validation_error",
  "text_only_draft",
  "analyzing_assets",
  "analysis_fallback",
  "suggestion_presented",
  "awaiting_suggestion_decision",
  "revision_requested",
  "question_answered",
  "draft_ready",
  "publish_requested",
  "publish_blocked",
  "published",
] as const

export const onboardingConversationStateSchema = z.enum(
  onboardingConversationStates
)
export const postingConversationStateSchema = z.enum(postingConversationStates)
export const conversationActorSchema = z.enum(["owner", "assistant", "system"])
export const conversationSurfaceSchema = z.enum(["ONBOARDING", "POSTING"])
export const clientEventIdSchema = nonEmptyStringSchema.max(120)

export type OnboardingConversationState = z.infer<
  typeof onboardingConversationStateSchema
>
export type PostingConversationState = z.infer<
  typeof postingConversationStateSchema
>

const onboardingTransitionSchema = z
  .object({
    actor: conversationActorSchema,
    clientEventId: clientEventIdSchema.optional(),
    from: onboardingConversationStateSchema,
    surface: z.literal("ONBOARDING"),
    to: onboardingConversationStateSchema,
  })
  .strict()

const postingTransitionSchema = z
  .object({
    actor: conversationActorSchema,
    clientEventId: clientEventIdSchema.optional(),
    from: postingConversationStateSchema,
    surface: z.literal("POSTING"),
    to: postingConversationStateSchema,
  })
  .strict()

const onboardingTransitionPairs = new Set([
  "awaiting_store_input->retrieving_store",
  "retrieving_store->slot_elicitation",
  "retrieving_store->profile_summary",
  "retrieving_store->candidate_selection",
  "retrieving_store->search_query_required",
  "retrieving_store->manual_collection",
  "retrieving_store->blocked_by_credentials",
  "candidate_selection->slot_elicitation",
  "candidate_selection->profile_summary",
  "manual_collection->manual_collection",
  "manual_collection->slot_clarification",
  "manual_collection->profile_summary",
  "manual_collection->manual_review_required",
  "slot_elicitation->slot_clarification",
  "slot_elicitation->profile_summary",
  "slot_clarification->slot_elicitation",
  "slot_clarification->profile_summary",
  "slot_clarification->manual_review_required",
  "profile_summary->slot_elicitation",
  "profile_summary->profile_confirmed",
] as const)

const postingTransitionPairs = new Set([
  "awaiting_assets->awaiting_assets",
  "awaiting_assets->asset_validation_error",
  "awaiting_assets->text_only_draft",
  "awaiting_assets->analyzing_assets",
  "asset_validation_error->awaiting_assets",
  "analyzing_assets->analysis_fallback",
  "analyzing_assets->suggestion_presented",
  "analyzing_assets->draft_ready",
  "suggestion_presented->awaiting_suggestion_decision",
  "awaiting_suggestion_decision->revision_requested",
  "awaiting_suggestion_decision->question_answered",
  "awaiting_suggestion_decision->draft_ready",
  "question_answered->awaiting_suggestion_decision",
  "revision_requested->draft_ready",
  "text_only_draft->draft_ready",
  "draft_ready->publish_requested",
  "publish_requested->publish_blocked",
  "publish_requested->published",
] as const)

export const conversationTransitionSchema = z
  .discriminatedUnion("surface", [
    onboardingTransitionSchema,
    postingTransitionSchema,
  ])
  .superRefine((transition, context) => {
    switch (transition.surface) {
      case "ONBOARDING":
        validateTransitionPair(
          onboardingTransitionPairs,
          transition.from,
          transition.to,
          context
        )
        if (
          transition.to === "profile_confirmed" &&
          transition.actor !== "owner"
        ) {
          addTransitionIssue(
            context,
            "Only the owner confirmation action can enter profile_confirmed"
          )
        }
        return
      case "POSTING":
        validateTransitionPair(
          postingTransitionPairs,
          transition.from,
          transition.to,
          context
        )
        if (
          (transition.to === "published" ||
            transition.to === "publish_blocked") &&
          transition.actor !== "system"
        ) {
          addTransitionIssue(
            context,
            "Only deterministic publish handling can enter publish terminal states"
          )
        }
        return
      default:
        return assertNever(transition)
    }
  })

function validateTransitionPair(
  allowedPairs: ReadonlySet<string>,
  from: string,
  to: string,
  context: z.RefinementCtx
): void {
  if (!allowedPairs.has(`${from}->${to}`)) {
    addTransitionIssue(context, `Invalid transition from ${from} to ${to}`)
  }
}

function addTransitionIssue(context: z.RefinementCtx, message: string): void {
  context.addIssue({
    code: "custom",
    message,
    path: ["to"],
  })
}

class UnexpectedConversationVariantError extends Error {
  readonly name = "UnexpectedConversationVariantError"
}

function assertNever(value: never): never {
  throw new UnexpectedConversationVariantError(
    `Unexpected conversation variant: ${String(value)}`
  )
}
