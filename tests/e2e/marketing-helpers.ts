import { expect, type Page } from "@playwright/test"

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3rGQAAAABJRU5ErkJggg==",
  "base64"
)

export async function uploadMarketingImageAndGenerateDraft(
  page: Page,
  intent = "이번 주말 브런치 신메뉴 홍보"
): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({
    buffer: tinyPng,
    mimeType: "image/png",
    name: "menu.png",
  })
  await expect(page.getByText("menu.png")).toBeVisible()
  await page.getByRole("textbox", { name: "홍보 의도" }).fill(intent)
  await page.getByRole("button", { name: "AI 분석 및 이미지 개선" }).click()
  await expect(page.getByText("의도 분석 결과")).toBeVisible()
  await expect(page.getByText("이미지 개선 결과")).toBeVisible()
}
