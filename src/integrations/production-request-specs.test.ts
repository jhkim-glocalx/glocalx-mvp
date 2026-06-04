import { describe, expect, it } from "vitest"

import { createIntegrationAdapters } from "./index"

const productionEnv = {
  APP_INTEGRATION_MODE: "production",
  NAVER_CLIENT_ID: "test-naver-client",
  NAVER_CLIENT_SECRET: "test-naver-secret",
  GOOGLE_CLIENT_ID: "test-google-client",
  GOOGLE_CLIENT_SECRET: "test-google-secret",
} as const

describe("production request specs", () => {
  it("builds the exact Naver local search request", () => {
    const adapters = createIntegrationAdapters({ env: productionEnv })

    const result = adapters.naverSearch.searchLocal({
      query: "브런치모먼트",
      display: 5,
    })

    expect(result).toEqual({
      kind: "ok",
      value: {
        method: "GET",
        url: "https://openapi.naver.com/v1/search/local.json?query=%EB%B8%8C%EB%9F%B0%EC%B9%98%EB%AA%A8%EB%A8%BC%ED%8A%B8&display=5&start=1&sort=random",
        headers: {
          "X-Naver-Client-Id": "test-naver-client",
          "X-Naver-Client-Secret": "test-naver-secret",
        },
      },
    })
  })

  it("builds exact Google GBP request specs", () => {
    const adapters = createIntegrationAdapters({ env: productionEnv })

    expect(
      adapters.gbpBusinessInformation.createLocation({
        accessToken: "test-access-token",
        accountName: "accounts/123",
        requestId: "request-123",
        location: { title: "브런치모먼트 홍대점" },
      })
    ).toEqual({
      kind: "ok",
      value: {
        method: "POST",
        url: "https://mybusinessbusinessinformation.googleapis.com/v1/accounts/123/locations?requestId=request-123&validateOnly=false",
        headers: { Authorization: "Bearer test-access-token" },
        requiredScopes: ["https://www.googleapis.com/auth/business.manage"],
        body: { title: "브런치모먼트 홍대점" },
      },
    })

    expect(
      adapters.gbpLocalPosts.createLocalPost({
        accessToken: "test-access-token",
        parent: "accounts/123/locations/456",
        summary: "주말 브런치 신메뉴",
      })
    ).toEqual({
      kind: "ok",
      value: {
        method: "POST",
        url: "https://mybusiness.googleapis.com/v4/accounts/123/locations/456/localPosts",
        headers: { Authorization: "Bearer test-access-token" },
        requiredScopes: ["https://www.googleapis.com/auth/business.manage"],
        body: { summary: "주말 브런치 신메뉴" },
      },
    })

    expect(
      adapters.gbpReviews.listReviews({
        accessToken: "test-access-token",
        parent: "accounts/123/locations/456",
        pageSize: 50,
        pageToken: "next-page",
      })
    ).toEqual({
      kind: "ok",
      value: {
        method: "GET",
        url: "https://mybusiness.googleapis.com/v4/accounts/123/locations/456/reviews?pageSize=50&pageToken=next-page&orderBy=updateTime+desc",
        headers: { Authorization: "Bearer test-access-token" },
        requiredScopes: ["https://www.googleapis.com/auth/business.manage"],
      },
    })

    expect(
      adapters.gbpReviews.updateReply({
        accessToken: "test-access-token",
        reviewName: "accounts/123/locations/456/reviews/789",
        comment: "감사합니다.",
      })
    ).toEqual({
      kind: "ok",
      value: {
        method: "PUT",
        url: "https://mybusiness.googleapis.com/v4/accounts/123/locations/456/reviews/789/reply",
        headers: { Authorization: "Bearer test-access-token" },
        requiredScopes: ["https://www.googleapis.com/auth/business.manage"],
        body: { comment: "감사합니다." },
      },
    })
  })
})
