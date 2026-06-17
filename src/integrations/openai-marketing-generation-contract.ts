import { z } from "zod"

const marketingIntentAnalysisSchema = z
  .object({
    audience: z.string().min(1),
    keywords: z.array(z.string().min(1)).min(1).max(8),
    objective: z.string().min(1),
    promotionWindow: z.string().min(1),
    tone: z.string().min(1),
  })
  .strict()

const marketingImageOutputSchema = z
  .object({
    altText: z.string().min(1),
    assetId: z.string().min(1),
    cropFocus: z.string().min(1),
    cssFilter: z.string().min(1),
    editedDataUrl: z.string().optional(),
    editedLabel: z.string().min(1),
    editSummary: z.string().min(1),
    originalLabel: z.string().min(1),
    qualityScore: z.number().int().min(1).max(100),
  })
  .strict()

const marketingSuggestionSchema = z
  .object({
    id: z.string().min(1),
    message: z.string().min(1),
    ownerAction: z.string().min(1),
    rationale: z.string().min(1),
    revisedIntent: z.string().min(1),
    title: z.string().min(1),
  })
  .strict()

function labelForTranslationLocale(locale: "en" | "ja" | "zh"): string {
  if (locale === "ja") {
    return "Japanese"
  }
  if (locale === "zh") {
    return "Chinese"
  }
  return "English"
}

const marketingCaptionTranslationSchema = z
  .object({
    copy: z.string().min(1),
    label: z.string().min(1),
    locale: z.enum(["en", "ja", "zh"]),
  })
  .strict()
  .transform((translation) => ({
    ...translation,
    label: labelForTranslationLocale(translation.locale),
  }))

const marketingPlatformPreviewSchema = z
  .object({
    aspectRatio: z.string().min(1),
    callToAction: z.string().min(1),
    copy: z.string().min(1),
    hashtags: z.array(z.string().min(1)).max(10),
    imageAssetId: z.string().nullable(),
    label: z.string().min(1),
    locale: z.enum(["ko", "en", "ja", "zh"]).optional(),
    platform: z.enum(["GBP", "INSTAGRAM"]),
    translations: z.array(marketingCaptionTranslationSchema).length(3),
    uploadNotes: z.array(z.string().min(1)).max(8),
  })
  .strict()

export const marketingGenerationResultSchema = z
  .object({
    images: z.array(marketingImageOutputSchema).max(6),
    intentAnalysis: marketingIntentAnalysisSchema,
    platformPreviews: z.array(marketingPlatformPreviewSchema).min(1).max(4),
    suggestion: marketingSuggestionSchema.nullable(),
  })
  .strict()

function toTranslationJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["locale", "label", "copy"],
    properties: {
      locale: { enum: ["en", "ja", "zh"] },
      label: { type: "string" },
      copy: { type: "string" },
    },
  }
}

export function toMarketingJsonSchema(): Record<string, unknown> {
  const stringSchema = { type: "string" }
  return {
    type: "object",
    additionalProperties: false,
    required: ["intentAnalysis", "images", "suggestion", "platformPreviews"],
    properties: {
      intentAnalysis: {
        type: "object",
        additionalProperties: false,
        required: [
          "objective",
          "audience",
          "keywords",
          "promotionWindow",
          "tone",
        ],
        properties: {
          objective: stringSchema,
          audience: stringSchema,
          keywords: { type: "array", items: stringSchema },
          promotionWindow: stringSchema,
          tone: stringSchema,
        },
      },
      images: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "assetId",
            "originalLabel",
            "editedLabel",
            "editSummary",
            "altText",
            "cropFocus",
            "cssFilter",
            "qualityScore",
          ],
          properties: {
            assetId: stringSchema,
            originalLabel: stringSchema,
            editedLabel: stringSchema,
            editSummary: stringSchema,
            altText: stringSchema,
            cropFocus: stringSchema,
            cssFilter: stringSchema,
            qualityScore: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
      },
      suggestion: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            required: [
              "id",
              "title",
              "message",
              "rationale",
              "ownerAction",
              "revisedIntent",
            ],
            properties: {
              id: stringSchema,
              title: stringSchema,
              message: stringSchema,
              rationale: stringSchema,
              ownerAction: stringSchema,
              revisedIntent: stringSchema,
            },
          },
        ],
      },
      platformPreviews: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "platform",
            "label",
            "aspectRatio",
            "imageAssetId",
            "copy",
            "hashtags",
            "callToAction",
            "translations",
            "uploadNotes",
          ],
          properties: {
            platform: { enum: ["GBP", "INSTAGRAM"] },
            label: stringSchema,
            aspectRatio: stringSchema,
            imageAssetId: { anyOf: [{ type: "string" }, { type: "null" }] },
            copy: stringSchema,
            hashtags: { type: "array", items: stringSchema },
            callToAction: stringSchema,
            translations: {
              type: "array",
              minItems: 3,
              maxItems: 3,
              items: toTranslationJsonSchema(),
            },
            uploadNotes: { type: "array", items: stringSchema },
          },
        },
      },
    },
  }
}
