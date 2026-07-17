import { expect, test, type Page } from "@playwright/test"
import { writeFileSync } from "node:fs"

const prototypeChromePatterns = [
  /화면\s*구조도/,
  /기능\s*정의서\s*매핑/,
  /step\s*rail/i,
  /prototype\s*frame/i,
  /프로토타입\s*프레임/,
  /단계\s*레일/,
]

async function expectNoPrototypeChrome(page: Page): Promise<void> {
  for (const pattern of prototypeChromePatterns) {
    await expect(page.getByText(pattern)).toHaveCount(0)
  }
}

async function readOverflowMetrics(page: Page) {
  return page.evaluate(() => {
    const overflowTolerance = 1
    const viewportWidth = window.innerWidth
    const overflowingElements = Array.from(
      document.querySelectorAll<HTMLElement>("body *")
    )
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const className =
          typeof element.className === "string" ? element.className : ""
        const label =
          element.getAttribute("data-testid") ??
          element.getAttribute("aria-label") ??
          element.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ??
          element.tagName.toLowerCase()

        return {
          className,
          label,
          left: Math.floor(rect.left),
          right: Math.ceil(rect.right),
          tag: element.tagName.toLowerCase(),
          width: Math.ceil(rect.width),
        }
      })
      .filter(
        ({ left, right, width }) =>
          width > 0 &&
          (left < -overflowTolerance ||
            right > viewportWidth + overflowTolerance)
      )

    return {
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      innerWidth: viewportWidth,
      overflowingElements,
    }
  })
}

test("design base desktop uses a native browser shell without prototype chrome", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto("/")

  await expect(page.getByTestId("entry-device")).toBeVisible()
  await expect(
    page.locator(".gx-device-island, .gx-statusbar, .gx-phone-screen")
  ).toHaveCount(0)
  await expectNoPrototypeChrome(page)
  await page.screenshot({
    fullPage: true,
    path: ".omo/evidence/task-2-native-browser-desktop.png",
  })

  const shellBox = await page.getByTestId("entry-device").boundingBox()
  expect(shellBox).not.toBeNull()
  expect(shellBox?.width ?? 0).toBeGreaterThanOrEqual(680)
  expect(shellBox?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(760)

  const metrics = await readOverflowMetrics(page)
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.innerWidth)
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth)
  expect(metrics.overflowingElements).toEqual([])
})

test("design base mobile overflow stays within viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto("/")

  await expectNoPrototypeChrome(page)
  await expect(
    page.locator(".gx-device-island, .gx-statusbar, .gx-phone-screen")
  ).toHaveCount(0)
  const metrics = await readOverflowMetrics(page)
  writeFileSync(
    ".omo/evidence/task-2-mobile-overflow.json",
    JSON.stringify(metrics, null, 2)
  )

  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.innerWidth)
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth)
  expect(metrics.overflowingElements).toEqual([])
})
