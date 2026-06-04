import { expect, test } from "@playwright/test"

test("App boots locally and shows the GlocalX shell", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByRole("heading", { name: "GlocalX" })).toBeVisible()
  await expect(page.getByText("글로컬 매장 운영을 시작합니다")).toBeVisible()
})
