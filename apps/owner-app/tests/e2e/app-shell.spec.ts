import { expect, test, type Page } from "@playwright/test"

import { evidencePath } from "./evidence"
import { writeFileSync } from "node:fs"

import { resetFirstTimeE2eDatabase } from "./db-harness"
import { startEmailOnboarding } from "./email-auth-helpers"

async function expectMarketingLanding(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/app\?nav=photo/)
  await expect(
    page.getByRole("button", { name: "홍보 콘텐츠 넣기" })
  ).toHaveAttribute("aria-current", "page")
  await expect(page.getByText("홍보를 하기위해 최소한의 사진")).toBeVisible()
}

async function completeOnboarding(page: Page): Promise<void> {
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
  await expect(page.getByText("인증 대기", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "매장 홍보 처음 시키러 가기" }).click()
  await expectMarketingLanding(page)
}

test.beforeEach(async ({ page }, testInfo) => {
  void page
  testInfo.setTimeout(60_000)
  await resetFirstTimeE2eDatabase()
})

test("flow navigation keyboard changes the active step", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await startEmailOnboarding(page)
  await completeOnboarding(page)

  const postingTab = page.getByRole("button", { name: "여러 SNS 자동홍보" })
  const dashboardTab = page.getByRole("button", {
    name: "홍보 실적 자세히 보기",
  })

  await dashboardTab.click()
  await expect(dashboardTab).toHaveAttribute("aria-current", "page")
  await postingTab.click()
  await expect(postingTab).toHaveAttribute("aria-current", "page")
  await expect(
    page.getByText("사진과 알리고 싶은 말이나 단어를 먼저 분석하면")
  ).toBeVisible()

  writeFileSync(
    evidencePath("task-3-bottom-nav-keyboard.txt"),
    `active=${await postingTab.getAttribute("aria-current")}\n`
  )
})

test("bottom chat composer accepts typed text", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await startEmailOnboarding(page)
  await completeOnboarding(page)

  await page.getByRole("button", { name: "여러 SNS 자동홍보" }).click()
  await expect(
    page.getByRole("button", { name: "여러 SNS 자동홍보" })
  ).toHaveAttribute("aria-current", "page")
  const composer = page.getByRole("textbox", { name: "메시지 입력" })
  await composer.fill("이번 주말 신메뉴를 홍보하고 싶어요")

  await expect(composer).toHaveValue("이번 주말 신메뉴를 홍보하고 싶어요")
})

test("app onboarding quick replies drive the bottom composer", async ({
  page,
}) => {
  await page.context().clearCookies()
  await page.goto("/")
  await startEmailOnboarding(page)
  await completeOnboarding(page)

  await page.getByRole("button", { name: "가게 인증 및 등록" }).click()
  const composer = page.getByRole("textbox", { name: "메시지 입력" })

  await page
    .getByRole("button", { name: "네이버플레이스 링크 붙여넣기" })
    .click()
  await expect(composer).toBeFocused()
  await expect(composer).toHaveValue("https://naver.me/mybrunchcafe")

  await page.getByRole("button", { name: "상호명으로 검색" }).click()
  await expect(composer).toHaveValue("브런치모먼트")

  await composer.press("Enter")
  await expect(page.getByText("브런치모먼트 홍대점")).toBeVisible()
  await expect(
    page.getByRole("button", { exact: true, name: "예, 맞아요" })
  ).toBeVisible()
  await expect(
    page.getByText("영업시간을 메시지로 알려주세요", { exact: false })
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "가게 인증 및 등록" })
  ).toHaveAttribute("aria-current", "page")

  await page.getByRole("button", { name: "다시 검색" }).click()
  await expect(composer).toBeFocused()
  await expect(composer).toHaveValue("")
  await expect(page.getByText("다시 찾을 상호명이나 네이버 링크")).toBeVisible()

  await composer.fill("https://naver.me/mybrunchcafe")
  await page.getByRole("button", { name: "전송" }).click()
  await expect(
    page.getByText("네이버에서 매장 정보를 찾았습니다.")
  ).toBeVisible()
  await page.getByRole("button", { exact: true, name: "예, 맞아요" }).click()
  await expect(
    page.getByRole("button", { name: "가게 인증 및 등록" })
  ).toHaveAttribute("aria-current", "page")

  await composer.fill("평일 9-6이에요")
  await composer.press("Enter")
  await expect(page.getByRole("textbox", { name: "영업시간" })).toHaveValue(
    "평일 09:00-18:00"
  )

  await composer.fill("서울커피")
  await composer.press("Enter")
  await expect(page.getByText("서울커피 홍대점")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "가게 인증 및 등록" })
  ).toHaveAttribute("aria-current", "page")
})

test("app onboarding keeps Korean composition input and exposes editable store fields", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.context().clearCookies()
  await page.goto("/")
  await startEmailOnboarding(page)
  await completeOnboarding(page)

  await page.getByRole("button", { name: "가게 인증 및 등록" }).click()
  const composer = page.getByRole("textbox", { name: "메시지 입력" })

  await composer.dispatchEvent("compositionstart")
  await composer.fill("떡")
  await composer.press("Enter")
  await expect(composer).toHaveValue("떡")

  await composer.dispatchEvent("compositionend")
  await composer.fill("우빈떡볶이")
  await page.getByRole("button", { name: "전송" }).click()

  await expect(page.getByText("우빈떡볶이", { exact: true })).toBeVisible()
  await expect(page.getByText("먼저 전화번호를 메시지로")).toHaveCount(0)
  await page.getByRole("button", { exact: true, name: "예, 맞아요" }).click()
  const storeName = page.getByRole("textbox", { name: "상호" })
  await expect(storeName).toHaveCount(0)

  await composer.fill("전화번호 01082432196")
  await page.getByRole("button", { name: "전송" }).click()
  await expect(page.getByRole("textbox", { name: "전화번호" })).toHaveCount(0)
  await expect(page.getByText("영업시간을 메시지로 알려주세요")).toBeVisible()

  await composer.fill("평일 12시-6시")
  await page.getByRole("button", { name: "전송" }).click()
  await expect(storeName).toBeVisible()
  await expect(storeName).toHaveValue("우빈떡볶이 홍대점")
  await storeName.fill("우빈떡볶이 신촌점")
  await expect(storeName).toHaveValue("우빈떡볶이 신촌점")
  await expect(page.getByRole("textbox", { name: "전화번호" })).toHaveValue(
    "01082432196"
  )
  await expect(page.getByRole("textbox", { name: "영업시간" })).toHaveValue(
    "평일 12:00-18:00"
  )

  await page.getByRole("button", { name: "예, 맞아요" }).click()
  await expect(
    page.getByRole("button", { name: "다음: GBP 세팅 확인" })
  ).toBeVisible()
})

test("responsive browser shell keeps controls visible on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.context().clearCookies()
  await page.goto("/")
  await startEmailOnboarding(page)
  await completeOnboarding(page)

  await expect(page.getByTestId("app-stage")).toBeVisible()
  await expect(
    page.locator(".gx-device-island, .gx-statusbar, .gx-phone-screen")
  ).toHaveCount(0)
  await page.getByRole("button", { name: "홍보 실적 자세히 보기" }).click()
  await expect(
    page.getByRole("button", { name: "홍보 실적 자세히 보기" })
  ).toHaveAttribute("aria-current", "page")

  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  await page.screenshot({
    fullPage: true,
    path: evidencePath("task-3-responsive-mobile-shell.png"),
  })

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth)
})
