import { expect, test, type Page } from "@playwright/test"
import { writeFileSync } from "node:fs"

async function completeOnboarding(page: Page): Promise<void> {
  await page.getByLabel("네이버 정보").fill("https://naver.me/mybrunchcafe")
  await page.getByRole("button", { name: "가게 정보 찾기" }).click()
  await expect(page.getByText("브런치모먼트 홍대점")).toBeVisible()
  await page.getByRole("button", { name: "GBP 세팅 확인" }).click()
  await expect(page.getByText("인증 대기")).toBeVisible()
  await page.getByRole("button", { name: "대시보드로 이동" }).click()
}

test("step navigation keyboard changes the active step", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await page.getByRole("button", { name: "데모 시작" }).click()
  await completeOnboarding(page)

  await page.keyboard.press("Tab")
  await page.keyboard.press("Tab")
  await page.keyboard.press("Enter")

  await expect(
    page.getByRole("button", { name: /포스팅/ })
  ).toHaveAttribute("aria-current", "step")
  writeFileSync(
    ".omo/evidence/task-3-step-nav-keyboard.txt",
    `active=${await page.getByRole("button", { name: /포스팅/ }).getAttribute("aria-current")}\n`
  )
})

test("mobile shell frame keeps controls visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.context().clearCookies()
  await page.goto("/")
  await page.getByRole("button", { name: "데모 시작" }).click()
  await completeOnboarding(page)

  await expect(page.getByTestId("app-stage")).toBeVisible()
  await expect(page.getByRole("button", { name: /포스팅/ })).toBeVisible()

  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  await page.screenshot({
    fullPage: true,
    path: ".omo/evidence/task-3-mobile-shell.png",
  })

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth)
})
