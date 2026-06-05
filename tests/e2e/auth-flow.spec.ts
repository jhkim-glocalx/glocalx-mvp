import { expect, test } from "@playwright/test"

import { resetE2eDatabase } from "./global-setup"

test.beforeEach(() => {
  resetE2eDatabase()
})

test("First-time demo login routes to onboarding", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")

  await page.getByRole("button", { name: "시작하기" }).click()

  await expect(page).toHaveURL(/\/onboarding/)
  await expect(
    page.getByText("네이버 플레이스 링크나 가게 이름")
  ).toBeVisible()
})

test("Returning demo login routes to the chat dashboard", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await page.getByRole("button", { name: "시작하기" }).click()
  await page.getByLabel("네이버 정보").fill("https://naver.me/mybrunchcafe")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()
  await expect(page.getByText("브런치모먼트 홍대점")).toBeVisible()
  await page.getByRole("button", { name: "다음: GBP 세팅 확인" }).click()
  await expect(page.getByText("인증 대기")).toBeVisible()
  await page.getByRole("button", { name: "대시보드로 이동" }).click()

  await expect(page).toHaveURL(/\/app/)
  await expect(page.getByRole("heading", { name: "포스팅 작업실" })).toBeVisible()

  await page.goto("/")
  await page.getByRole("button", { name: "시작하기" }).click()

  await expect(page).toHaveURL(/\/app/)
})

test("auth placeholders do not create a demo session", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")

  await expect(page.getByTestId("entry-device")).toBeVisible()
  await expect(page.getByRole("button", { name: "시작하기" })).toBeEnabled()

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
  await expect(page.getByRole("heading", { name: "GlocalX" })).toBeVisible()
})
