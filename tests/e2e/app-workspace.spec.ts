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
  await page.getByRole("button", { exact: true, name: "예, 맞아요" }).click()
  await page
    .getByRole("textbox", { name: "네이버 정보", exact: true })
    .fill("평일 9-6이에요")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()
  await expect(page.getByRole("textbox", { name: "영업시간" })).toHaveValue(
    "평일 09:00-18:00"
  )
  await page.getByRole("button", { name: "예, 맞아요" }).click()
  await page.getByRole("button", { name: "다음: GBP 세팅 확인" }).click()
  await page.getByRole("button", { name: "매장 홍보 처음 시키러 가기" }).click()
  await expect(page).toHaveURL(/\/app/)
}

async function expectDashboardLanding(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "홍보 실적 자세히 보기" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "홍보 실적 자세히 보기" })
  ).toHaveAttribute("aria-current", "page")
  await expect(
    page.getByRole("button", { name: "여러 SNS 자동홍보" })
  ).not.toHaveAttribute("aria-current", "page")
}

test("app posting preview matches the reference flow", async ({ page }) => {
  await completeOnboarding(page)
  await expectDashboardLanding(page)

  await expect(page.getByTestId("app-stage")).toBeVisible()
  await page.getByRole("button", { name: "여러 SNS 자동홍보" }).click()
  await expect(
    page.getByRole("button", { name: "여러 SNS 자동홍보" })
  ).toHaveAttribute("aria-current", "page")

  await expect(
    page.getByText("사진과 알리고 싶은 말이나 단어를 먼저 분석하면")
  ).toBeVisible()
  await page.getByRole("button", { name: "홍보 콘텐츠 넣기" }).click()
  await uploadMarketingImageAndGenerateDraft(page)
  await expect(page.getByText("방문을 늘리는 문구 제안")).toBeVisible()
  await page.getByRole("button", { name: "제안 없이 진행" }).click()
  await expect(
    page.getByRole("button", { name: "여러 SNS 자동홍보" })
  ).toHaveAttribute("aria-current", "page")
  await expect(page.getByText("완성된 게시물을 확인해주세요")).toBeVisible()
  await expect(page.getByRole("tab", { name: "Instagram 피드" })).toBeVisible()
  await expect(page.getByText("영어버전")).toHaveCount(0)
  await page.getByRole("tab", { name: "Instagram 피드" }).click()
  await expect(page.getByText("이번 주말")).toBeVisible()
  await expect(
    page.getByText("Complete your weekend brunch plans")
  ).toBeVisible()
  await page.getByRole("button", { name: "Japanese" }).click()
  await expect(
    page.getByText("今週末はブランチモーメント弘大店の新メニュー")
  ).toBeVisible()
  await expect(page.getByText("#홍대브런치")).toBeVisible()
  await page.screenshot({
    fullPage: true,
    path: ".omo/evidence/task-8-post-draft.png",
  })
})

test("app publish blocked when location unverified", async ({ page }) => {
  await completeOnboarding(page)
  await expectDashboardLanding(page)

  await expect(page.getByTestId("app-stage")).toBeVisible()
  await page.getByRole("button", { name: "여러 SNS 자동홍보" }).click()
  await expect(
    page.getByRole("button", { name: "여러 SNS 자동홍보" })
  ).toHaveAttribute("aria-current", "page")
  await page.getByRole("button", { name: "홍보 콘텐츠 넣기" }).click()
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
  await expectDashboardLanding(page)

  await page.getByRole("button", { name: "주간 홍보 실적" }).click()
  await expect(
    page.getByRole("button", { name: "주간 홍보 실적" })
  ).toHaveAttribute("aria-current", "page")
  await expect(page.getByText("주간 홍보 실적 · 5/26~6/1")).toBeVisible()
  await expect(page.getByText("12,480")).toBeVisible()

  await page
    .getByLabel("화면 단계")
    .getByRole("button", { name: "홍보 실적 자세히 보기" })
    .click()
  await expect(
    page.getByRole("heading", { name: "홍보 실적 자세히 보기" })
  ).toBeVisible()
  await expect(page.getByText("프로필 조회")).toBeVisible()
})
