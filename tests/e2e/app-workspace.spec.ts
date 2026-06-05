import { expect, test } from "@playwright/test"

import { resetE2eDatabase } from "./global-setup"

test.beforeEach(() => {
  resetE2eDatabase()
})

test("app post draft preview from api", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await page.getByRole("button", { name: "시작하기" }).click()
  await page.getByLabel("네이버 정보").fill("https://naver.me/mybrunchcafe")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()
  await page.getByRole("button", { name: "다음: GBP 세팅 확인" }).click()
  await page.getByRole("button", { name: "대시보드로 이동" }).click()

  await page.getByLabel("홍보 의도").fill("주말 브런치 신메뉴 홍보")
  await page.getByRole("button", { name: "GBP 초안 만들기" }).click()

  await expect(
    page.getByText(
      "브런치모먼트 홍대점에서 주말 브런치 신메뉴 홍보 소식을 전해드립니다."
    )
  ).toBeVisible()
  await page.screenshot({
    fullPage: true,
    path: ".omo/evidence/task-8-post-draft.png",
  })
})

test("app publish blocked when location unverified", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await page.getByRole("button", { name: "시작하기" }).click()
  await page.getByLabel("네이버 정보").fill("https://naver.me/mybrunchcafe")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()
  await page.getByRole("button", { name: "다음: GBP 세팅 확인" }).click()
  await page.getByRole("button", { name: "대시보드로 이동" }).click()

  await page.getByLabel("홍보 의도").fill("주말 브런치 신메뉴 홍보")
  await page.getByRole("button", { name: "GBP 초안 만들기" }).click()
  await page.getByRole("button", { name: "GBP 게시하기" }).click()

  await expect(
    page.getByText("Google 비즈니스 프로필 인증이 완료되어야")
  ).toBeVisible()
  await expect(page.getByText("게시 완료")).toHaveCount(0)
  await page.screenshot({
    fullPage: true,
    path: ".omo/evidence/task-8-post-blocked.png",
  })
})
