import { Buffer } from "node:buffer"

import { z } from "zod"

import { blockedByCredentials, missingEnvVars } from "./credentials"
import type {
  AdapterEnvironment,
  AdapterResult,
  ExternalFetch,
  MarketingGenerationAdapter,
  MarketingGenerationInput,
  MarketingGenerationResult,
  MarketingImageAssetInput,
} from "./contracts"

const openAiEnvVars = ["OPENAI_API_KEY"] as const
const responsesUrl = "https://api.openai.com/v1/responses"
const imageEditsUrl = "https://api.openai.com/v1/images/edits"

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

const marketingPlatformPreviewSchema = z
  .object({
    aspectRatio: z.string().min(1),
    callToAction: z.string().min(1),
    copy: z.string().min(1),
    hashtags: z.array(z.string().min(1)).max(10),
    imageAssetId: z.string().nullable(),
    label: z.string().min(1),
    platform: z.enum(["GBP", "INSTAGRAM"]),
    uploadNotes: z.array(z.string().min(1)).max(8),
  })
  .strict()

const marketingGenerationResultSchema = z
  .object({
    images: z.array(marketingImageOutputSchema).max(6),
    intentAnalysis: marketingIntentAnalysisSchema,
    platformPreviews: z.array(marketingPlatformPreviewSchema).min(1).max(4),
    suggestion: marketingSuggestionSchema.nullable(),
  })
  .strict()

const openAiResponseSchema = z
  .object({
    output_text: z.string().optional(),
    output: z.unknown().optional(),
  })
  .passthrough()

const imageEditResponseSchema = z
  .object({
    data: z
      .array(
        z
          .object({
            b64_json: z.string().optional(),
            url: z.url().optional(),
          })
          .passthrough()
      )
      .min(1),
  })
  .passthrough()

function openAiHeaders(apiKey: string): Readonly<Record<string, string>> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  }
}

function extractOutputText(payload: unknown): string {
  const parsed = openAiResponseSchema.parse(payload)
  if (parsed.output_text !== undefined) {
    return parsed.output_text
  }

  const output = parsed.output
  if (!Array.isArray(output)) {
    throw new Error("OpenAI response did not include text output.")
  }

  for (const item of output) {
    if (
      typeof item === "object" &&
      item !== null &&
      "content" in item &&
      Array.isArray(item.content)
    ) {
      for (const content of item.content) {
        if (
          typeof content === "object" &&
          content !== null &&
          "text" in content &&
          typeof content.text === "string"
        ) {
          return content.text
        }
      }
    }
  }

  throw new Error("OpenAI response text could not be extracted.")
}

function toMarketingJsonSchema(): Record<string, unknown> {
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
          keywords: {
            type: "array",
            items: stringSchema,
          },
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
            qualityScore: {
              type: "integer",
              minimum: 1,
              maximum: 100,
            },
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
            "uploadNotes",
          ],
          properties: {
            platform: { enum: ["GBP", "INSTAGRAM"] },
            label: stringSchema,
            aspectRatio: stringSchema,
            imageAssetId: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
            copy: stringSchema,
            hashtags: {
              type: "array",
              items: stringSchema,
            },
            callToAction: stringSchema,
            uploadNotes: {
              type: "array",
              items: stringSchema,
            },
          },
        },
      },
    },
  }
}

function buildMarketingPrompt(input: MarketingGenerationInput): string {
  const imageList = input.imageAssets
    .map((asset, index) => `${index + 1}. ${asset.id} / ${asset.name}`)
    .join("\n")

  return [
    "You are a Korean small-business marketing operator.",
    "Analyze the owner's natural-language intent and the latest image set.",
    "Return Korean-first marketing output for Google Business Profile and Instagram.",
    "Every image item must use one of the provided asset IDs.",
    "Use CSS filter values that can preview the intended enhancement in a browser.",
    input.suggestionMode === "skipped"
      ? "Do not include an optional suggestion; return null."
      : "Include one optional smart suggestion if it can improve conversion.",
    input.suggestionMode === "accepted"
      ? `The owner accepted suggestion ${input.acceptedSuggestionId ?? ""}; incorporate it.`
      : "",
    "",
    `Store: ${input.storeName}`,
    `Address: ${input.storeAddress}`,
    `Owner intent: ${input.ownerIntent}`,
    `Images:\n${imageList || "No image metadata provided."}`,
  ].join("\n")
}

function buildResponsesBody(
  env: AdapterEnvironment,
  input: MarketingGenerationInput
): unknown {
  const content = [
    {
      type: "input_text",
      text: buildMarketingPrompt(input),
    },
    ...input.imageAssets.flatMap((asset) =>
      asset.dataUrl === undefined
        ? []
        : [
            {
              type: "input_image",
              image_url: asset.dataUrl,
              detail: "auto",
            },
          ]
    ),
  ]

  return {
    model: env["OPENAI_MARKETING_MODEL"]?.trim() || "gpt-5.5",
    input: [
      {
        role: "user",
        content,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "marketing_generation_result",
        strict: true,
        schema: toMarketingJsonSchema(),
      },
    },
  }
}

function dataUrlToBlob(dataUrl: string, mimeType: string): Blob {
  const prefix = `data:${mimeType};base64,`
  if (!dataUrl.startsWith(prefix)) {
    throw new Error("Image data URL did not match its MIME type.")
  }

  return new Blob([Buffer.from(dataUrl.slice(prefix.length), "base64")], {
    type: mimeType,
  })
}

async function editImage(
  apiKey: string,
  fetchImpl: ExternalFetch,
  model: string,
  asset: MarketingImageAssetInput,
  prompt: string
): Promise<string | undefined> {
  if (asset.dataUrl === undefined) {
    return undefined
  }

  const formData = new FormData()
  formData.set("model", model)
  formData.set("prompt", prompt)
  formData.append(
    "image",
    dataUrlToBlob(asset.dataUrl, asset.mimeType),
    asset.name
  )

  const response = await fetchImpl(imageEditsUrl, {
    body: formData,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    method: "POST",
  })

  if (!response.ok) {
    return undefined
  }

  const payload: unknown = await response.json()
  const imagePayload = imageEditResponseSchema.parse(payload)
  const first = imagePayload.data[0]
  if (first?.b64_json !== undefined) {
    return `data:image/png;base64,${first.b64_json}`
  }
  return first?.url
}

async function addEditedImages(
  apiKey: string,
  env: AdapterEnvironment,
  fetchImpl: ExternalFetch,
  input: MarketingGenerationInput,
  result: MarketingGenerationResult
): Promise<MarketingGenerationResult> {
  const imageModel = env["OPENAI_IMAGE_MODEL"]?.trim() || "gpt-image-1.5"
  const editedImages = await Promise.all(
    result.images.map(async (image) => {
      const asset = input.imageAssets.find(
        (candidate) => candidate.id === image.assetId
      )
      if (asset === undefined) {
        return image
      }

      const editedDataUrl = await editImage(
        apiKey,
        fetchImpl,
        imageModel,
        asset,
        `${image.editSummary} Preserve the original product and store identity.`
      )
      return editedDataUrl === undefined ? image : { ...image, editedDataUrl }
    })
  )

  return {
    ...result,
    images: editedImages,
  }
}

export function createProductionMarketingGeneration(
  env: AdapterEnvironment,
  fetchImpl: ExternalFetch
): MarketingGenerationAdapter {
  return {
    async generateMarketingDraft(
      input
    ): Promise<AdapterResult<MarketingGenerationResult>> {
      const missing = missingEnvVars(env, openAiEnvVars)
      if (missing.length > 0) {
        return blockedByCredentials(missing)
      }

      const apiKey = env["OPENAI_API_KEY"] ?? ""
      const response = await fetchImpl(responsesUrl, {
        body: JSON.stringify(buildResponsesBody(env, input)),
        headers: openAiHeaders(apiKey),
        method: "POST",
        signal: AbortSignal.timeout(20000),
      })

      if (!response.ok) {
        throw new Error(
          `OpenAI marketing generation failed: ${response.status}`
        )
      }

      const outputText = extractOutputText(await response.json())
      const parsed = marketingGenerationResultSchema.parse(
        JSON.parse(outputText)
      )
      return {
        kind: "ok",
        value: await addEditedImages(apiKey, env, fetchImpl, input, parsed),
      }
    },
  }
}
