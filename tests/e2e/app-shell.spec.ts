import { expect, test, type Page } from "@playwright/test"
import { writeFileSync } from "node:fs"

async function completeOnboarding(page: Page): Promise<void> {
  await page.getByLabel("네이버 정보").fill("https://naver.me/mybrunchcafe")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()
  await expect(page.getByText("브런치모먼트 홍대점")).toBeVisible()
  await page.getByRole("button", { name: "다음: GBP 세팅 확인" }).click()
  await expect(page.getByText("인증 대기")).toBeVisible()
  await page.getByRole("button", { name: "대시보드로 이동" }).click()
}

test("bottom navigation keyboard changes the active tab", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await page.getByRole("button", { name: "시작하기" }).click()
  await completeOnboarding(page)

  const onboardingTab = page.getByRole("button", { name: "온보딩" })
  const postTab = page.getByRole("button", { name: "포스팅" })

  await expect(postTab).toHaveAttribute("aria-current", "page")
  await page.getByRole("button", { name: "GBP 초안 만들기" }).focus()
  await page.keyboard.press("Tab")
  await expect(onboardingTab).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(onboardingTab).toHaveAttribute("aria-current", "page")

  await page.keyboard.press("Tab")
  await expect(postTab).toBeFocused()
  await page.keyboard.press("Enter")

  await expect(postTab).toHaveAttribute("aria-current", "page")
  writeFileSync(
    ".omo/evidence/task-3-bottom-nav-keyboard.txt",
    `active=${await postTab.getAttribute("aria-current")}\n`
  )
})

test("mobile shell frame keeps controls visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.context().clearCookies()
  await page.goto("/")
  await page.getByRole("button", { name: "시작하기" }).click()
  await completeOnboarding(page)

  await expect(page.getByTestId("app-stage")).toBeVisible()
  await expect(page.getByRole("button", { name: "포스팅" })).toHaveAttribute(
    "aria-current",
    "page"
  )

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
