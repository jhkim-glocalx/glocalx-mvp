import { describe, expect, it } from "vitest"

import {
  campaignStatusLabel,
  readErrorMessage,
  toCampaignRequestList,
  toCreatedCampaignRequest,
  toUploadTokenResult,
} from "./campaign-model"

describe("campaign-model", () => {
  it("parses a valid request list", () => {
    const list = toCampaignRequestList({
      requests: [
        {
          id: "req_1",
          brief: "Promote brunch",
          status: "submitted",
          createdAt: "2026-07-21T00:00:00.000Z",
          updatedAt: "2026-07-21T00:00:00.000Z",
          assetCount: 2,
        },
      ],
    })
    expect(list).toHaveLength(1)
    expect(list[0]?.assetCount).toBe(2)
  })

  it("drops malformed rows instead of throwing", () => {
    const list = toCampaignRequestList({
      requests: [{ id: "req_1" }, "not-a-record"],
    })
    expect(list).toHaveLength(0)
  })

  it("returns an empty list for a malformed payload", () => {
    expect(toCampaignRequestList(null)).toEqual([])
    expect(toCampaignRequestList({})).toEqual([])
  })

  it("parses a created request id", () => {
    const result = toCreatedCampaignRequest({ request: { id: "req_1" } })
    expect(result).toEqual({ id: "req_1" })
  })

  it("returns undefined for a malformed created-request payload", () => {
    expect(
      toCreatedCampaignRequest({ status: "VALIDATION_ERROR" })
    ).toBeUndefined()
  })

  it("parses a stub-mode upload token result", () => {
    const result = toUploadTokenResult({
      mode: "stub",
      uploadToken: "stub_upload_token_1",
      pathname: "stores/store-1/asset-1.jpg",
      blobUrl: "https://stub.blob.glocalx.internal/stores/store-1/asset-1.jpg",
      expiresAt: "2026-07-21T00:15:00.000Z",
    })
    expect(result?.mode).toBe("stub")
  })

  it("rejects an unrecognized mode value", () => {
    expect(
      toUploadTokenResult({
        mode: "not-a-mode",
        uploadToken: "t",
        pathname: "p",
        blobUrl: "https://example.com/p",
      })
    ).toBeUndefined()
  })

  it("reads a route error message with a fallback", () => {
    expect(readErrorMessage({ message: "custom" }, "fallback")).toBe("custom")
    expect(readErrorMessage({}, "fallback")).toBe("fallback")
    expect(readErrorMessage(null, "fallback")).toBe("fallback")
  })

  it("labels known statuses in Korean and passes through unknown ones", () => {
    expect(campaignStatusLabel("submitted")).toBe("제출됨")
    expect(campaignStatusLabel("published")).toBe("게시 완료")
    expect(campaignStatusLabel("unknown_status")).toBe("unknown_status")
  })
})
