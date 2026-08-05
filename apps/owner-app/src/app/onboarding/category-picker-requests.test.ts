import { afterEach, describe, expect, it, vi } from "vitest"

import {
  requestCategoryInitialState,
  requestCategorySearch,
  saveCategorySelection,
} from "./category-picker-requests"

function mockFetchOnce(body: unknown, init?: { ok?: boolean }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: init?.ok ?? true,
      json: async () => body,
    }))
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("requestCategoryInitialState", () => {
  it("parses the selected category and suggestions", async () => {
    mockFetchOnce({
      selected: { categoryId: "categories/gcid:cafe", displayName: "카페" },
      suggestions: [
        { categoryId: "categories/gcid:cafe", displayName: "카페" },
      ],
    })

    const result = await requestCategoryInitialState()

    expect(result.selected).toEqual({
      categoryId: "categories/gcid:cafe",
      displayName: "카페",
    })
    expect(result.suggestions).toHaveLength(1)
  })

  it("degrades to empty suggestions on a malformed response", async () => {
    mockFetchOnce({ unexpected: true })

    const result = await requestCategoryInitialState()

    expect(result).toEqual({ suggestions: [] })
  })
})

describe("requestCategorySearch", () => {
  it("sends the query and returns matches", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      void input
      return {
        ok: true,
        json: async () => ({
          matches: [
            { categoryId: "categories/gcid:cafe", displayName: "카페" },
          ],
        }),
      }
    })
    vi.stubGlobal("fetch", fetchMock)

    const matches = await requestCategorySearch("카페")

    expect(matches).toHaveLength(1)
    const calledUrl = String(fetchMock.mock.calls[0]?.[0])
    expect(calledUrl).toContain("/api/gbp/category?")
    expect(calledUrl).toContain("q=")
  })
})

describe("saveCategorySelection", () => {
  it("returns the saved category on success", async () => {
    mockFetchOnce({
      status: "SAVED",
      selected: { categoryId: "categories/gcid:cafe", displayName: "카페" },
    })

    const result = await saveCategorySelection("categories/gcid:cafe")

    expect(result).toEqual({
      kind: "saved",
      selected: { categoryId: "categories/gcid:cafe", displayName: "카페" },
    })
  })

  it("returns an error for a non-ok response", async () => {
    mockFetchOnce({ status: "STORE_NOT_FOUND" }, { ok: false })

    const result = await saveCategorySelection("categories/gcid:cafe")

    expect(result).toEqual({ kind: "error" })
  })

  it("returns an error when the server did not confirm SAVED", async () => {
    mockFetchOnce({ status: "UNKNOWN_CATEGORY" })

    const result = await saveCategorySelection("categories/gcid:whatever")

    expect(result).toEqual({ kind: "error" })
  })
})
