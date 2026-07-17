import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { requestStructuredOutput } from "./openai-structured-output"

const optionalFieldsOutputSchema = z
  .object({
    extractedFields: z
      .object({
        hours: z.string().optional(),
        phone: z.string().optional(),
      })
      .strict(),
    requiredName: z.string(),
  })
  .strict()

const responseFormatSchema = z
  .object({
    properties: z.record(z.string(), z.unknown()),
    required: z.array(z.string()),
  })
  .passthrough()

const anyOfSchema = z
  .object({
    anyOf: z.array(z.unknown()),
  })
  .passthrough()

const openAiRequestBodySchema = z
  .object({
    text: z
      .object({
        format: z
          .object({
            schema: z.unknown(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough()

describe("OpenAI structured output boundary", () => {
  it("sends optional object fields as strict nullable fields and parses returned nulls as absent", async () => {
    let capturedSchema: unknown
    const fetchImpl = vi.fn(async (_input: string, init?: RequestInit) => {
      const requestBody = openAiRequestBodySchema.parse(
        JSON.parse(String(init?.body))
      )
      capturedSchema = requestBody.text.format.schema

      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            extractedFields: {
              hours: "월-화 17:00-22:00, 수-금 17:00-20:00",
              phone: null,
            },
            requiredName: "임병주산동칼국수",
          }),
        })
      )
    })

    const result = await requestStructuredOutput({
      contract: "onboarding_slot_extraction",
      env: { OPENAI_API_KEY: "openai-key" },
      fetchImpl,
      prompt: "Owner says multi-day hours.",
      schema: optionalFieldsOutputSchema,
      schemaJson: z.toJSONSchema(optionalFieldsOutputSchema),
      schemaName: "onboarding_slot_extraction",
    })

    const rootSchema = responseFormatSchema.parse(capturedSchema)
    const extractedFieldsSchema = responseFormatSchema.parse(
      rootSchema.properties["extractedFields"]
    )
    const hoursSchema = anyOfSchema.parse(
      extractedFieldsSchema.properties["hours"]
    )
    const phoneSchema = anyOfSchema.parse(
      extractedFieldsSchema.properties["phone"]
    )

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect([...extractedFieldsSchema.required].sort()).toEqual([
      "hours",
      "phone",
    ])
    expect(hoursSchema.anyOf).toContainEqual({ type: "null" })
    expect(phoneSchema.anyOf).toContainEqual({ type: "null" })
    expect(result).toEqual({
      extractedFields: {
        hours: "월-화 17:00-22:00, 수-금 17:00-20:00",
      },
      requiredName: "임병주산동칼국수",
    })
  })
})
