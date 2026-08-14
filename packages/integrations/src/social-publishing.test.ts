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

  it("sends only the first photo to GBP even when the owner uploaded several", async () => {
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

    await adapters.gbpLocalPosts.createLocalPost({
      accessToken: "owner-google-token",
      mediaUrls: [
        "https://app.example.com/media/food-1.jpg",
        "https://app.example.com/media/food-2.jpg",
        "https://app.example.com/media/food-3.jpg",
      ],
      parent: "accounts/123/locations/456",
      summary: "오늘의 구이 메뉴",
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://mybusiness.googleapis.com/v4/accounts/123/locations/456/localPosts",
      expect.objectContaining({
        body: JSON.stringify({
          languageCode: "ko",
          media: [
            {
              mediaFormat: "PHOTO",
              sourceUrl: "https://app.example.com/media/food-1.jpg",
            },
          ],
          summary: "오늘의 구이 메뉴",
          topicType: "STANDARD",
        }),
      })
    )
  })
})

// Publishing walks a graph of calls whose ORDER matters — a container must be
// FINISHED before it is published — so the fake answers by request rather than
// by position, and records the sequence for the order assertions to read.
function createInstagramFetch(options?: {
  readonly statuses?: readonly string[]
}) {
  const statuses = [...(options?.statuses ?? [])]
  const calls: string[] = []
  let containerCount = 0
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "GET") {
      const target = new URL(url)
      if (target.searchParams.get("fields") === "status_code") {
        const containerId = target.pathname.split("/").pop() ?? ""
        calls.push(`status:${containerId}`)
        return Response.json({ status_code: statuses.shift() ?? "FINISHED" })
      }
      calls.push("permalink")
      return Response.json({
        permalink: "https://www.instagram.com/p/published-media/",
      })
    }
    const body = new URLSearchParams(String(init?.body))
    if (url.endsWith("/media_publish")) {
      calls.push(`publish:${body.get("creation_id")}`)
      return Response.json({ id: "published-media" })
    }
    containerCount += 1
    const id =
      body.get("media_type") === "CAROUSEL"
        ? "carousel-container"
        : `container-${containerCount}`
    calls.push(`create:${id}`)
    return Response.json({ id })
  })
  return { calls, fetchImpl }
}

describe("production Instagram publishing", () => {
  it("publishes one Instagram image and resolves its permalink", async () => {
    const { calls, fetchImpl } = createInstagramFetch()
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
        externalPostId: "published-media",
        publicUrl: "https://www.instagram.com/p/published-media/",
      },
    })
    // The container is confirmed FINISHED before it is published: publishing an
    // unfinished container is what Meta answers with a bare 400.
    expect(calls).toEqual([
      "create:container-1",
      "status:container-1",
      "publish:container-1",
      "permalink",
    ])
  })

  it("waits for a container that is still building before publishing", async () => {
    vi.useFakeTimers()
    try {
      const { calls, fetchImpl } = createInstagramFetch({
        statuses: ["IN_PROGRESS", "IN_PROGRESS", "FINISHED"],
      })
      const adapters = createIntegrationAdapters({
        env: productionEnv,
        fetchImpl,
      })

      const pending = adapters.instagramPosts.createPost({
        caption: "아직 처리 중인 사진",
        mediaUrls: ["https://app.example.com/media/slow.jpg"],
      } as never)
      await vi.advanceTimersByTimeAsync(5_000)

      await expect(pending).resolves.toMatchObject({ kind: "ok" })
      expect(calls).toEqual([
        "create:container-1",
        "status:container-1",
        "status:container-1",
        "status:container-1",
        "publish:container-1",
        "permalink",
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it("fails a publish whose container Meta could not build", async () => {
    const { calls, fetchImpl } = createInstagramFetch({ statuses: ["ERROR"] })
    const adapters = createIntegrationAdapters({
      env: productionEnv,
      fetchImpl,
    })

    await expect(
      adapters.instagramPosts.createPost({
        caption: "받을 수 없는 사진",
        mediaUrls: ["https://app.example.com/media/broken.jpg"],
      } as never)
    ).rejects.toThrow(/could not build the media container \(ERROR\)/)
    // ERROR is terminal, so it must never reach media_publish.
    expect(calls).toEqual(["create:container-1", "status:container-1"])
  })

  it("creates child containers before an Instagram carousel", async () => {
    const { calls, fetchImpl } = createInstagramFetch()
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
      value: { externalPostId: "published-media" },
    })
    // Every child is FINISHED before the parent names it, and the parent is
    // FINISHED before it is published.
    expect(calls).toEqual([
      "create:container-1",
      "create:container-2",
      "status:container-1",
      "status:container-2",
      "create:carousel-container",
      "status:carousel-container",
      "publish:carousel-container",
      "permalink",
    ])
    const carouselCall = fetchImpl.mock.calls.find(
      ([, init]) =>
        new URLSearchParams(String(init?.body)).get("media_type") === "CAROUSEL"
    )
    const carouselBody = new URLSearchParams(String(carouselCall?.[1]?.body))
    expect(carouselBody.get("children")).toBe("container-1,container-2")
  })
})
