import { expect, test } from "@playwright/test"

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

test("successful onboarding extraction and gbp setup", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await page.getByRole("button", { name: "이메일로 시작" }).click()

  await expect(
    page.getByRole("button", { name: "네이버 정보 제출" })
  ).toBeVisible()
  await page
    .getByRole("textbox", { name: "네이버 정보", exact: true })
    .fill("https://naver.me/mybrunchcafe")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()

  await expect(page.getByText("브런치모먼트 홍대점")).toBeVisible()
  await expect(page.getByText("영업시간 필요")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "매장 정보 확인" })
  ).toBeVisible()
  await page.getByRole("button", { name: "매장 정보 확인" }).click()

  await expect(
    page.getByRole("button", { name: "다음: GBP 세팅 확인" })
  ).toBeVisible()
  await page.getByRole("button", { name: "다음: GBP 세팅 확인" }).click()

  await expect(page.getByText("VERIFICATION_PENDING")).toBeVisible()
  await expect(page.getByText("setup-gbp-audit")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "대시보드로 이동" })
  ).toBeVisible()
  await page.screenshot({
    fullPage: true,
    path: ".omo/evidence/task-5-onboarding-success.png",
  })

  await page.getByRole("button", { name: "대시보드로 이동" }).click()
  await expect(page).toHaveURL(/\/app/)
})

test("onboarding quick actions and composer submit search the store", async ({
  page,
}) => {
  await page.context().clearCookies()
  await page.goto("/")
  await page.getByRole("button", { name: "이메일로 시작" }).click()

  const storeInput = page.getByRole("textbox", {
    name: "네이버 정보",
    exact: true,
  })

  await page.getByRole("button", { name: "상호명으로 검색" }).click()
  await expect(storeInput).toBeFocused()
  await expect(storeInput).toHaveValue("")
  await storeInput.fill("브런치모먼트")
  await storeInput.press("Enter")

  await expect(page.getByText("브런치모먼트 홍대점")).toBeVisible()

  await storeInput.fill("https://naver.me/mybrunchcafe")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()

  await expect(
    page.getByText("네이버에서 매장 정보를 찾았습니다.")
  ).toBeVisible()
})

test("onboarding link attach button focuses the composer", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await page.getByRole("button", { name: "이메일로 시작" }).click()

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
  await page.getByRole("button", { name: "이메일로 시작" }).click()

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
