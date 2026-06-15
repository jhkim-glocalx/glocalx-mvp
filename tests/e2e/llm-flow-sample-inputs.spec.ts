import { expect, test, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"

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
  await page.context().clearCookies()
  await page.goto("/")
  await page.getByRole("button", { name: "이메일로 시작" }).click()
  await page
    .getByRole("textbox", { name: "네이버 정보", exact: true })
    .fill("https://naver.me/mybrunchcafe")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()
  await expect(page.getByText("브런치모먼트 홍대점")).toBeVisible()
  await page.getByRole("button", { exact: true, name: "매장 확인" }).click()
  await page
    .getByRole("textbox", { name: "네이버 정보", exact: true })
    .fill("평일 9-6이에요")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()
  await expect(page.getByRole("textbox", { name: "영업시간" })).toHaveValue(
    "평일 09:00-18:00"
  )
  await page.getByRole("button", { name: "매장 정보 확인" }).click()
  await page.getByRole("button", { name: "다음: GBP 세팅 확인" }).click()
  await page.getByRole("button", { name: "대시보드로 이동" }).click()
  await expect(page).toHaveURL(/\/app/)
}

test.beforeEach(() => {
  resetFirstTimeE2eDatabase()
})

test("LLM posting flow analyzes sample images and revises through chat", async ({
  page,
}) => {
  await completeOnboarding(page)

  await page.getByRole("button", { name: "다채널 포스팅" }).click()
  await page.getByRole("button", { name: "사진 고도화" }).click()

  await page.locator('input[type="file"]').setInputFiles([
    {
      buffer: readFileSync(
        ".github/pr-assets/gbp-performance-dashboard/mobile-posting-draft.png"
      ),
      mimeType: "image/png",
      name: "brunch-toast.png",
    },
    {
      buffer: readFileSync(
        "docs/qa/store-retrieval-gbp-setup/screenshots/desktop-06-app-post.png"
      ),
      mimeType: "image/png",
      name: "iced-latte.png",
    },
  ])
  await expect(page.getByText("brunch-toast.png")).toBeVisible()
  await expect(page.getByText("iced-latte.png")).toBeVisible()

  await page
    .getByRole("textbox", { name: "홍보 의도" })
    .fill("이번 주말 바질 토마토 브런치와 아이스 라떼 세트 10% 할인")
  await page.getByRole("button", { name: "AI 분석 및 이미지 개선" }).click()

  await expect(page.getByText("의도 분석 결과")).toBeVisible()
  await expect(page.getByText("이미지 개선 결과")).toBeVisible()
  await expect(page.getByText("스마트 제안")).toBeVisible()

  const composer = page.getByRole("textbox", { name: "메시지 입력" })
  await composer.fill("제안을 반영해서 더 선명하고 따뜻한 톤으로 바꿔줘")
  await composer.press("Enter")

  await expect(page.getByText("완성된 게시물을 확인해주세요")).toBeVisible()
  await expect(page.getByRole("tab", { name: "Instagram 피드" })).toBeVisible()
  await expect(
    page.locator(".gx-post-copy").filter({ hasText: "바질 토마토 브런치" })
  ).toBeVisible()
})
