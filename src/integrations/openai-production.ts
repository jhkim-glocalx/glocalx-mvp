import { Buffer } from "node:buffer"

import { z } from "zod"

import { blockedByCredentials, missingEnvVars } from "./credentials"
import { marketingGenerationResultSchema } from "./openai-marketing-generation-contract"
import { buildMarketingResponsesBody } from "./openai-marketing-prompt"
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
const maxOpenAiErrorBodyLength = 800

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

async function readOpenAiErrorMessage(response: Response): Promise<string> {
  const body = await response.text()
  const detail = body.trim().slice(0, maxOpenAiErrorBodyLength)
  return detail === ""
    ? `OpenAI marketing generation failed: ${response.status}`
    : `OpenAI marketing generation failed: ${response.status} ${detail}`
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
        body: JSON.stringify(buildMarketingResponsesBody(env, input)),
        headers: openAiHeaders(apiKey),
        method: "POST",
        signal: AbortSignal.timeout(20000),
      })

      if (!response.ok) {
        throw new Error(await readOpenAiErrorMessage(response))
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
