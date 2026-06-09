import { describe, expect, it } from "vitest"

import {
  adapterBusinessProfileCandidateSchema,
  confirmedStoreProfileSchema,
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
      candidateId: "naver-local-demo",
      source: "NAVER_LOCAL",
      sourceInput: "브런치모먼트",
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

  it("parses confirmed store profiles with required GBP setup fields", () => {
    const result = parseRoutePayload(confirmedStoreProfileSchema, {
      source: "NAVER_LOCAL",
      sourceInput: "https://naver.me/mybrunchcafe",
      name: "브런치모먼트 홍대점",
      address: "서울 마포구 와우산로 123",
      phone: "02-123-4567",
      category: "브런치 카페",
      hours: "09:00 ~ 21:00",
      naverPlaceUrl: "https://naver.me/mybrunchcafe",
    })

    expect(result.kind).toBe("ok")
    if (result.kind === "ok") {
      expect(result.value.phone).toBe("02-123-4567")
    }
  })

  it("rejects confirmed store profiles without a phone number", () => {
    const result = parseRoutePayload(confirmedStoreProfileSchema, {
      source: "NAVER_LOCAL",
      sourceInput: "브런치모먼트",
      name: "브런치모먼트 홍대점",
      address: "서울 마포구 와우산로 123",
      category: "브런치 카페",
    })

    expect(result.kind).toBe("validation_error")
    if (result.kind === "validation_error") {
      expect(result.issues.map((issue) => issue.path.join("."))).toContain(
        "phone"
      )
    }
  })
})
