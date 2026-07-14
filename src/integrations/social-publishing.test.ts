import { describe, expect, it, vi } from "vitest"

import { createIntegrationAdapters } from "./index"

const productionEnv = {
  APP_INTEGRATION_MODE: "production",
  GOOGLE_CLIENT_ID: "google-client",
  GOOGLE_CLIENT_SECRET: "google-secret",
  INSTAGRAM_ACCESS_TOKEN: "instagram-token",
  INSTAGRAM_USER_ID: "17890000000000000",
} as const

describe("production social publishing", () => {
  it("executes a GBP local-post request with public media", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        name: "accounts/123/locations/456/localPosts/789",
        searchUrl: "https://www.google.com/search?kgmid=post-789",
      })
    )
    const adapters = createIntegrationAdapters({
      env: productionEnv,
      fetchImpl,
    })
    const input = {
      accessToken: "owner-google-token",
      mediaUrls: ["https://app.example.com/media/food.jpg"],
      parent: "accounts/123/locations/456",
      summary: "오늘의 구이 메뉴",
    }

    const result = await adapters.gbpLocalPosts.createLocalPost(input)

    expect(result).toEqual({
      kind: "ok",
      value: {
        externalPostId: "accounts/123/locations/456/localPosts/789",
        publicUrl: "https://www.google.com/search?kgmid=post-789",
      },
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://mybusiness.googleapis.com/v4/accounts/123/locations/456/localPosts",
      expect.objectContaining({
        body: JSON.stringify({
          languageCode: "ko",
          media: [{ mediaFormat: "PHOTO", sourceUrl: input.mediaUrls[0] }],
          summary: input.summary,
          topicType: "STANDARD",
        }),
        headers: {
          Authorization: "Bearer owner-google-token",
          "Content-Type": "application/json",
        },
        method: "POST",
      })
    )
  })

  it("publishes one Instagram image and resolves its permalink", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: "container-1" }))
      .mockResolvedValueOnce(Response.json({ id: "media-1" }))
      .mockResolvedValueOnce(
        Response.json({ permalink: "https://www.instagram.com/p/media-1/" })
      )
    const adapters = createIntegrationAdapters({
      env: productionEnv,
      fetchImpl,
    })

    const result = await adapters.instagramPosts.createPost({
      caption: "불판에서 바로 즐기는 고기",
      mediaUrls: ["https://app.example.com/media/grill.jpg"],
    } as never)

    expect(result).toEqual({
      kind: "ok",
      value: {
        externalPostId: "media-1",
        publicUrl: "https://www.instagram.com/p/media-1/",
      },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it("creates child containers before an Instagram carousel", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: "child-1" }))
      .mockResolvedValueOnce(Response.json({ id: "child-2" }))
      .mockResolvedValueOnce(Response.json({ id: "carousel-container" }))
      .mockResolvedValueOnce(Response.json({ id: "carousel-media" }))
      .mockResolvedValueOnce(
        Response.json({
          permalink: "https://www.instagram.com/p/carousel-media/",
        })
      )
    const adapters = createIntegrationAdapters({
      env: productionEnv,
      fetchImpl,
    })

    const result = await adapters.instagramPosts.createPost({
      caption: "두 장의 메뉴 사진",
      mediaUrls: [
        "https://app.example.com/media/one.jpg",
        "https://app.example.com/media/two.jpg",
      ],
    } as never)

    expect(result).toMatchObject({
      kind: "ok",
      value: { externalPostId: "carousel-media" },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(5)
    const carouselBody = String(fetchImpl.mock.calls[2]?.[1]?.body)
    expect(new URLSearchParams(carouselBody).get("children")).toBe(
      "child-1,child-2"
    )
    expect(new URLSearchParams(carouselBody).get("media_type")).toBe("CAROUSEL")
  })
})
