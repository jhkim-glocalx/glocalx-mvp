import { describe, expect, it } from "vitest"

import {
  adapterBusinessProfileCandidateSchema,
  confirmedStoreProfileSchema,
  onboardingExtractionRequestSchema,
  parseRoutePayload,
  postDraftRequestSchema,
  postImageAssetSchema,
} from "./schemas"
import { postImageRequestDataUrlMaxChars } from "./post-image-limits"

const twentyMbBytes = 20_000_000
const jpegDataUrlPrefix = "data:image/jpeg;base64,"

type TestImageAssetOptions = {
  readonly dataUrl?: string
  readonly id?: string
  readonly name?: string
  readonly sizeBytes?: number
}

function imageAssetPayload(options?: TestImageAssetOptions) {
  const payload = {
    id: options?.id ?? "asset-1",
    mimeType: "image/png",
    name: options?.name ?? "brunch.png",
    sizeBytes: options?.sizeBytes ?? 512_000,
  }

  return options?.dataUrl === undefined
    ? payload
    : { ...payload, dataUrl: options.dataUrl }
}

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

  it("accepts post image asset metadata when sizeBytes is exactly 20MB", () => {
    // Given: supported image metadata is exactly at the 20MB upload boundary.
    const result = parseRoutePayload(
      postImageAssetSchema,
      imageAssetPayload({ sizeBytes: twentyMbBytes })
    )

    // When: the route boundary parses the image asset.
    // Then: the exact boundary value is accepted.
    expect(result.kind).toBe("ok")
    if (result.kind === "ok") {
      expect(result.value.sizeBytes).toBe(twentyMbBytes)
    }
  })

  it("rejects post image assets when sizeBytes is over 20MB", () => {
    // Given: a supported image asset is one byte over the 20MB boundary.
    const result = parseRoutePayload(
      postImageAssetSchema,
      imageAssetPayload({ sizeBytes: twentyMbBytes + 1 })
    )

    // When: the route boundary parses the image asset.
    // Then: validation fails on the sizeBytes field.
    expect(result.kind).toBe("validation_error")
    if (result.kind === "validation_error") {
      expect(result.issues.map((issue) => issue.path.join("."))).toContain(
        "sizeBytes"
      )
    }
  })

  it("accepts compressed post image data URLs within the request payload cap", () => {
    const dataUrl = `${jpegDataUrlPrefix}${"A".repeat(
      postImageRequestDataUrlMaxChars - jpegDataUrlPrefix.length
    )}`
    const result = parseRoutePayload(
      postImageAssetSchema,
      imageAssetPayload({
        dataUrl,
        sizeBytes: twentyMbBytes,
      })
    )

    expect(result.kind).toBe("ok")
  })

  it("rejects compressed post image data URLs over the request payload cap", () => {
    const dataUrl = `${jpegDataUrlPrefix}${"A".repeat(
      postImageRequestDataUrlMaxChars - jpegDataUrlPrefix.length + 1
    )}`
    const result = parseRoutePayload(
      postImageAssetSchema,
      imageAssetPayload({
        dataUrl,
        sizeBytes: twentyMbBytes,
      })
    )

    expect(result.kind).toBe("validation_error")
    if (result.kind === "validation_error") {
      expect(result.issues.map((issue) => issue.path.join("."))).toContain(
        "dataUrl"
      )
    }
  })

  it("rejects draft requests with more than four image assets", () => {
    // Given: a draft request includes five otherwise valid image assets.
    const imageAssets = Array.from({ length: 5 }, (_value, index) =>
      imageAssetPayload({ id: `asset-${index}`, name: `image-${index}.png` })
    )
    const result = parseRoutePayload(postDraftRequestSchema, {
      imageAssets,
      ownerIntent: "이번 주말 브런치 신메뉴 홍보",
      storeId: "demo-store",
      targetChannel: "GBP",
    })

    // When: the route boundary parses the draft request.
    // Then: validation preserves the maximum of four images.
    expect(result.kind).toBe("validation_error")
    if (result.kind === "validation_error") {
      expect(result.issues.map((issue) => issue.path.join("."))).toContain(
        "imageAssets"
      )
    }
  })
})
