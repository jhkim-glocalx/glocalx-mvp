import { expect, test } from "@playwright/test"
import { writeFileSync } from "node:fs"

test("design base desktop renders dark canvas", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto("/")

  const background = await page.evaluate(() =>
    getComputedStyle(document.body).backgroundColor
  )
  await page.screenshot({
    fullPage: true,
    path: ".omo/evidence/task-2-design-base-desktop.png",
  })

  expect(background).not.toBe("rgb(247, 248, 243)")
})

test("design base mobile overflow stays within viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto("/")

  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  writeFileSync(
    ".omo/evidence/task-2-mobile-overflow.json",
    JSON.stringify(metrics, null, 2)
  )

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth)
})
