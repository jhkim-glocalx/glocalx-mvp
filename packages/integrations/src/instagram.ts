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
// The Instagram API with Instagram Login publishes on graph.instagram.com — not
// the Facebook-login graph.facebook.com path. The request shape is identical
// (/{ig-user-id}/media -> /media_publish), but the token is an Instagram user
// access token (from Instagram business login, instagram_business_content_publish
// permission) and the account id/token come from INSTAGRAM_ACCESS_TOKEN /
// INSTAGRAM_USER_ID or the per-store account, not a Facebook Page token.
const graphApiVersion = "v24.0"
const graphBaseUrl = `https://graph.instagram.com/${graphApiVersion}`
const idResponseSchema = z.object({ id: z.string().min(1) }).passthrough()
const permalinkResponseSchema = z.object({ permalink: z.url() }).passthrough()
const containerStatusSchema = z
  .object({ status_code: z.string().min(1) })
  .passthrough()

// A container is not ready the moment Meta returns its id: Meta then downloads
// our image and only afterwards flips status_code to FINISHED. media_publish on
// a container in any other state is rejected with a bare 400.
//
// This is not defensive coding — it is the fix for a real failure. On
// 2026-08-13 a two-channel campaign publish settled as partially_published:
// Google took the post, Instagram returned 400. The stored OAuth token, the
// signed image URL, the caption and the single asset were each later replayed
// against live Meta and all accepted, and the account's quota showed no publish
// had landed. The one difference from the smoke script that DID publish the same
// image was that the smoke polled the container to FINISHED first.
const containerReadyTimeoutMs = 25_000
const containerPollIntervalMs = 1_000

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
    // Meta's body carries the only actionable detail — "Media download failed"
    // (it could not read our image URL) reads nothing like an aspect-ratio
    // rejection or a missing scope, yet all three arrive as HTTP 400. Without
    // it a production failure is undiagnosable: campaign-publish.ts logs this
    // message and shows the operator a generic "the channel rejected it".
    // Safe to include — the response never echoes the access token, which
    // travels in the request body.
    const detail = await response.text().catch(() => "")
    throw new Error(
      `Instagram publishing failed with ${response.status}.` +
        (detail === "" ? "" : ` ${detail.slice(0, 500)}`)
    )
  }
  return response.json()
}

/**
 * Blocks until Meta has finished building a container, so it is safe to publish
 * or to reference as a carousel child.
 *
 * Terminal states other than FINISHED (ERROR, EXPIRED) throw rather than
 * looping: they never become FINISHED, and the operator needs to know the media
 * was rejected instead of watching a publish sit there until it times out.
 */
async function awaitContainerReady(options: {
  readonly accessToken: string
  readonly containerId: string
  readonly fetchImpl: ExternalFetch
}): Promise<void> {
  const deadline = Date.now() + containerReadyTimeoutMs
  for (;;) {
    const statusUrl = new URL(`${graphBaseUrl}/${options.containerId}`)
    statusUrl.searchParams.set("fields", "status_code")
    statusUrl.searchParams.set("access_token", options.accessToken)
    const response = await options.fetchImpl(statusUrl.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) {
      throw new Error(
        `Instagram container status read failed with ${response.status}.`
      )
    }
    const statusCode = containerStatusSchema.parse(
      await response.json()
    ).status_code
    if (statusCode === "FINISHED") {
      return
    }
    if (statusCode !== "IN_PROGRESS") {
      throw new Error(
        `Instagram could not build the media container (${statusCode}).`
      )
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Instagram did not finish the media container within ${
          containerReadyTimeoutMs / 1000
        }s.`
      )
    }
    await new Promise((resolve) => setTimeout(resolve, containerPollIntervalMs))
  }
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
  const containerId = idResponseSchema.parse(payload).id
  // A child is about to be named in the carousel's children list, and Meta
  // validates those ids when the parent is created — so the same wait the
  // published container needs applies here.
  await awaitContainerReady({
    accessToken: options.accessToken,
    containerId,
    fetchImpl: options.fetchImpl,
  })
  return containerId
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

      await awaitContainerReady({
        accessToken,
        containerId: creationId,
        fetchImpl,
      })

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
