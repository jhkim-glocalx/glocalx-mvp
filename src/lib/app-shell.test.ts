import { describe, expect, it } from "vitest"

import { appShellCopy } from "./app-shell"

describe("appShellCopy", () => {
  it("renders concise GlocalX entry copy when the app boots", () => {
    expect(appShellCopy.productName).toBe("GlocalX")
    expect(appShellCopy.initialPrompt).toBe("오늘의 매장")
    expect(appShellCopy.primaryAction).toBe("시작하기")
  })
})
