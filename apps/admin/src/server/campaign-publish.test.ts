import { describe, expect, it } from "vitest"

import { instagramCaption, instagramCaptionMaxLength } from "./campaign-publish"

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
