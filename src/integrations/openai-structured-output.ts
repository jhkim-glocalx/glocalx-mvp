import { z } from "zod"

import type { AdapterEnvironment, ExternalFetch } from "./contracts"
import type { ConversationJsonSchema } from "@/conversations/contracts"

const responsesUrl = "https://api.openai.com/v1/responses"

const openAiResponseSchema = z
  .object({
    output: z.unknown().optional(),
    output_text: z.string().optional(),
  })
  .passthrough()

export class MalformedLlmResponseError extends Error {
  readonly name = "MalformedLlmResponseError"

  constructor(
    readonly contract: string,
    options?: { readonly cause?: unknown }
  ) {
    super(`Malformed LLM response for ${contract}`, options)
  }
}

function openAiHeaders(apiKey: string): Readonly<Record<string, string>> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  }
}

function extractOutputText(payload: unknown, contract: string): string {
  const parsed = openAiResponseSchema.parse(payload)
  if (parsed.output_text !== undefined) {
    return parsed.output_text
  }
  const output = parsed.output
  if (!Array.isArray(output)) {
    throw new MalformedLlmResponseError(contract)
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
  throw new MalformedLlmResponseError(contract)
}

function parseStructuredJson<TValue>(
  schema: z.ZodType<TValue>,
  outputText: string,
  contract: string
): TValue {
  try {
    const payload: unknown = JSON.parse(outputText)
    return schema.parse(payload)
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      throw new MalformedLlmResponseError(contract, { cause: error })
    }
    throw error
  }
}

function buildResponsesBody(
  prompt: string,
  schemaName: string,
  schema: ConversationJsonSchema,
  env: AdapterEnvironment
): unknown {
  return {
    input: [
      {
        content: [{ text: prompt, type: "input_text" }],
        role: "user",
      },
    ],
    model: env["OPENAI_CONVERSATION_MODEL"]?.trim() || "gpt-5.5",
    text: {
      format: {
        name: schemaName,
        schema,
        strict: true,
        type: "json_schema",
      },
    },
  }
}

export async function requestStructuredOutput<TValue>(options: {
  readonly contract: string
  readonly env: AdapterEnvironment
  readonly fetchImpl: ExternalFetch
  readonly prompt: string
  readonly schema: z.ZodType<TValue>
  readonly schemaName: string
  readonly schemaJson: ConversationJsonSchema
}): Promise<TValue> {
  const apiKey = options.env["OPENAI_API_KEY"] ?? ""
  const response = await options.fetchImpl(responsesUrl, {
    body: JSON.stringify(
      buildResponsesBody(
        options.prompt,
        options.schemaName,
        options.schemaJson,
        options.env
      )
    ),
    headers: openAiHeaders(apiKey),
    method: "POST",
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) {
    throw new MalformedLlmResponseError(options.contract)
  }
  const outputText = extractOutputText(await response.json(), options.contract)
  return parseStructuredJson(options.schema, outputText, options.contract)
}
