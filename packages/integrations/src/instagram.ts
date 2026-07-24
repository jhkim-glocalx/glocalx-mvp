import { z } from "zod"

import { blockedByCredentials, missingEnvVars } from "./credentials"
import type {
  AdapterEnvironment,
  ExternalFetch,
  InstagramPostsAdapter,
} from "./contracts"

const instagramEnvVars = [
  "INSTAGRAM_ACCESS_TOKEN",
  "INSTAGRAM_USER_ID",
] as const
const graphApiVersion = "v24.0"
const graphBaseUrl = `https://graph.facebook.com/${graphApiVersion}`
const idResponseSchema = z.object({ id: z.string().min(1) }).passthrough()
const permalinkResponseSchema = z.object({ permalink: z.url() }).passthrough()

async function graphRequest(
  fetchImpl: ExternalFetch,
  url: string,
  body: URLSearchParams
): Promise<unknown> {
  const response = await fetchImpl(url, {
    body: body.toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) {
    throw new Error(`Instagram publishing failed with ${response.status}.`)
  }
  return response.json()
}

async function createImageContainer(options: {
  readonly accessToken: string
  readonly fetchImpl: ExternalFetch
  readonly igUserId: string
  readonly imageUrl: string
  readonly isCarouselItem: boolean
}): Promise<string> {
  const body = new URLSearchParams({
    access_token: options.accessToken,
    image_url: options.imageUrl,
  })
  if (options.isCarouselItem) {
    body.set("is_carousel_item", "true")
  }
  const payload = await graphRequest(
    options.fetchImpl,
    `${graphBaseUrl}/${options.igUserId}/media`,
    body
  )
  return idResponseSchema.parse(payload).id
}

export function createStubInstagramPosts(): InstagramPostsAdapter {
  return {
    async createPost() {
      return {
        kind: "ok",
        value: {
          externalPostId: "stub-instagram-media",
          publicUrl: "https://www.instagram.com/p/stub-instagram-media/",
        },
      }
    },
  }
}

export function createProductionInstagramPosts(
  env: AdapterEnvironment,
  fetchImpl: ExternalFetch
): InstagramPostsAdapter {
  return {
    async createPost(input) {
      // A per-store account carries its own token, so the global env pair is
      // only required when the caller didn't supply one.
      const missing =
        input.account === undefined ? missingEnvVars(env, instagramEnvVars) : []
      if (missing.length > 0) {
        return blockedByCredentials(missing)
      }
      if (input.mediaUrls.length === 0 || input.mediaUrls.length > 10) {
        throw new Error(
          "Instagram publishing requires between 1 and 10 images."
        )
      }

      const accessToken =
        input.account?.accessToken ?? env["INSTAGRAM_ACCESS_TOKEN"] ?? ""
      const igUserId =
        input.account?.accountRef ?? env["INSTAGRAM_USER_ID"] ?? ""
      let creationId: string
      if (input.mediaUrls.length === 1) {
        const imageUrl = input.mediaUrls[0]
        if (imageUrl === undefined) {
          throw new Error("Instagram image URL is missing.")
        }
        const body = new URLSearchParams({
          access_token: accessToken,
          caption: input.caption,
          image_url: imageUrl,
        })
        creationId = idResponseSchema.parse(
          await graphRequest(
            fetchImpl,
            `${graphBaseUrl}/${igUserId}/media`,
            body
          )
        ).id
      } else {
        const children = await Promise.all(
          input.mediaUrls.map((imageUrl) =>
            createImageContainer({
              accessToken,
              fetchImpl,
              igUserId,
              imageUrl,
              isCarouselItem: true,
            })
          )
        )
        const body = new URLSearchParams({
          access_token: accessToken,
          caption: input.caption,
          children: children.join(","),
          media_type: "CAROUSEL",
        })
        creationId = idResponseSchema.parse(
          await graphRequest(
            fetchImpl,
            `${graphBaseUrl}/${igUserId}/media`,
            body
          )
        ).id
      }

      const publishBody = new URLSearchParams({
        access_token: accessToken,
        creation_id: creationId,
      })
      const publishedId = idResponseSchema.parse(
        await graphRequest(
          fetchImpl,
          `${graphBaseUrl}/${igUserId}/media_publish`,
          publishBody
        )
      ).id
      const permalinkUrl = new URL(`${graphBaseUrl}/${publishedId}`)
      permalinkUrl.searchParams.set("fields", "permalink")
      permalinkUrl.searchParams.set("access_token", accessToken)
      const permalinkResponse = await fetchImpl(permalinkUrl.toString(), {
        method: "GET",
        signal: AbortSignal.timeout(20_000),
      })
      if (!permalinkResponse.ok) {
        throw new Error(
          `Instagram permalink lookup failed with ${permalinkResponse.status}.`
        )
      }
      const permalink = permalinkResponseSchema.parse(
        await permalinkResponse.json()
      ).permalink

      return {
        kind: "ok",
        value: { externalPostId: publishedId, publicUrl: permalink },
      }
    },
  }
}
