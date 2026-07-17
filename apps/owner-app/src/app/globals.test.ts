import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

import { describe, expect, it } from "vitest"

const globalsCss = readFileSync("src/app/globals.css", "utf8")
const layoutSource = readFileSync("src/app/layout.tsx", "utf8")
// Tokens live once in @glocalx/ui; resolve through the package exports so
// this test follows the file if the package layout changes.
const tokensCss = readFileSync(
  createRequire(import.meta.url).resolve("@glocalx/ui/tokens.css"),
  "utf8"
)

describe("global design tokens", () => {
  it("keeps Tailwind as the first global import", () => {
    expect(globalsCss.split("\n")[0]).toBe('@import "tailwindcss";')
  })

  it("imports the shared token sheet from @glocalx/ui", () => {
    expect(globalsCss).toContain('@import "@glocalx/ui/tokens.css";')
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
      expect(tokensCss).toContain(`${token}:`)
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
