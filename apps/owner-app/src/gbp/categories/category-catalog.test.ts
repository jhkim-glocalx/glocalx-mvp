import { describe, expect, it } from "vitest"

import type { GbpCategory } from "./category-catalog"
import {
  deriveNaverCategorySeeds,
  findGbpCategoryById,
  gbpCategoryCatalog,
  isKnownGbpCategoryId,
  rankCategories,
  searchGbpCategories,
  suggestGbpCategoriesFromNaver,
} from "./category-catalog"

const fixture: readonly GbpCategory[] = [
  { categoryId: "categories/gcid:cafe", displayName: "카페" },
  { categoryId: "categories/gcid:cat_cafe", displayName: "고양이 카페" },
  { categoryId: "categories/gcid:cafeteria", displayName: "카페테리아" },
  { categoryId: "categories/gcid:korean_restaurant", displayName: "한식당" },
  { categoryId: "categories/gcid:bakery", displayName: "제과점" },
]

describe("rankCategories", () => {
  it("orders exact match, then prefix, then substring", () => {
    const result = rankCategories(fixture, "카페")

    expect(result.map((category) => category.displayName)).toEqual([
      "카페", // exact
      "카페테리아", // prefix
      "고양이 카페", // substring
    ])
  })

  it("returns nothing for a blank or whitespace query", () => {
    expect(rankCategories(fixture, "")).toEqual([])
    expect(rankCategories(fixture, "   ")).toEqual([])
  })

  it("ignores whitespace and case when matching", () => {
    expect(
      rankCategories(fixture, " 고양이카페 ").map((c) => c.displayName)
    ).toEqual(["고양이 카페"])
  })

  it("honors the result limit", () => {
    expect(rankCategories(fixture, "카페", 2)).toHaveLength(2)
  })
})

describe("deriveNaverCategorySeeds", () => {
  it("splits hierarchical and compound categories most-specific first", () => {
    expect(deriveNaverCategorySeeds("음식점>한식>백반")).toEqual([
      "백반",
      "한식",
      "음식점",
    ])
    expect(deriveNaverCategorySeeds("카페,디저트")).toEqual(["디저트", "카페"])
  })

  it("drops empty tokens", () => {
    expect(deriveNaverCategorySeeds("카페,")).toEqual(["카페"])
  })
})

describe("bundled KR catalog", () => {
  it("loads thousands of well-formed gcid categories", () => {
    const catalog = gbpCategoryCatalog()

    expect(catalog.length).toBeGreaterThan(1000)
    expect(
      catalog.every((category) =>
        category.categoryId.startsWith("categories/gcid:")
      )
    ).toBe(true)
    expect(catalog.every((category) => category.displayName.length > 0)).toBe(
      true
    )
  })

  it("finds real categories by substring and validates their ids", () => {
    const matches = searchGbpCategories("카페")

    expect(matches.length).toBeGreaterThan(0)
    expect(
      matches.every((category) => category.displayName.includes("카페"))
    ).toBe(true)

    const first = matches[0]
    expect(first).toBeDefined()
    if (first !== undefined) {
      expect(isKnownGbpCategoryId(first.categoryId)).toBe(true)
      expect(findGbpCategoryById(first.categoryId)).toEqual(first)
    }
  })

  it("rejects an unknown category id", () => {
    expect(isKnownGbpCategoryId("categories/gcid:not_a_real_category")).toBe(
      false
    )
    expect(
      findGbpCategoryById("categories/gcid:not_a_real_category")
    ).toBeUndefined()
  })

  it("suggests categories from a Naver compound category", () => {
    const suggestions = suggestGbpCategoriesFromNaver("카페,디저트")

    expect(suggestions.length).toBeGreaterThan(0)
  })
})
