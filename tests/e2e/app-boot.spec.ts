import { expect, test } from "@playwright/test"

test("App boots locally and shows the GlocalX shell", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByRole("heading", { name: /혼자서도/ })).toBeVisible()
  await expect(page.getByRole("button", { name: "데모 시작" })).toBeVisible()
  await expect(page.getByText("GBP 홍보글 초안과 게시", { exact: true })).toBeVisible()
})
