import type { CompletePublishJobInput } from "@glocalx/db/support/publish-job-store"
import { describe, expect, it } from "vitest"

import {
  instagramCaption,
  instagramCaptionMaxLength,
  runCampaignPublish,
} from "./campaign-publish"

// Instagram has no button, so a campaign's call to action has to survive as
// text. What these pin down is which half loses when the two do not both fit:
// the link always survives, the copy is what gets trimmed.
describe("instagramCaption", () => {
  it("appends the labelled link below the copy", () => {
    expect(
      instagramCaption("Brunch is back — every Saturday from 10am.", {
        actionType: "ORDER",
        url: "https://example.com/order",
      })
    ).toBe(
      "Brunch is back — every Saturday from 10am.\n\n주문: https://example.com/order"
    )
  })

  it("leaves the copy untouched when there is no button", () => {
    expect(instagramCaption("Brunch is back.", null)).toBe("Brunch is back.")
  })

  // CALL carries no url, so there is nothing to append — the caption must not
  // grow a label pointing at a phone number it cannot show.
  it("leaves the copy untouched for CALL", () => {
    expect(instagramCaption("Brunch is back.", { actionType: "CALL" })).toBe(
      "Brunch is back."
    )
  })

  it("drops the blank line when there is no copy to separate", () => {
    expect(
      instagramCaption("", { actionType: "BOOK", url: "https://example.com" })
    ).toBe("예약: https://example.com")
  })

  it("trims the copy, never the link, when the two exceed the ceiling", () => {
    const url = "https://example.com/order"
    const caption = instagramCaption("a".repeat(instagramCaptionMaxLength), {
      actionType: "ORDER",
      url,
    })

    expect(caption).toHaveLength(instagramCaptionMaxLength)
    expect(caption.endsWith(`주문: ${url}`)).toBe(true)
  })

  it("truncates a buttonless caption to the ceiling", () => {
    expect(
      instagramCaption("a".repeat(instagramCaptionMaxLength + 300), null)
    ).toHaveLength(instagramCaptionMaxLength)
  })

  // Pathological: a url that alone outruns the whole budget. Shipping the link
  // alone is still better than a truncated link glued to surviving copy, which
  // would read as a working link and go nowhere.
  it("ships the link alone when it cannot fit beside any copy", () => {
    const caption = instagramCaption("Brunch is back.", {
      actionType: "ORDER",
      url: `https://example.com/${"a".repeat(instagramCaptionMaxLength)}`,
    })

    expect(caption).toHaveLength(instagramCaptionMaxLength)
    expect(caption.startsWith("주문: https://example.com/")).toBe(true)
    expect(caption).not.toContain("Brunch")
  })
})

// Both channels report where the post went live — Instagram a permalink, Google
// a searchUrl — and both values were being dropped on the floor, leaving the
// operator a bare post id they could not open. These pin the value to the job.
describe("runCampaignPublish external urls", () => {
  const gbpPost = {
    externalPostId: "accounts/1/locations/2/localPosts/3",
    publicUrl: "https://www.google.com/search?kgmid=post-3",
  }
  const instagramPost = {
    externalPostId: "17919891333204452",
    publicUrl: "https://www.instagram.com/p/DbTEST/",
  }

  function createHarness() {
    const completed: CompletePublishJobInput[] = []
    const publishJobStore = {
      async reservePublishJob(input: { readonly channel: string }) {
        return { kind: "reserved", job: { channel: input.channel } }
      },
      async completePublishJob(input: CompletePublishJobInput) {
        completed.push(input)
        return undefined
      },
      async failPublishJob(input: { readonly error: string }) {
        throw new Error(`unexpected publish failure: ${input.error}`)
      },
    }
    const publishTargetStore = {
      async readGbpPublishParent() {
        return "accounts/1/locations/2"
      },
      async readStoreChannelToken() {
        return { kind: "found", accessToken: "ig-token" }
      },
      async readStoreChannelLink() {
        return { status: "linked", externalAccountRef: "17841441013510719" }
      },
    }
    const orgCredentialStore = {
      async readOrgCredential() {
        // A null expiry never expires, so the gate stays out of the way of what
        // this is actually testing.
        return {
          kind: "found",
          accessToken: "google-org-token",
          expiresAt: null,
        }
      },
    }
    const adapters = {
      mediaStore: {
        async getSignedUrl() {
          return { kind: "ok", value: "https://blob.example.com/a.jpg?sig=1" }
        },
      },
      gbpLocalPosts: {
        async createLocalPost() {
          return { kind: "ok", value: gbpPost }
        },
      },
      instagramPosts: {
        async createPost() {
          return { kind: "ok", value: instagramPost }
        },
      },
    }
    const request = {
      id: "request-1",
      storeId: "store-1",
      finalCopy: "테스트용 게시물입니다",
      callToAction: null,
      assets: [
        { kind: "processed", blobUrl: "https://blob.example.com/a.jpg" },
      ],
    }
    return {
      adapters,
      completed,
      orgCredentialStore,
      publishJobStore,
      publishTargetStore,
      request,
    }
  }

  it("records the url each channel reported for its published post", async () => {
    const harness = createHarness()

    const outcomes = await runCampaignPublish({
      adapters: harness.adapters,
      orgCredentialStore: harness.orgCredentialStore,
      publishJobStore: harness.publishJobStore,
      publishTargetStore: harness.publishTargetStore,
      request: harness.request,
      channels: ["gbp", "instagram"],
      now: new Date("2026-08-14T00:00:00.000Z"),
    } as never)

    expect(outcomes.map((outcome) => outcome.kind)).toEqual([
      "published",
      "published",
    ])
    expect(
      harness.completed.map((input) => [input.channel, input.externalUrl])
    ).toEqual([
      ["gbp", gbpPost.publicUrl],
      ["instagram", instagramPost.publicUrl],
    ])
  })
})
