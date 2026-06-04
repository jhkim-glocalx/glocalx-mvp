import { describe, expect, it } from "vitest"

import { appShellCopy } from "./app-shell"

describe("appShellCopy", () => {
  it("renders the GlocalX scaffold copy when the app boots", () => {
    expect(appShellCopy.productName).toBe("GlocalX")
    expect(appShellCopy.initialPrompt).toContain("글로컬")
  })
})
