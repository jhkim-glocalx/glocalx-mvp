import { describe, expect, it } from "vitest"

import {
  callToActionCaptionSuffix,
  gbpPostCallToActionSchema,
  resolveDefaultCallToAction,
} from "./gbp-post-cta"

describe("gbpPostCallToActionSchema", () => {
  it("accepts a link action carrying a url", () => {
    const parsed = gbpPostCallToActionSchema.parse({
      actionType: "ORDER",
      url: "https://example.com/order",
    })

    expect(parsed).toEqual({
      actionType: "ORDER",
      url: "https://example.com/order",
    })
  })

  it("accepts CALL with no url", () => {
    expect(gbpPostCallToActionSchema.parse({ actionType: "CALL" })).toEqual({
      actionType: "CALL",
    })
  })

  // CALL renders the listing's phone number and Google ignores any link sent
  // with it, so accepting one would let an operator believe a url is live.
  it("rejects CALL carrying a url", () => {
    expect(() =>
      gbpPostCallToActionSchema.parse({
        actionType: "CALL",
        url: "https://example.com",
      })
    ).toThrow()
  })

  it("rejects a link action without a url", () => {
    expect(() =>
      gbpPostCallToActionSchema.parse({ actionType: "LEARN_MORE" })
    ).toThrow()
  })
})

describe("callToActionCaptionSuffix", () => {
  it("renders a labelled link for each link action", () => {
    expect(
      callToActionCaptionSuffix({
        actionType: "ORDER",
        url: "https://baemin.example/store",
      })
    ).toBe("주문: https://baemin.example/store")
    expect(
      callToActionCaptionSuffix({
        actionType: "BOOK",
        url: "https://booking.example",
      })
    ).toBe("예약: https://booking.example")
  })

  // Nothing to append — CALL has no url, and a label with no number would send
  // the reader hunting for a phone the caption cannot provide.
  it("returns nothing for CALL", () => {
    expect(callToActionCaptionSuffix({ actionType: "CALL" })).toBeUndefined()
  })
})

describe("resolveDefaultCallToAction", () => {
  // Pins the current product policy: posts carry no button unless an operator
  // picks one. If automation later derives a default from the store's links,
  // this test is the thing that should fail and be rewritten deliberately.
  it("returns no button even when the store has every link", () => {
    expect(
      resolveDefaultCallToAction({
        orderUrl: "https://example.com/order",
        bookingUrl: "https://example.com/book",
        websiteUrl: "https://example.com",
        hasPhone: true,
      })
    ).toBeUndefined()
  })
})
