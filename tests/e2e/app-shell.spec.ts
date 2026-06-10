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
  await page
    .getByRole("textbox", { name: "네이버 정보", exact: true })
    .fill("https://naver.me/mybrunchcafe")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()
  await expect(page.getByText("브런치모먼트 홍대점")).toBeVisible()
  await page.getByRole("button", { name: "매장 정보 확인" }).click()
  await page.getByRole("button", { name: "다음: GBP 세팅 확인" }).click()
  await expect(page.getByText("인증 대기", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "대시보드로 이동" }).click()
  await expect(page).toHaveURL(/\/app/)
  await expect(page.getByText("STEP 2 · 사진 자동 고도화")).toBeVisible()
}

test.beforeEach(() => {
  resetFirstTimeE2eDatabase()
})

test("flow navigation keyboard changes the active step", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await page.getByRole("button", { name: "이메일로 시작" }).click()
  await completeOnboarding(page)

  const photoTab = page.getByRole("button", { name: "사진 고도화" })
  const postingTab = page.getByRole("button", { name: "다채널 포스팅" })

  await expect(photoTab).toHaveAttribute("aria-current", "page")
  await postingTab.click()
  await expect(postingTab).toHaveAttribute("aria-current", "page")
  await expect(
    page.getByText("이미지와 홍보 의도를 먼저 분석하면")
  ).toBeVisible()

  writeFileSync(
    ".omo/evidence/task-3-bottom-nav-keyboard.txt",
    `active=${await postingTab.getAttribute("aria-current")}\n`
  )
})

test("bottom chat composer accepts typed text", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await page.getByRole("button", { name: "이메일로 시작" }).click()
  await completeOnboarding(page)

  const composer = page.getByRole("textbox", { name: "메시지 입력" })
  await composer.fill("이번 주말 신메뉴를 홍보하고 싶어요")

  await expect(composer).toHaveValue("이번 주말 신메뉴를 홍보하고 싶어요")
})

test("app onboarding quick replies drive the bottom composer", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await page.getByRole("button", { name: "이메일로 시작" }).click()
  await completeOnboarding(page)

  await page.getByRole("button", { name: "온보딩" }).click()
  const composer = page.getByRole("textbox", { name: "메시지 입력" })

  await page.getByRole("button", { name: "네이버 플레이스 링크 붙여넣기" }).click()
  await expect(composer).toBeFocused()
  await expect(composer).toHaveValue("https://naver.me/mybrunchcafe")

  await page.getByRole("button", { name: "상호명으로 검색" }).click()
  await expect(composer).toHaveValue("브런치모먼트")

  await composer.press("Enter")
  await expect(page.getByText("브런치모먼트 홍대점")).toBeVisible()
  await expect(page.getByRole("button", { name: "온보딩" })).toHaveAttribute(
    "aria-current",
    "page"
  )

  await composer.fill("https://naver.me/mybrunchcafe")
  await page.getByRole("button", { name: "전송" }).click()
  await expect(page.getByText("네이버에서 매장 정보를 찾았습니다.")).toBeVisible()
  await expect(page.getByRole("button", { name: "온보딩" })).toHaveAttribute(
    "aria-current",
    "page"
  )

  await composer.fill("서울커피")
  await composer.press("Enter")
  await expect(page.getByText("서울커피 홍대점")).toBeVisible()
  await expect(page.getByRole("button", { name: "온보딩" })).toHaveAttribute(
    "aria-current",
    "page"
  )
})

test("mobile shell frame keeps controls visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.context().clearCookies()
  await page.goto("/")
  await page.getByRole("button", { name: "이메일로 시작" }).click()
  await completeOnboarding(page)

  await expect(page.getByTestId("app-stage")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "사진 고도화" })
  ).toHaveAttribute("aria-current", "page")

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
