import { expect } from "@playwright/test"
import type { Page } from "@playwright/test"

export async function startEmailOnboarding(page: Page): Promise<void> {
  await page.getByRole("button", { name: "이메일로 시작" }).click()
  await expect(page).toHaveURL(/\/login/)
  await page.getByRole("link", { name: "회원가입" }).click()
  await page.getByRole("textbox", { name: "이름" }).fill("글로컬 사장님")
  await page.getByRole("textbox", { name: "이메일" }).fill("owner@example.com")
  await page.getByLabel("비밀번호").fill("correct-horse-battery-staple")
  await page.getByRole("button", { name: "이메일로 회원가입" }).click()
  await expect(page).toHaveURL(/\/onboarding/)
}
