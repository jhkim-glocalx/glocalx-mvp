import { expect, test, type Page } from "@playwright/test"

const prototypeChromePatterns = [
  /화면\s*구조도/,
  /기능\s*정의서\s*매핑/,
  /step\s*rail/i,
  /prototype\s*frame/i,
  /프로토타입\s*프레임/,
  /단계\s*레일/,
]

async function expectNoPrototypeChrome(page: Page): Promise<void> {
  for (const pattern of prototypeChromePatterns) {
    await expect(page.getByText(pattern)).toHaveCount(0)
  }
}

test("App boots locally and shows the GlocalX shell", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByTestId("entry-device")).toBeVisible()
  await expect(
    page.getByRole("heading", { name: /혼자서도\s*전 세계에 팝니다\./ })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "이메일로 시작" })).toBeEnabled()
  await expectNoPrototypeChrome(page)
})
