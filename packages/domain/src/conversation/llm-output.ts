import { z } from "zod"

import { missingBusinessFieldSchema } from "../schemas"

const nonEmptyStringSchema = z.string().trim().min(1)

export const conversationConfidenceSchema = z.enum(["high", "medium", "low"])
export type ConversationConfidence = z.infer<
  typeof conversationConfidenceSchema
>

export const onboardingLlmNextStateSchema = z.enum([
  "slot_elicitation",
  "slot_clarification",
  "profile_summary",
])

const onboardingExtractedFieldsSchema = z
  .object({
    hours: nonEmptyStringSchema.optional(),
    phone: nonEmptyStringSchema.optional(),
  })
  .strict()

const onboardingFieldConfidenceSchema = z
  .object({
    hours: conversationConfidenceSchema.optional(),
    phone: conversationConfidenceSchema.optional(),
  })
  .strict()

export const onboardingConversationOutputSchema = z
  .object({
    assistantMessage: nonEmptyStringSchema.max(400),
    extractedFields: onboardingExtractedFieldsSchema,
    confidence: conversationConfidenceSchema,
    fieldConfidence: onboardingFieldConfidenceSchema,
    missingFields: z.array(missingBusinessFieldSchema),
    needsOwnerConfirmation: z.boolean(),
    nextState: onboardingLlmNextStateSchema,
  })
  .strict()
  .superRefine((output, context) => {
    // Extracted fields require per-field confidence before they can become slots.
    for (const field of missingBusinessFieldSchema.options) {
      if (
        output.extractedFields[field] !== undefined &&
        output.fieldConfidence[field] === undefined
      ) {
        addMissingConfidenceIssue(context, field)
      }
    }
  })

export type OnboardingConversationOutput = z.infer<
  typeof onboardingConversationOutputSchema
>

export const manualProfileFieldSchema = z.enum([
  "name",
  "address",
  "category",
  "phone",
  "hours",
])

const manualExtractedFieldsSchema = z
  .object({
    address: nonEmptyStringSchema.optional(),
    category: nonEmptyStringSchema.optional(),
    hours: nonEmptyStringSchema.optional(),
    name: nonEmptyStringSchema.optional(),
    phone: nonEmptyStringSchema.optional(),
  })
  .strict()

const manualFieldConfidenceSchema = z
  .object({
    address: conversationConfidenceSchema.optional(),
    category: conversationConfidenceSchema.optional(),
    hours: conversationConfidenceSchema.optional(),
    name: conversationConfidenceSchema.optional(),
    phone: conversationConfidenceSchema.optional(),
  })
  .strict()

export const manualProfileCollectionOutputSchema = z
  .object({
    assistantMessage: nonEmptyStringSchema.max(500),
    extractedFields: manualExtractedFieldsSchema,
    fieldConfidence: manualFieldConfidenceSchema,
    missingRequiredFields: z.array(
      z.enum(["name", "address", "category", "phone"])
    ),
    nextState: z.enum([
      "manual_collection",
      "slot_clarification",
      "profile_summary",
    ]),
  })
  .strict()
  .superRefine((output, context) => {
    for (const field of manualProfileFieldSchema.options) {
      if (
        output.extractedFields[field] !== undefined &&
        output.fieldConfidence[field] === undefined
      ) {
        addMissingConfidenceIssue(context, field)
      }
    }
  })

export const postingQuestionScopeSchema = z.enum(["grounded", "out_of_scope"])
export const postingConversationDecisionSchema = z
  .object({
    acceptedSuggestionId: nonEmptyStringSchema.optional(),
    assistantMessage: nonEmptyStringSchema.max(700),
    decision: z.enum(["accepted", "skipped", "revision_requested", "question"]),
    ownerQuestion: nonEmptyStringSchema.optional(),
    questionScope: postingQuestionScopeSchema.optional(),
    revisedIntent: nonEmptyStringSchema.optional(),
  })
  .strict()
  .superRefine((decision, context) => {
    // Each decision branch must include the downstream field that makes it actionable.
    switch (decision.decision) {
      case "accepted":
        requireDecisionField(context, decision.acceptedSuggestionId, [
          "acceptedSuggestionId",
        ])
        return
      case "skipped":
        return
      case "revision_requested":
        requireDecisionField(context, decision.revisedIntent, ["revisedIntent"])
        return
      case "question":
        requireDecisionField(context, decision.ownerQuestion, ["ownerQuestion"])
        requireDecisionField(context, decision.questionScope, ["questionScope"])
        return
      default:
        return assertNever(decision.decision)
    }
  })

export type PostingConversationDecision = z.infer<
  typeof postingConversationDecisionSchema
>

export type ConversationJsonSchema = Readonly<Record<string, unknown>>

export function toOnboardingSlotExtractionJsonSchema(): ConversationJsonSchema {
  return z.toJSONSchema(onboardingConversationOutputSchema)
}

export function toManualProfileCollectionJsonSchema(): ConversationJsonSchema {
  return z.toJSONSchema(manualProfileCollectionOutputSchema)
}

export function toPostingDecisionJsonSchema(): ConversationJsonSchema {
  return z.toJSONSchema(postingConversationDecisionSchema)
}

function addMissingConfidenceIssue(
  context: z.RefinementCtx,
  field: string
): void {
  context.addIssue({
    code: "custom",
    message: `fieldConfidence.${field} is required when ${field} is extracted`,
    path: ["fieldConfidence", field],
  })
}

function requireDecisionField(
  context: z.RefinementCtx,
  value: string | undefined,
  path: string[]
): void {
  if (value === undefined) {
    context.addIssue({
      code: "custom",
      message: `${path.join(".")} is required for this decision`,
      path,
    })
  }
}

class UnexpectedDecisionVariantError extends Error {
  readonly name = "UnexpectedDecisionVariantError"
}

function assertNever(value: never): never {
  throw new UnexpectedDecisionVariantError(
    `Unexpected posting decision: ${String(value)}`
  )
}
