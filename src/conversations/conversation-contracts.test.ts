import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  conversationTransitionSchema,
  onboardingConversationOutputSchema,
  postingConversationDecisionSchema,
  toOnboardingSlotExtractionJsonSchema,
  toPostingDecisionJsonSchema,
} from "./contracts"

const jsonSchemaObjectSchema = z
  .object({
    properties: z.record(z.string(), z.unknown()),
  })
  .passthrough()

const jsonSchemaEnumSchema = z
  .object({
    enum: z.array(z.string()),
  })
  .passthrough()

describe("conversation-contracts", () => {
  it("rejects invalid onboarding and posting transitions when the LLM claims authority it never has", () => {
    const onboardingTransition = conversationTransitionSchema.safeParse({
      actor: "assistant",
      from: "profile_summary",
      surface: "ONBOARDING",
      to: "profile_confirmed",
    })

    const postingTransition = conversationTransitionSchema.safeParse({
      actor: "assistant",
      from: "publish_requested",
      surface: "POSTING",
      to: "published",
    })

    expect(onboardingTransition.success).toBe(false)
    expect(postingTransition.success).toBe(false)
  })

  it("rejects stale posting state transitions that would reopen an already-ready draft", () => {
    const staleTransition = conversationTransitionSchema.safeParse({
      actor: "owner",
      from: "draft_ready",
      surface: "POSTING",
      to: "awaiting_assets",
    })

    expect(staleTransition.success).toBe(false)
  })

  it("requires fieldConfidence for each extracted onboarding field instead of inferring top-level confidence", () => {
    const parsed = onboardingConversationOutputSchema.safeParse({
      assistantMessage: "전화번호와 영업시간을 이렇게 이해했어요.",
      confidence: "high",
      extractedFields: {
        hours: "평일 09:00-18:00",
        phone: "1-2342-232",
      },
      missingFields: [],
      needsOwnerConfirmation: true,
      nextState: "profile_summary",
    })

    expect(parsed.success).toBe(false)
  })

  it("snapshots the structured-output schemas and excludes forbidden terminal states", () => {
    const onboardingSchema = toOnboardingSlotExtractionJsonSchema()
    const postingSchema = toPostingDecisionJsonSchema()
    const onboardingProperties =
      jsonSchemaObjectSchema.parse(onboardingSchema).properties
    const postingProperties = jsonSchemaObjectSchema.parse(postingSchema).properties
    const onboardingNextStates = [
      ...jsonSchemaEnumSchema.parse(onboardingProperties["nextState"]).enum,
    ].sort()
    const postingDecisionValues = [
      ...jsonSchemaEnumSchema.parse(postingProperties["decision"]).enum,
    ].sort()

    expect({
      onboardingProperties: Object.keys(onboardingProperties),
      onboardingNextStates,
      postingDecisionValues,
    }).toMatchInlineSnapshot(`
      {
        "onboardingNextStates": [
          "profile_summary",
          "slot_clarification",
          "slot_elicitation",
        ],
        "onboardingProperties": [
          "assistantMessage",
          "extractedFields",
          "confidence",
          "fieldConfidence",
          "missingFields",
          "needsOwnerConfirmation",
          "nextState",
        ],
        "postingDecisionValues": [
          "accepted",
          "question",
          "revision_requested",
          "skipped",
        ],
      }
    `)

    expect(JSON.stringify(onboardingSchema)).not.toContain("profile_confirmed")
    expect(JSON.stringify(postingSchema)).not.toContain("published")
  })

  it("rejects malformed posting decision payloads with unknown publish success states", () => {
    const parsed = postingConversationDecisionSchema.safeParse({
      assistantMessage: "게시가 완료됐어요.",
      decision: "published",
    })

    expect(parsed.success).toBe(false)
  })
})
