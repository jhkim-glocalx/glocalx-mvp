import { expect, test, type Page } from "@playwright/test"
import { writeFileSync } from "node:fs"

import { resetE2eDatabase } from "./global-setup"

test.beforeEach(() => {
  resetE2eDatabase()
})

async function completeSetup(page: Page): Promise<void> {
  await page.getByRole("button", { name: "데모 시작" }).click()
  await page.getByLabel("네이버 정보").fill("https://naver.me/mybrunchcafe")
  await page.getByRole("button", { name: "가게 정보 찾기" }).click()
  await expect(page.getByText("브런치모먼트 홍대점")).toBeVisible()
  await page.getByRole("button", { name: "GBP 세팅 확인" }).click()
  await expect(page.getByText("VERIFICATION_PENDING")).toBeVisible()
  await page.getByRole("button", { name: "대시보드로 이동" }).click()
}

test("full unified stub happy path", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await completeSetup(page)
  await page.getByLabel("홍보 의도").fill("주말 브런치 신메뉴 홍보")
  await page.getByRole("button", { name: "GBP 초안 만들기" }).click()
  await expect(
    page.getByText(
      "브런치모먼트 홍대점에서 주말 브런치 신메뉴 홍보 소식을 전해드립니다."
    )
  ).toBeVisible()
  await page.getByRole("button", { name: "GBP 게시하기" }).click()
  await expect(
    page.getByText("Google 비즈니스 프로필 인증이 완료되어야")
  ).toBeVisible()
  writeFileSync(
    ".omo/evidence/task-13-full-happy-path.txt",
    "PASS: demo login -> onboarding extraction -> GBP setup -> app post draft -> publish blocked recovery\n"
  )
})

test("final responsive regression", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.context().clearCookies()
  await page.goto("/")
  await page.screenshot({
    fullPage: true,
    path: ".omo/evidence/design-unification-desktop.png",
  })

  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto("/")
  await page.screenshot({
    fullPage: true,
    path: ".omo/evidence/design-unification-mobile.png",
  })

  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  writeFileSync(
    ".omo/evidence/design-unification-overflow.json",
    JSON.stringify(metrics, null, 2)
  )

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth)
})
