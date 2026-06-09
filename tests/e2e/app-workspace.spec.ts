import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

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

test.beforeEach(() => {
  resetFirstTimeE2eDatabase()
})

async function completeOnboarding(page: Page): Promise<void> {
  await page.context().clearCookies()
  await page.goto("/")
  await page.getByRole("button", { name: "시작하기" }).click()
  await page.getByLabel("네이버 정보").fill("https://naver.me/mybrunchcafe")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()
  await expect(page.getByText("브런치모먼트 홍대점")).toBeVisible()
  await page.getByRole("button", { name: "매장 정보 확인" }).click()
  await page.getByRole("button", { name: "다음: GBP 세팅 확인" }).click()
  await page.getByRole("button", { name: "대시보드로 이동" }).click()
  await expect(page).toHaveURL(/\/app/)
}

test("app post draft preview from api", async ({ page }) => {
  await completeOnboarding(page)

  await expect(page.getByTestId("app-stage")).toBeVisible()
  await page.getByRole("button", { name: "포스팅" }).click()
  await expect(page.getByRole("button", { name: "포스팅" })).toHaveAttribute(
    "aria-current",
    "page"
  )
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
  await completeOnboarding(page)

  await expect(page.getByTestId("app-stage")).toBeVisible()
  await page.getByRole("button", { name: "포스팅" }).click()
  await expect(page.getByRole("button", { name: "포스팅" })).toHaveAttribute(
    "aria-current",
    "page"
  )
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

test("app performance tab loads GBP metrics without fetch error", async ({
  page,
}) => {
  await completeOnboarding(page)

  await page.getByRole("button", { name: "홈" }).click()
  await expect(page.getByText("GBP 성과 요약")).toBeVisible()

  await page.getByRole("button", { name: "성과" }).click()
  await expect(page.getByRole("button", { name: "성과" })).toHaveAttribute(
    "aria-current",
    "page"
  )
  await expect(page.getByText("GBP 성과 자세히")).toBeVisible()
  await expect(page.getByText("성과 조회 실패")).toHaveCount(0)
  await expect(page.getByText("Failed to fetch")).toHaveCount(0)
  await expect(page.getByText("프로필 조회")).toBeVisible()
})
