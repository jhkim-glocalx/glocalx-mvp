import { expect, test } from "@playwright/test"

import { resetFirstTimeE2eDatabase } from "./db-harness"
import { startEmailOnboarding } from "./email-auth-helpers"

test.beforeEach(async () => {
  await resetFirstTimeE2eDatabase()
})

test("successful onboarding extraction and gbp setup", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await startEmailOnboarding(page)

  await expect(
    page.getByRole("button", { name: "네이버 정보 제출" })
  ).toBeVisible()
  await page
    .getByRole("textbox", { name: "네이버 정보", exact: true })
    .fill("https://naver.me/mybrunchcafe")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()

  await expect(page.getByText("브런치모먼트 홍대점")).toBeVisible()
  await expect(
    page.getByText("검색된 매장이 맞나요?", { exact: false })
  ).toBeVisible()
  await expect(
    page.getByText("영업시간을 메시지로 알려주세요", { exact: false })
  ).toHaveCount(0)
  await page.getByRole("button", { exact: true, name: "예, 맞아요" }).click()
  await expect(page.getByText("영업시간 필요")).toBeVisible()
  await page
    .getByRole("textbox", { name: "네이버 정보", exact: true })
    .fill("평일 9-6이에요")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()
  await expect(page.getByRole("textbox", { name: "영업시간" })).toHaveValue(
    "평일 09:00-18:00"
  )
  await expect(page.getByRole("button", { name: "예, 맞아요" })).toBeVisible()
  await page.getByRole("button", { name: "예, 맞아요" }).click()

  const slotCompletionMessage = page.getByText("영업시간까지 확인했어요", {
    exact: false,
  })
  const gbpSetupButton = page.getByRole("button", {
    name: "다음: GBP 세팅 확인",
  })
  await expect(slotCompletionMessage).toBeVisible()
  await expect(gbpSetupButton).toBeVisible()
  const slotCompletionBox = await slotCompletionMessage.boundingBox()
  const gbpSetupBox = await gbpSetupButton.boundingBox()
  if (slotCompletionBox === null || gbpSetupBox === null) {
    throw new Error("Expected slot completion and GBP setup button positions.")
  }
  expect(slotCompletionBox.y).toBeLessThan(gbpSetupBox.y)
  await page.getByRole("button", { name: "다음: GBP 세팅 확인" }).click()

  await expect(page.getByText("Stub GBP Account")).toBeVisible()
  await page
    .getByRole("button", { name: "매장형 비즈니스로 GBP 등록 승인" })
    .click()

  await expect(page.getByText("VERIFICATION_PENDING")).toBeVisible()
  await expect(page.getByText("setup-gbp-audit")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "매장 홍보 처음 시키러 가기" })
  ).toBeVisible()
  await page.screenshot({
    fullPage: true,
    path: ".omo/evidence/task-5-onboarding-success.png",
  })

  await page.getByRole("button", { name: "매장 홍보 처음 시키러 가기" }).click()
  await expect(page).toHaveURL(/\/app\?nav=photo/)
  await expect(
    page.getByRole("button", { name: "홍보 콘텐츠 넣기" })
  ).toHaveAttribute("aria-current", "page")
  await expect(page.getByText("홍보를 하기위해 최소한의 사진")).toBeVisible()
})

test("onboarding quick actions and composer submit search the store", async ({
  page,
}) => {
  await page.context().clearCookies()
  await page.goto("/")
  await startEmailOnboarding(page)

  const storeInput = page.getByRole("textbox", {
    name: "네이버 정보",
    exact: true,
  })

  await page.getByRole("button", { name: "상호명으로 검색" }).click()
  await expect(storeInput).toBeFocused()
  await expect(storeInput).toHaveValue("브런치모먼트")
  await storeInput.press("Enter")

  await expect(page.getByText("브런치모먼트 홍대점")).toBeVisible()
  await expect(
    page.getByRole("button", { exact: true, name: "예, 맞아요" })
  ).toBeVisible()
  await page.getByRole("button", { name: "다시 검색" }).click()
  await expect(page.getByText("다시 찾을 상호명이나 네이버 링크")).toBeVisible()
  await expect(storeInput).toBeFocused()
  await expect(storeInput).toHaveValue("")

  await storeInput.fill("https://naver.me/mybrunchcafe")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()

  await expect(
    page.getByText("네이버에서 매장 정보를 찾았습니다.")
  ).toBeVisible()
})

test("onboarding fills missing form fields from natural-language owner text", async ({
  page,
}) => {
  await page.context().clearCookies()
  await page.goto("/")
  await startEmailOnboarding(page)

  const storeInput = page.getByRole("textbox", {
    name: "네이버 정보",
    exact: true,
  })
  await storeInput.fill("새가게")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()

  await expect(page.getByText("새가게 홍대점")).toBeVisible()
  await expect(
    page.getByRole("button", { exact: true, name: "예, 맞아요" })
  ).toBeVisible()
  await expect(page.getByText("먼저 전화번호를 메시지로")).toHaveCount(0)
  await page.getByRole("button", { exact: true, name: "예, 맞아요" }).click()
  const phoneField = page.getByRole("textbox", { name: "전화번호" })
  const prompt = page.getByText("먼저 전화번호를 메시지로")
  await expect(phoneField).toHaveCount(0)
  await expect(prompt).toBeVisible()

  await storeInput.fill("전화번호 1234")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()

  await expect(phoneField).toHaveCount(0)
  await expect(page.getByText("영업시간을 메시지로 알려주세요")).toBeVisible()

  await storeInput.fill("평일 9-6")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()

  await expect(page.getByRole("textbox", { name: "영업시간" })).toHaveValue(
    "평일 09:00-18:00"
  )
  await expect(phoneField).toHaveValue("1234")
  await expect(page.getByText("영업시간까지 확인했어요")).toBeVisible()
})

test("onboarding link attach button focuses the composer", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await startEmailOnboarding(page)

  const storeInput = page.getByRole("textbox", {
    name: "네이버 정보",
    exact: true,
  })

  await storeInput.fill("")
  await page.getByRole("button", { name: "네이버 링크 첨부" }).click()

  await expect(storeInput).toBeFocused()
  await expect(storeInput).toHaveValue("https://naver.me/mybrunchcafe")
})

test("onboarding no result manual fallback", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await startEmailOnboarding(page)

  await page
    .getByRole("textbox", { name: "네이버 정보", exact: true })
    .fill("없는가게zzzz")
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
