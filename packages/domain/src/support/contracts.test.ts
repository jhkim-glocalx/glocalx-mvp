import { describe, expect, it } from "vitest"

import {
  activityActions,
  activityDetailSchema,
  activityEventEntrySchema,
  activityFlushRequestSchema,
  activityTrailMaxEntries,
  activityTrailSchema,
} from "./activity"
import {
  csMessageBodyMaxLength,
  csMessageContextSchema,
  csMessageCreateRequestSchema,
} from "./chat"

const validEntry = {
  section: "gbp_connect",
  action: "gbp_connect_started",
  occurredAt: "2026-07-18T00:00:00.000Z",
} as const

describe("activity trail schema", () => {
  it("accepts a whitelisted event entry", () => {
    expect(activityEventEntrySchema.parse(validEntry)).toStrictEqual(validEntry)
  })

  it("rejects an action outside the fixed enum", () => {
    const result = activityEventEntrySchema.safeParse({
      ...validEntry,
      action: "totally_made_up_action",
    })
    expect(result.success).toBe(false)
  })

  it("rejects free text smuggled as an unknown detail key", () => {
    const result = activityEventEntrySchema.safeParse({
      ...validEntry,
      detail: { note: "the owner typed their password here" },
    })
    expect(result.success).toBe(false)
  })

  it("accepts whitelisted detail keys with capped values", () => {
    expect(
      activityDetailSchema.parse({ reason: "oauth_denied", count: 2 })
    ).toStrictEqual({ reason: "oauth_denied", count: 2 })
  })

  it("rejects an over-long detail string value", () => {
    const result = activityDetailSchema.safeParse({ reason: "x".repeat(121) })
    expect(result.success).toBe(false)
  })

  it("rejects a non-ISO occurredAt", () => {
    const result = activityEventEntrySchema.safeParse({
      ...validEntry,
      occurredAt: "yesterday",
    })
    expect(result.success).toBe(false)
  })

  it("caps the trail at the ring-buffer size", () => {
    const overflow = Array.from(
      { length: activityTrailMaxEntries + 1 },
      () => validEntry
    )
    expect(activityTrailSchema.safeParse(overflow).success).toBe(false)
  })

  it("requires at least one event to flush", () => {
    expect(activityFlushRequestSchema.safeParse({ events: [] }).success).toBe(
      false
    )
  })

  it("keeps every action reviewable as a distinct enum member", () => {
    expect(new Set(activityActions).size).toBe(activityActions.length)
  })
})

describe("chat message schemas", () => {
  const context = {
    section: "gbp_connect",
    stage: "oauth",
    activityTrail: [validEntry],
  } as const

  it("accepts a well-formed create request", () => {
    const request = { body: "Stuck connecting Google", context }
    expect(csMessageCreateRequestSchema.parse(request)).toStrictEqual(request)
  })

  it("trims and rejects an empty body", () => {
    expect(
      csMessageCreateRequestSchema.safeParse({ body: "   ", context }).success
    ).toBe(false)
  })

  it("rejects a body past the max length", () => {
    const result = csMessageCreateRequestSchema.safeParse({
      body: "a".repeat(csMessageBodyMaxLength + 1),
      context,
    })
    expect(result.success).toBe(false)
  })

  it("allows a null stage for sections without sub-steps", () => {
    const result = csMessageContextSchema.safeParse({
      section: "home",
      stage: null,
      activityTrail: [],
    })
    expect(result.success).toBe(true)
  })

  it("rejects an unknown extra field on the context", () => {
    const result = csMessageContextSchema.safeParse({
      ...context,
      injected: "value",
    })
    expect(result.success).toBe(false)
  })
})
