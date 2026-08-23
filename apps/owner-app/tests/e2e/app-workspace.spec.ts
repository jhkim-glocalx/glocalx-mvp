import { expect, test } from "@playwright/test"

import { evidencePath } from "./evidence"
import type { Page } from "@playwright/test"

import { resetFirstTimeE2eDatabase } from "./db-harness"
import { startEmailOnboarding } from "./email-auth-helpers"
import { uploadMarketingImageAndGenerateDraft } from "./marketing-helpers"

test.beforeEach(async () => {
  await resetFirstTimeE2eDatabase()
})

async function completeOnboarding(page: Page): Promise<void> {
  await page.context().clearCookies()
  await page.goto("/")
  await startEmailOnboarding(page)
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
  // Onboarding ends on the Instagram question; decline it to reach the exit.
  await page.getByRole("button", { name: "아니요, 없어요" }).click()
  await page.getByRole("button", { name: "매장 홍보 처음 시키러 가기" }).click()
  await expect(page).toHaveURL(/\/app\?nav=photo/)
  await expect(
    page.getByRole("button", { name: "홍보 콘텐츠 넣기" })
  ).toHaveAttribute("aria-current", "page")
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

async function captureCompletePostingFlow(
  page: Page,
  path: string
): Promise<void> {
  await page.locator(".gx-route-page").evaluate((routePage) => {
    const shell = routePage.querySelector<HTMLElement>(".gx-shell")
    const screen = routePage.querySelector<HTMLElement>(".gx-screen")

    routePage.style.display = "block"
    routePage.style.minHeight = "0"
    if (shell) {
      shell.style.height = "auto"
      shell.style.overflow = "visible"
    }
    if (screen) {
      screen.style.flex = "none"
      screen.style.height = "auto"
      screen.style.overflow = "visible"
    }
  })
  await page.screenshot({ fullPage: true, path })
}

test("app posting preview matches the reference flow", async ({ page }) => {
  await completeOnboarding(page)

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
  // Owner self-serve publish is paused, so the preview ends at the operator
  // handoff rather than a per-channel publish button. Switching tabs must not
  // resurrect one.
  await expect(
    page.getByText("지금은 담당 운영팀이 사진과 문구를 검토한 뒤 게시합니다")
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "마케팅 소재 요청으로 보내기" })
  ).toBeEnabled()
  await page.getByRole("tab", { name: "Google 비즈니스 프로필" }).click()
  await expect(
    page.getByRole("button", { name: "마케팅 소재 요청으로 보내기" })
  ).toBeEnabled()
  await expect(page.getByRole("button", { name: /에 게시하기$/ })).toHaveCount(
    0
  )
  await page.getByRole("tab", { name: "Instagram 피드" }).click()
  await captureCompletePostingFlow(
    page,
    evidencePath("social-posts-instagram-desktop.png")
  )
})

// Replaces an earlier test that drove the GBP publish button to reach the
// "인증이 완료되어야" gate. That gate still exists, but the owner can no longer
// reach it: direct publish is paused, so /api/posts/*/publish answers
// ADMIN_PUBLISH_ONLY before any location check. The gate itself stays covered by
// post-flow-publishing.test.ts and publish-eligibility.test.ts, and the 409 by
// post-publish.spec.ts. What is left to prove here is the owner-facing half —
// that the screen offers the operator handoff instead of a dead end.
test("app posting screen hands publishing to the operator queue", async ({
  page,
}) => {
  await completeOnboarding(page)

  await expect(page.getByTestId("app-stage")).toBeVisible()
  await page.getByRole("button", { name: "여러 SNS 자동홍보" }).click()
  await expect(
    page.getByRole("button", { name: "여러 SNS 자동홍보" })
  ).toHaveAttribute("aria-current", "page")
  await page.getByRole("button", { name: "홍보 콘텐츠 넣기" }).click()
  await uploadMarketingImageAndGenerateDraft(page)
  await page.getByRole("button", { name: "제안 없이 진행" }).click()

  await expect(
    page.getByText("지금은 담당 운영팀이 사진과 문구를 검토한 뒤 게시합니다")
  ).toBeVisible()
  await expect(page.getByRole("button", { name: /에 게시하기$/ })).toHaveCount(
    0
  )
  await captureCompletePostingFlow(
    page,
    evidencePath("social-posts-operator-review-desktop.png")
  )

  await page
    .getByRole("button", { name: "마케팅 소재 요청으로 보내기" })
    .click()
  await expect(
    page.getByRole("button", { name: "마케팅 소재 요청" })
  ).toHaveAttribute("aria-current", "page")
})

test("mobile Instagram publishing keeps the selected channel state", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 })
  await completeOnboarding(page)
  await page.getByRole("button", { name: "홍보 콘텐츠 넣기" }).click()
  await uploadMarketingImageAndGenerateDraft(page)
  await page.getByRole("button", { name: "제안 없이 진행" }).click()
  await page.getByRole("tab", { name: "Instagram 피드" }).click()

  await expect(
    page.getByRole("tab", { name: "Instagram 피드" })
  ).toHaveAttribute("aria-selected", "true")
  await expect(
    page.getByText("지금은 담당 운영팀이 사진과 문구를 검토한 뒤 게시합니다")
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "마케팅 소재 요청으로 보내기" })
  ).toBeEnabled()
  await captureCompletePostingFlow(
    page,
    evidencePath("social-posts-instagram-mobile.png")
  )
})

test("app report and dashboard screens render reference metrics", async ({
  page,
}) => {
  await completeOnboarding(page)
  await page.getByRole("button", { name: "홍보 실적 자세히 보기" }).click()
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
