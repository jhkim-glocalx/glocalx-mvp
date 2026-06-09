import { describe, expect, it } from "vitest"

import { createIntegrationAdapters } from "./index"
import {
  buildGoogleLocationCreateRequest,
  buildGoogleLocationSearchRequest,
  buildGoogleLocationValidationRequest,
  buildNaverLocalSearchRequest,
} from "./production"

const productionEnv = {
  APP_INTEGRATION_MODE: "production",
  NAVER_CLIENT_ID: "test-naver-client",
  NAVER_CLIENT_SECRET: "test-naver-secret",
  GOOGLE_CLIENT_ID: "test-google-client",
  GOOGLE_CLIENT_SECRET: "test-google-secret",
} as const

function responseWithUrl(body: string, url: string): Response {
  const response = new Response(body)
  Object.defineProperty(response, "url", { value: url })
  return response
}

function naverPlaceDetailHtml(detail: Record<string, unknown>): string {
  return `<html><body><script>window.__APOLLO_STATE__ = ${JSON.stringify({
    PlaceSummary: detail,
  })};</script></body></html>`
}

describe("production request specs", () => {
  it("builds the exact Naver local search request", () => {
    const result = buildNaverLocalSearchRequest(productionEnv, {
      query: "브런치모먼트",
      display: 5,
    })

    expect(result).toEqual({
      method: "GET",
      url: "https://openapi.naver.com/v1/search/local.json?query=%EB%B8%8C%EB%9F%B0%EC%B9%98%EB%AA%A8%EB%A8%BC%ED%8A%B8&display=5&start=1&sort=random",
      headers: {
        "X-Naver-Client-Id": "test-naver-client",
        "X-Naver-Client-Secret": "test-naver-secret",
      },
    })
  })

  it("resolves direct Naver place links through the Place detail page", async () => {
    const requestedUrls: string[] = []
    const adapters = createIntegrationAdapters({
      env: productionEnv,
      fetchImpl: async (url) => {
        requestedUrls.push(url)
        return new Response(
          naverPlaceDetailHtml({
            name: "라멘하우스 합정점",
            roadAddress: "서울 마포구 양화로 19",
            categoryName: "음식점>일식>라멘",
            phone: "02-111-2222",
            businessHours: ["월 11:00 - 21:00"],
          })
        )
      },
    })

    const result = await adapters.naverSearch.searchLocal({
      query: "p/entry/place/123",
      display: 5,
      rawInput: "https://map.naver.com/p/entry/place/123",
    })

    expect(requestedUrls).toEqual([
      "https://pcmap.place.naver.com/place/123/home",
    ])
    expect(result).toMatchObject({
      kind: "ok",
      value: {
        candidates: [
          {
            source: "NAVER_LOCAL",
            sourceInput: "https://map.naver.com/p/entry/place/123",
            name: "라멘하우스 합정점",
            address: "서울 마포구 양화로 19",
            category: "음식점>일식>라멘",
            phone: "02-111-2222",
            hours: "월 11:00 - 21:00",
            naverPlaceUrl: "https://map.naver.com/p/entry/place/123",
            missingFields: [],
          },
        ],
      },
    })
  })

  it("resolves Naver short links before reading Place details", async () => {
    const requestedUrls: string[] = []
    const adapters = createIntegrationAdapters({
      env: productionEnv,
      fetchImpl: async (url) => {
        requestedUrls.push(url)
        if (url === "https://naver.me/ramenhouse") {
          return responseWithUrl(
            "",
            "https://map.naver.com/p/entry/place/456?placePath=%2Fhome"
          )
        }

        return new Response(
          naverPlaceDetailHtml({
            businessName: "라멘하우스 연남점",
            address: "서울 마포구 연남로 45",
            category: "라멘",
          })
        )
      },
    })

    const result = await adapters.naverSearch.searchLocal({
      query: "ramenhouse",
      display: 5,
      rawInput: "https://naver.me/ramenhouse",
    })

    expect(requestedUrls).toEqual([
      "https://naver.me/ramenhouse",
      "https://pcmap.place.naver.com/place/456/home",
    ])
    expect(result).toMatchObject({
      kind: "ok",
      value: {
        candidates: [
          {
            sourceInput: "https://naver.me/ramenhouse",
            name: "라멘하우스 연남점",
            address: "서울 마포구 연남로 45",
            category: "라멘",
            naverPlaceUrl: "https://map.naver.com/p/entry/place/456",
            missingFields: ["phone", "hours"],
          },
        ],
      },
    })
  })

  it("normalizes the official Naver local search response", async () => {
    const adapters = createIntegrationAdapters({
      env: productionEnv,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                title: "<b>라멘하우스</b> 합정점",
                link: "https://map.naver.com/p/entry/place/123",
                category: "음식점>일식>라멘",
                telephone: "",
                address: "서울 마포구 합정동 1",
                roadAddress: "서울 마포구 양화로 19",
                mapx: "126914941",
                mapy: "37550452",
              },
            ],
          })
        ),
    })

    const result = await adapters.naverSearch.searchLocal({
      query: "라멘하우스",
      display: 5,
      rawInput: "라멘하우스",
    })

    expect(result).toMatchObject({
      kind: "ok",
      value: {
        candidates: [
          {
            source: "NAVER_LOCAL",
            sourceInput: "라멘하우스",
            name: "라멘하우스 합정점",
            address: "서울 마포구 양화로 19",
            category: "음식점>일식>라멘",
            naverPlaceUrl: "https://map.naver.com/p/entry/place/123",
            missingFields: ["phone", "hours"],
          },
        ],
      },
    })
  })

  it("builds exact Google GBP request specs", async () => {
    const adapters = createIntegrationAdapters({ env: productionEnv })

    const location = { title: "브런치모먼트 홍대점" }

    expect(
      buildGoogleLocationSearchRequest({
        accessToken: "test-access-token",
        location,
      })
    ).toEqual({
      method: "POST",
      url: "https://mybusinessbusinessinformation.googleapis.com/v1/googleLocations:search",
      headers: { Authorization: "Bearer test-access-token" },
      requiredScopes: ["https://www.googleapis.com/auth/business.manage"],
      body: { location },
    })

    expect(
      buildGoogleLocationValidationRequest({
        accessToken: "test-access-token",
        accountName: "accounts/123",
        requestId: "request-123",
        location,
      })
    ).toEqual({
      method: "POST",
      url: "https://mybusinessbusinessinformation.googleapis.com/v1/accounts/123/locations?requestId=request-123&validateOnly=true",
      headers: { Authorization: "Bearer test-access-token" },
      requiredScopes: ["https://www.googleapis.com/auth/business.manage"],
      body: location,
    })

    expect(
      buildGoogleLocationCreateRequest({
        accessToken: "test-access-token",
        accountName: "accounts/123",
        requestId: "request-123",
        location,
      })
    ).toEqual({
      method: "POST",
      url: "https://mybusinessbusinessinformation.googleapis.com/v1/accounts/123/locations?requestId=request-123&validateOnly=false",
      headers: { Authorization: "Bearer test-access-token" },
      requiredScopes: ["https://www.googleapis.com/auth/business.manage"],
      body: location,
    })

    await expect(
      adapters.gbpBusinessInformation.createLocation({
        accessToken: "test-access-token",
        accountName: "accounts/123",
        requestId: "request-123",
        location,
      })
    ).resolves.toEqual({
      kind: "ok",
      value: {
        method: "POST",
        url: "https://mybusinessbusinessinformation.googleapis.com/v1/accounts/123/locations?requestId=request-123&validateOnly=false",
        headers: { Authorization: "Bearer test-access-token" },
        requiredScopes: ["https://www.googleapis.com/auth/business.manage"],
        body: location,
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
