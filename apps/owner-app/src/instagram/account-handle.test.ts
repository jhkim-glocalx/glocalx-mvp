import { describe, expect, it } from "vitest"

import {
  compareInstagramHandles,
  normalizeInstagramHandle,
} from "./account-handle"

describe("normalizeInstagramHandle", () => {
  it("keeps a bare handle as-is", () => {
    expect(normalizeInstagramHandle("bar_seomyeon")).toBe("bar_seomyeon")
  })

  it("ignores the leading @, surrounding space, and letter case", () => {
    // Owners type this on a phone keyboard that capitalizes the first letter.
    expect(normalizeInstagramHandle("  @Bar_Seomyeon ")).toBe("bar_seomyeon")
  })

  it("returns an empty handle when the owner did not really answer", () => {
    expect(normalizeInstagramHandle("")).toBe("")
    expect(normalizeInstagramHandle("@")).toBe("")
  })

  it("reads the handle out of a pasted profile URL", () => {
    // Instagram's share sheet is where most owners copy their account name
    // from, so a pasted link must not read as somebody else's account.
    expect(
      normalizeInstagramHandle("https://www.instagram.com/bar_seomyeon/")
    ).toBe("bar_seomyeon")
    expect(
      normalizeInstagramHandle("instagram.com/bar_seomyeon?igsh=abc123")
    ).toBe("bar_seomyeon")
  })

  it("names no account for a pasted post, reel, or story link", () => {
    // The first path segment here is Instagram's own, not a handle — better to
    // say nothing than to store "p" as the owner's account.
    expect(normalizeInstagramHandle("https://instagram.com/p/Cxyz123/")).toBe(
      ""
    )
    expect(normalizeInstagramHandle("instagram.com/reel/Cxyz123")).toBe("")
  })

  it("ignores a look-alike host", () => {
    expect(normalizeInstagramHandle("evilinstagram.com/bar_seomyeon")).toBe("")
  })

  it("returns an empty handle for text that is not a handle at all", () => {
    expect(normalizeInstagramHandle("몰라요")).toBe("")
    expect(normalizeInstagramHandle("bar seomyeon")).toBe("")
  })
})

describe("compareInstagramHandles", () => {
  it("matches handles that differ only in how they were typed", () => {
    expect(compareInstagramHandles("@Bar_Seomyeon", "bar_seomyeon")).toBe(
      "match"
    )
  })

  it("reports a mismatch between two real, different accounts", () => {
    expect(compareInstagramHandles("bar_seomyeon", "cafe_haeundae")).toBe(
      "mismatch"
    )
  })

  it("stays silent when either side is missing", () => {
    // Nothing to compare is not the same as a wrong account — the owner is
    // never warned on the strength of an absent answer.
    expect(compareInstagramHandles(undefined, "bar_seomyeon")).toBe("unknown")
    expect(compareInstagramHandles("bar_seomyeon", undefined)).toBe("unknown")
    expect(compareInstagramHandles("", "")).toBe("unknown")
  })
})
