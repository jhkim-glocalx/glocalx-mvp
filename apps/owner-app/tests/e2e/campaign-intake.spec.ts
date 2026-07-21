import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

import { resetFirstTimeE2eDatabase } from "./db-harness"
import { startEmailOnboarding } from "./email-auth-helpers"

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3rGQAAAABJRU5ErkJggg==",
  "base64"
)

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
  await page.getByRole("button", { name: "매장 홍보 처음 시키러 가기" }).click()
  await expect(page).toHaveURL(/\/app\?nav=photo/)
}

test("submits a campaign request with a photo and shows it in the status timeline", async ({
  page,
}) => {
  await completeOnboarding(page)

  await page.getByRole("button", { name: "마케팅 소재 요청" }).click()
  await expect(
    page.getByRole("button", { name: "마케팅 소재 요청" })
  ).toHaveAttribute("aria-current", "page")

  await page.locator('input[type="file"]').setInputFiles({
    buffer: tinyPng,
    mimeType: "image/png",
    name: "brunch.png",
  })
  await expect(page.getByText("brunch.png")).toBeVisible()
  await page
    .getByRole("textbox", { name: "무엇을, 어떻게 홍보하고 싶으신가요" })
    .fill("주말 브런치 신메뉴를 사진과 함께 홍보하고 싶어요")
  await page.getByRole("button", { name: "요청 제출" }).click()

  await expect(page.getByText("요청이 제출되었습니다.")).toBeVisible()
  await expect(page.getByText("제출됨")).toBeVisible()
  await expect(
    page.getByText("주말 브런치 신메뉴를 사진과 함께 홍보하고 싶어요")
  ).toBeVisible()
})

test("rejects submission without a brief before calling the API", async ({
  page,
}) => {
  await completeOnboarding(page)

  await page.getByRole("button", { name: "마케팅 소재 요청" }).click()
  await page.locator('input[type="file"]').setInputFiles({
    buffer: tinyPng,
    mimeType: "image/png",
    name: "brunch.png",
  })
  await page.getByRole("button", { name: "요청 제출" }).click()

  await expect(page.getByText("알리고 싶은 내용을 입력해주세요.")).toBeVisible()
})

test("rejects a disallowed file type before calling the API", async ({
  page,
}) => {
  await completeOnboarding(page)

  await page.getByRole("button", { name: "마케팅 소재 요청" }).click()
  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from("not an image"),
    mimeType: "application/pdf",
    name: "menu.pdf",
  })
  await page
    .getByRole("textbox", { name: "무엇을, 어떻게 홍보하고 싶으신가요" })
    .fill("주말 브런치 신메뉴를 홍보하고 싶어요")
  await page.getByRole("button", { name: "요청 제출" }).click()

  await expect(
    page.getByText("허용되지 않는 파일 형식입니다: menu.pdf")
  ).toBeVisible()
})
