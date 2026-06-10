import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

import { openDatabase } from "../../src/server/db/sqlite"
import { resetE2eDatabase } from "./global-setup"
import { uploadMarketingImageAndGenerateDraft } from "./marketing-helpers"

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
  await page.getByRole("button", { name: "이메일로 시작" }).click()
  await page
    .getByRole("textbox", { name: "네이버 정보", exact: true })
    .fill("https://naver.me/mybrunchcafe")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()
  await expect(page.getByText("브런치모먼트 홍대점")).toBeVisible()
  await page.getByRole("button", { name: "매장 정보 확인" }).click()
  await page.getByRole("button", { name: "다음: GBP 세팅 확인" }).click()
  await page.getByRole("button", { name: "대시보드로 이동" }).click()
  await expect(page).toHaveURL(/\/app/)
}

test("app posting preview matches the reference flow", async ({ page }) => {
  await completeOnboarding(page)

  await expect(page.getByTestId("app-stage")).toBeVisible()
  await page.getByRole("button", { name: "다채널 포스팅" }).click()
  await expect(
    page.getByRole("button", { name: "다채널 포스팅" })
  ).toHaveAttribute("aria-current", "page")

  await expect(
    page.getByText("이미지와 홍보 의도를 먼저 분석하면")
  ).toBeVisible()
  await page.getByRole("button", { name: "사진 고도화" }).click()
  await uploadMarketingImageAndGenerateDraft(page)
  await expect(page.getByText("스마트 제안")).toBeVisible()
  await page.getByRole("button", { name: "제안 없이 진행" }).click()
  await expect(page.getByText("완성된 게시물을 확인해주세요")).toBeVisible()
  await expect(page.getByRole("tab", { name: "Instagram 피드" })).toBeVisible()
  await page.getByRole("tab", { name: "Instagram 피드" }).click()
  await expect(page.getByText("이번 주말")).toBeVisible()
  await expect(page.getByText("#홍대브런치")).toBeVisible()
  await page.screenshot({
    fullPage: true,
    path: ".omo/evidence/task-8-post-draft.png",
  })
})

test("app publish blocked when location unverified", async ({ page }) => {
  await completeOnboarding(page)

  await expect(page.getByTestId("app-stage")).toBeVisible()
  await page.getByRole("button", { name: "다채널 포스팅" }).click()
  await expect(
    page.getByRole("button", { name: "다채널 포스팅" })
  ).toHaveAttribute("aria-current", "page")
  await page.getByRole("button", { name: "사진 고도화" }).click()
  await uploadMarketingImageAndGenerateDraft(page)
  await page.getByRole("button", { name: "제안 없이 진행" }).click()
  await page.getByRole("button", { name: /게시물 발행/ }).click()

  await expect(
    page.getByText("Google 비즈니스 프로필 인증이 완료되어야")
  ).toBeVisible()
  await expect(page.getByText("게시 완료")).toHaveCount(0)
  await page.screenshot({
    fullPage: true,
    path: ".omo/evidence/task-8-post-blocked.png",
  })
})

test("app report and dashboard screens render reference metrics", async ({
  page,
}) => {
  await completeOnboarding(page)

  await page.getByRole("button", { name: "성과 리포트" }).click()
  await expect(
    page.getByRole("button", { name: "성과 리포트" })
  ).toHaveAttribute("aria-current", "page")
  await expect(page.getByText("주간 성과 리포트 · 5/26~6/1")).toBeVisible()
  await expect(page.getByText("12,480")).toBeVisible()

  await page
    .getByRole("button", { name: "📊 성과 대시보드 자세히 보기" })
    .click()
  await expect(
    page.getByRole("heading", { name: "성과 대시보드" })
  ).toBeVisible()
  await expect(page.getByText("프로필 조회")).toBeVisible()
})
