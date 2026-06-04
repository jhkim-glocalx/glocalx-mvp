import { expect, test } from "@playwright/test"

test("First-time demo login routes to onboarding", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")

  await page.getByRole("button", { name: "데모 시작" }).click()

  await expect(page).toHaveURL(/\/onboarding/)
  await expect(
    page.getByText("가게 상호명 또는 네이버 플레이스 링크")
  ).toBeVisible()
})

test("Returning demo login routes to the chat dashboard", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await page.getByRole("button", { name: "데모 시작" }).click()
  await page.getByRole("button", { name: "온보딩 완료" }).click()

  await expect(page).toHaveURL(/\/app/)
  await expect(
    page.getByRole("heading", { name: "GlocalX 대시보드" })
  ).toBeVisible()

  await page.goto("/")
  await page.getByRole("button", { name: "데모 시작" }).click()

  await expect(page).toHaveURL(/\/app/)
})

test("Protected app route redirects unauthenticated visitors to login", async ({
  page,
}) => {
  await page.context().clearCookies()

  await page.goto("/app")

  await expect(page).toHaveURL("/")
  await expect(page.getByRole("heading", { name: "GlocalX" })).toBeVisible()
})
