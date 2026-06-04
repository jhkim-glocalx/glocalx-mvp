import { describe, expect, it } from "vitest"

import {
  adapterBusinessProfileCandidateSchema,
  onboardingExtractionRequestSchema,
  parseRoutePayload,
} from "./schemas"

describe("route-schema-validation", () => {
  it("returns typed validation errors for malformed route payloads", () => {
    const result = parseRoutePayload(onboardingExtractionRequestSchema, {
      input: "",
    })

    expect(result.kind).toBe("validation_error")
    if (result.kind === "validation_error") {
      expect(result.issues[0]?.path).toEqual(["input"])
    }
  })

  it("returns typed validation errors for malformed adapter responses", () => {
    const result = parseRoutePayload(adapterBusinessProfileCandidateSchema, {
      source: "NAVER_LOCAL",
      name: "브런치모먼트 홍대점",
      category: "브런치",
    })

    expect(result.kind).toBe("validation_error")
    if (result.kind === "validation_error") {
      expect(result.issues.map((issue) => issue.path.join("."))).toContain(
        "address"
      )
    }
  })
})
