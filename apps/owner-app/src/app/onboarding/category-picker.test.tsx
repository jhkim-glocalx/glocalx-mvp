import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { CategoryPicker } from "./category-picker"

// Effects (the fetch that loads suggestions/selection) do not run during static
// render, so this pins the initial, pre-fetch markup the owner first sees.
describe("CategoryPicker initial render", () => {
  it("renders the search input and the pre-selection prompt", () => {
    const html = renderToStaticMarkup(<CategoryPicker />)

    expect(html).toContain("Google 업종 카테고리")
    expect(html).toContain('type="search"')
    expect(html).toContain("매장 업종을 검색해서 골라주세요")
  })
})
