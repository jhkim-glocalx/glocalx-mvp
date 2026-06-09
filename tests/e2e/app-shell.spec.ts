import { expect, test, type Page } from "@playwright/test"
import { writeFileSync } from "node:fs"

import { openDatabase } from "../../src/server/db/sqlite"
import { resetE2eDatabase } from "./global-setup"

function resetFirstTimeE2eDatabase(): void {
  resetE2eDatabase()
  const database = openDatabase()
  try {
    database
      .prepare("UPDATE stores SET onboarding_status = ? WHERE id = ?")
      .run("NOT_STARTED", "demo-store")
  } finally {
    database.close()
  }
}

async function completeOnboarding(page: Page): Promise<void> {
  await page.getByLabel("네이버 정보").fill("https://naver.me/mybrunchcafe")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()
  await expect(page.getByText("브런치모먼트 홍대점")).toBeVisible()
  await page.getByRole("button", { name: "매장 정보 확인" }).click()
  await page.getByRole("button", { name: "다음: GBP 세팅 확인" }).click()
  await expect(page.getByText("인증 대기", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "대시보드로 이동" }).click()
  await expect(page).toHaveURL(/\/app/)
  await expect(
    page.getByRole("heading", { name: "GBP 성과 요약" })
  ).toBeVisible()
}

test.beforeEach(() => {
  resetFirstTimeE2eDatabase()
})

test("bottom navigation keyboard changes the active tab", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await page.getByRole("button", { name: "시작하기" }).click()
  await completeOnboarding(page)

  const homeTab = page.getByRole("button", { name: "홈" })
  const postTab = page.getByRole("button", { name: "포스팅" })

  await postTab.click()
  await expect(postTab).toHaveAttribute("aria-current", "page")
  await page.getByLabel("홍보 의도").focus()
  await page.keyboard.press("Tab")
  await expect(
    page.getByRole("button", { name: "GBP 초안 만들기" })
  ).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(homeTab).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(homeTab).toHaveAttribute("aria-current", "page")

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
  await expect(page.getByRole("button", { name: "홈" })).toHaveAttribute(
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
