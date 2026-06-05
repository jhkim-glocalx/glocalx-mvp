import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const globalsCss = readFileSync("src/app/globals.css", "utf8")
const layoutSource = readFileSync("src/app/layout.tsx", "utf8")

describe("global design tokens", () => {
  it("keeps Tailwind as the first global import", () => {
    expect(globalsCss.split("\n")[0]).toBe('@import "tailwindcss";')
  })

  it("defines the finalized GlocalX token contract", () => {
    const requiredTokens = [
      "--ink",
      "--ink-soft",
      "--line",
      "--canvas",
      "--canvas-2",
      "--accent",
      "--accent-press",
      "--accent-soft",
      "--mint",
      "--mint-soft",
      "--blue",
      "--phone-bg",
      "--card",
      "--shadow",
      "--r",
    ] as const

    for (const token of requiredTokens) {
      expect(globalsCss).toContain(`${token}:`)
    }
  })

  it("prevents document-level horizontal overflow", () => {
    expect(globalsCss).toMatch(/overflow-x:\s*hidden/)
  })

  it("keeps global CSS wired through the Korean root layout", () => {
    expect(layoutSource).toContain('import "./globals.css"')
    expect(layoutSource).toContain('<html lang="ko">')
  })
})
