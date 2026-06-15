import { z } from "zod"

const nonEmptyStringSchema = z.string().trim().min(1)

export const onboardingExtractionRequestSchema = z
  .object({
    input: nonEmptyStringSchema,
  })
  .strict()

export const missingBusinessFieldSchema = z.enum(["phone", "hours"])

export const businessProfileCoordinatesSchema = z
  .object({
    mapx: z.number().finite(),
    mapy: z.number().finite(),
  })
  .strict()

export const adapterBusinessProfileCandidateSchema = z
  .object({
    candidateId: nonEmptyStringSchema,
    source: z.enum(["NAVER_LOCAL", "MANUAL"]),
    sourceInput: nonEmptyStringSchema,
    name: nonEmptyStringSchema,
    address: nonEmptyStringSchema,
    category: nonEmptyStringSchema,
    phone: nonEmptyStringSchema.optional(),
    hours: nonEmptyStringSchema.optional(),
    naverPlaceUrl: z.url().optional(),
    coordinates: businessProfileCoordinatesSchema.optional(),
    missingFields: z.array(missingBusinessFieldSchema),
  })
  .strict()

export const confirmedStoreProfileSchema = z
  .object({
    source: z.enum(["NAVER_LOCAL", "MANUAL"]),
    sourceInput: nonEmptyStringSchema,
    name: nonEmptyStringSchema,
    address: nonEmptyStringSchema,
    category: nonEmptyStringSchema,
    phone: nonEmptyStringSchema,
    hours: nonEmptyStringSchema.optional(),
    naverPlaceUrl: z.url().optional(),
  })
  .strict()

export const gbpSetupRequestSchema = z
  .object({
    mode: z.enum(["stub", "production"]),
  })
  .strict()

export const marketingSuggestionModeSchema = z.enum([
  "request",
  "accepted",
  "skipped",
])

export const postImageAssetSchema = z
  .object({
    dataUrl: z
      .string()
      .regex(/^data:image\/(png|jpe?g|webp);base64,/)
      .max(1_700_000)
      .optional(),
    id: nonEmptyStringSchema,
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    name: nonEmptyStringSchema,
    sizeBytes: z.number().int().nonnegative().max(1_200_000),
  })
  .strict()

export const postDraftRequestSchema = z
  .object({
    acceptedSuggestionId: nonEmptyStringSchema.optional(),
    imageAssets: z.array(postImageAssetSchema).max(4).optional(),
    storeId: nonEmptyStringSchema,
    suggestionMode: marketingSuggestionModeSchema.optional(),
    ownerIntent: nonEmptyStringSchema,
    targetChannel: z.literal("GBP"),
  })
  .strict()

export const postPublishRequestSchema = z
  .object({
    storeId: nonEmptyStringSchema,
    idempotencyKey: nonEmptyStringSchema.optional(),
  })
  .strict()

export const onboardingSlotTurnRequestSchema = z
  .object({
    candidate: adapterBusinessProfileCandidateSchema,
    clientEventId: nonEmptyStringSchema.max(120),
    currentState: z.enum([
      "manual_collection",
      "slot_elicitation",
      "slot_clarification",
    ]),
    ownerMessage: nonEmptyStringSchema,
    requestedField: missingBusinessFieldSchema,
    sessionId: nonEmptyStringSchema.optional(),
  })
  .strict()

export const postingDecisionRequestSchema = z
  .object({
    activeSuggestionId: nonEmptyStringSchema,
    clientEventId: nonEmptyStringSchema.max(120),
    draftId: nonEmptyStringSchema,
    draftSummary: nonEmptyStringSchema,
    imageAssets: z.array(postImageAssetSchema).max(4).optional(),
    ownerIntent: nonEmptyStringSchema,
    ownerMessage: nonEmptyStringSchema,
    sessionId: nonEmptyStringSchema.optional(),
    storeId: nonEmptyStringSchema,
    suggestionMessage: nonEmptyStringSchema,
    suggestionRevisedIntent: nonEmptyStringSchema.optional(),
  })
  .strict()

export type OnboardingExtractionRequest = z.infer<
  typeof onboardingExtractionRequestSchema
>
export type GbpSetupRequest = z.infer<typeof gbpSetupRequestSchema>
export type PostDraftRequest = z.infer<typeof postDraftRequestSchema>
export type PostPublishRequest = z.infer<typeof postPublishRequestSchema>
export type OnboardingSlotTurnRequest = z.infer<
  typeof onboardingSlotTurnRequestSchema
>
export type PostingDecisionRequest = z.infer<
  typeof postingDecisionRequestSchema
>
export type PostImageAsset = z.infer<typeof postImageAssetSchema>
export type MarketingSuggestionMode = z.infer<
  typeof marketingSuggestionModeSchema
>
export type MissingBusinessField = z.infer<typeof missingBusinessFieldSchema>
export type BusinessProfileCoordinates = z.infer<
  typeof businessProfileCoordinatesSchema
>
export type AdapterBusinessProfileCandidate = z.infer<
  typeof adapterBusinessProfileCandidateSchema
>
export type ConfirmedStoreProfile = z.infer<typeof confirmedStoreProfileSchema>

export type ParsedValidationIssue = {
  readonly path: readonly (string | number)[]
  readonly message: string
}

export type ParseRoutePayloadResult<TValue> =
  | {
      readonly kind: "ok"
      readonly value: TValue
    }
  | {
      readonly kind: "validation_error"
      readonly issues: readonly ParsedValidationIssue[]
    }

export function parseRoutePayload<TValue>(
  schema: z.ZodType<TValue>,
  payload: unknown
): ParseRoutePayloadResult<TValue> {
  const parsed = schema.safeParse(payload)

  if (parsed.success) {
    return {
      kind: "ok",
      value: parsed.data,
    }
  }

  return {
    kind: "validation_error",
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.flatMap((pathSegment) =>
        typeof pathSegment === "symbol" ? [] : [pathSegment]
      ),
      message: issue.message,
    })),
  }
}
