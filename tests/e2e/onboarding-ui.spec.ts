import { expect, test } from "@playwright/test"

import { resetE2eDatabase } from "./global-setup"

test.beforeEach(() => {
  resetE2eDatabase()
})

test("successful onboarding extraction and gbp setup", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await page.getByRole("button", { name: "시작하기" }).click()

  await expect(
    page.getByRole("button", { name: "네이버 정보 제출" })
  ).toBeVisible()
  await page.getByLabel("네이버 정보").fill("https://naver.me/mybrunchcafe")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()

  await expect(page.getByText("브런치모먼트 홍대점")).toBeVisible()
  await expect(page.getByText("영업시간 입력 필요")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "다음: GBP 세팅 확인" })
  ).toBeVisible()
  await page.getByRole("button", { name: "다음: GBP 세팅 확인" }).click()

  await expect(page.getByText("VERIFICATION_PENDING")).toBeVisible()
  await expect(page.getByText("setup-gbp-audit")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "대시보드로 이동" })
  ).toBeVisible()
  await page.screenshot({
    fullPage: true,
    path: ".omo/evidence/task-5-onboarding-success.png",
  })

  await page.getByRole("button", { name: "대시보드로 이동" }).click()
  await expect(page).toHaveURL(/\/app/)
})

test("onboarding no result manual fallback", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await page.getByRole("button", { name: "시작하기" }).click()

  await page.getByLabel("네이버 정보").fill("없는가게zzzz")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()

  await expect(
    page.getByText("네이버에서 매장을 찾지 못했습니다")
  ).toBeVisible()
  await expect(page).toHaveURL(/\/onboarding/)
  await page.screenshot({
    fullPage: true,
    path: ".omo/evidence/task-5-onboarding-fallback.png",
  })
})
