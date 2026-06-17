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

test("First-time demo login routes to onboarding", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")

  await page.getByRole("button", { name: "이메일로 시작" }).click()

  await expect(page).toHaveURL(/\/onboarding/)
  await expect(page.getByText("네이버플레이스 링크나 상호명")).toBeVisible()
})

test("Kakao login routes to onboarding in local demo mode", async ({
  page,
}) => {
  await page.context().clearCookies()
  await page.goto("/")

  await page.getByRole("button", { name: "카카오로 3초 시작" }).click()

  await expect(page).toHaveURL(/\/onboarding/)
  await expect(page.getByText("네이버플레이스 링크나 상호명")).toBeVisible()

  const cookies = await page.context().cookies()
  expect(cookies.some((cookie) => cookie.name === "glocalx_demo_session")).toBe(
    true
  )
  expect(cookies.some((cookie) => cookie.name === "glocalx_demo_store")).toBe(
    true
  )
})

test("Google login routes to onboarding in local demo mode", async ({
  page,
}) => {
  await page.context().clearCookies()
  await page.goto("/")

  await page.getByRole("button", { name: "구글로 시작" }).click()

  await expect(page).toHaveURL(/\/onboarding/)
  await expect(page.getByText("네이버플레이스 링크나 상호명")).toBeVisible()

  const cookies = await page.context().cookies()
  expect(cookies.some((cookie) => cookie.name === "glocalx_demo_session")).toBe(
    true
  )
  expect(cookies.some((cookie) => cookie.name === "glocalx_demo_store")).toBe(
    true
  )
})

test("Returning demo login routes to the chat dashboard", async ({ page }) => {
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
  await expect(
    page.getByRole("button", { name: "다음: GBP 세팅 확인" })
  ).toBeVisible()
  await page.getByRole("button", { name: "다음: GBP 세팅 확인" }).click()
  await expect(page.getByText("인증 대기", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "매장 홍보 처음 시키러 가기" }).click()

  await expect(page).toHaveURL(/\/app\?nav=photo/)
  await expect(
    page.getByRole("button", { name: "홍보 콘텐츠 넣기" })
  ).toHaveAttribute("aria-current", "page")
  await expect(page.getByText("홍보를 하기위해 최소한의 사진")).toBeVisible()

  await page.goto("/")
  await page.getByRole("button", { name: "이메일로 시작" }).click()

  await expect(page).toHaveURL(/\/app/)
  await expect(
    page.getByRole("heading", { name: "홍보 실적 자세히 보기" })
  ).toBeVisible()
})

test("auth placeholders do not create a demo session", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")

  await expect(page.getByTestId("entry-device")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "이메일로 시작" })
  ).toBeEnabled()

  const cookies = await page.context().cookies()
  expect(cookies.some((cookie) => cookie.name === "glocalx_demo_session")).toBe(
    false
  )
})

test("Protected app route redirects unauthenticated visitors to login", async ({
  page,
}) => {
  await page.context().clearCookies()

  await page.goto("/app")

  await expect(page).toHaveURL("/")
  await expect(
    page.getByRole("heading", { name: /혼자서도\s*전 세계에 팝니다\./ })
  ).toBeVisible()
})
