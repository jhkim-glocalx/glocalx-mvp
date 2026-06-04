import { z } from "zod"

const nonEmptyStringSchema = z.string().trim().min(1)

export const onboardingExtractionRequestSchema = z
  .object({
    input: nonEmptyStringSchema,
  })
  .strict()

export const missingBusinessFieldSchema = z.enum(["phone", "hours"])

export const adapterBusinessProfileCandidateSchema = z
  .object({
    source: z.enum(["NAVER_LOCAL", "MANUAL"]),
    name: nonEmptyStringSchema,
    address: nonEmptyStringSchema,
    category: nonEmptyStringSchema,
    phone: nonEmptyStringSchema.optional(),
    hours: nonEmptyStringSchema.optional(),
    naverPlaceUrl: z.url().optional(),
    missingFields: z.array(missingBusinessFieldSchema),
  })
  .strict()

export type OnboardingExtractionRequest = z.infer<
  typeof onboardingExtractionRequestSchema
>
export type MissingBusinessField = z.infer<typeof missingBusinessFieldSchema>
export type AdapterBusinessProfileCandidate = z.infer<
  typeof adapterBusinessProfileCandidateSchema
>

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
