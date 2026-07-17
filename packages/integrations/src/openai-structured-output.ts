import { z } from "zod"

import type { AdapterEnvironment, ExternalFetch } from "./contracts"
import type { ConversationJsonSchema } from "@glocalx/domain/conversation/contracts"

const responsesUrl = "https://api.openai.com/v1/responses"

const openAiResponseSchema = z
  .object({
    output: z.unknown().optional(),
    output_text: z.string().optional(),
  })
  .passthrough()

const nullJsonSchema = { type: "null" } as const

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNullSchema(value: unknown): boolean {
  return isRecord(value) && value["type"] === "null"
}

function schemaAllowsNull(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }

  const type = value["type"]
  if (
    type === "null" ||
    (Array.isArray(type) && type.some((entry) => entry === "null"))
  ) {
    return true
  }

  const anyOf = value["anyOf"]
  return Array.isArray(anyOf) && anyOf.some(isNullSchema)
}

function nullableSchema(value: unknown): unknown {
  if (schemaAllowsNull(value)) {
    return value
  }
  return { anyOf: [value, nullJsonSchema] }
}

function normalizeSchemaValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeSchemaValue)
  }
  if (!isRecord(value)) {
    return value
  }
  return normalizeObjectSchema(value)
}

function normalizeObjectSchema(
  schema: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  // OpenAI strict schemas require every property to be listed as required; nullable wrappers preserve this app's optional-field contract.
  const normalized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(schema)) {
    if (key !== "properties" && key !== "required") {
      normalized[key] = normalizeSchemaValue(value)
    }
  }

  const properties = schema["properties"]
  if (!isRecord(properties)) {
    if (schema["required"] !== undefined) {
      normalized["required"] = normalizeSchemaValue(schema["required"])
    }
    return normalized
  }

  const required = schema["required"]
  const requiredFields = new Set(
    Array.isArray(required)
      ? required.filter((field) => typeof field === "string")
      : []
  )
  const normalizedProperties: Record<string, unknown> = {}

  for (const [field, fieldSchema] of Object.entries(properties)) {
    const normalizedFieldSchema = normalizeSchemaValue(fieldSchema)
    normalizedProperties[field] = requiredFields.has(field)
      ? normalizedFieldSchema
      : nullableSchema(normalizedFieldSchema)
  }

  normalized["properties"] = normalizedProperties
  normalized["required"] = Object.keys(normalizedProperties)
  return normalized
}

function toOpenAiStrictSchema(
  schema: ConversationJsonSchema
): ConversationJsonSchema {
  return normalizeObjectSchema(schema)
}

function stripNullObjectFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripNullObjectFields)
  }
  if (!isRecord(value)) {
    return value
  }

  const stripped: Record<string, unknown> = {}
  // Nulls are transport placeholders for fields that were optional before strict-schema normalization; remove them before Zod domain parsing.
  for (const [key, nestedValue] of Object.entries(value)) {
    if (nestedValue !== null) {
      stripped[key] = stripNullObjectFields(nestedValue)
    }
  }
  return stripped
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
    return schema.parse(stripNullObjectFields(payload))
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
  env: AdapterEnvironment,
  modelName: string | undefined
): unknown {
  const configuredModel =
    modelName?.trim() || env["OPENAI_CONVERSATION_MODEL"]?.trim() || "gpt-5.5"
  return {
    input: [
      {
        content: [{ text: prompt, type: "input_text" }],
        role: "user",
      },
    ],
    model: configuredModel,
    text: {
      format: {
        name: schemaName,
        schema: toOpenAiStrictSchema(schema),
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
  readonly modelName?: string
}): Promise<TValue> {
  const apiKey = options.env["OPENAI_API_KEY"] ?? ""
  // This is the Responses API boundary: callers provide the contract schema, and this function owns strict formatting plus output parsing.
  const response = await options.fetchImpl(responsesUrl, {
    body: JSON.stringify(
      buildResponsesBody(
        options.prompt,
        options.schemaName,
        options.schemaJson,
        options.env,
        options.modelName
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
