import type { AdapterEnvironment, MarketingGenerationInput } from "./contracts"
import { toMarketingJsonSchema } from "./openai-marketing-generation-contract"

function buildMarketingPrompt(input: MarketingGenerationInput): string {
  const imageList = input.imageAssets
    .map((asset, index) => `${index + 1}. ${asset.id} / ${asset.name}`)
    .join("\n")

  return [
    "You are a Korean small-business marketing operator.",
    "Analyze the owner's natural-language intent and the latest image set.",
    "Return Korean-first marketing output for Google Business Profile and Instagram.",
    "Every platform preview copy must be Korean and every image item must use one of the provided asset IDs.",
    "Each platform preview must include translations for English, Japanese, and Chinese.",
    "Use translation labels exactly as English, Japanese, and Chinese.",
    "The English translation must be fully English: do not copy Korean, Hangul, Korean store names, or Korean addresses into English output.",
    "Translate or localize store names and addresses naturally for each target language.",
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

export function buildMarketingResponsesBody(
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
    input: [{ role: "user", content }],
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
