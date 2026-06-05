import { describe, expect, it } from "vitest"

import { appShellCopy } from "./app-shell"

describe("appShellCopy", () => {
  it("renders the finalized GlocalX landing copy when the app boots", () => {
    expect(appShellCopy.productName).toBe("GlocalX")
    expect(appShellCopy.initialPrompt).toContain("전 세계")
    expect(appShellCopy.supportingText).toContain("GBP 홍보글")
  })
})
