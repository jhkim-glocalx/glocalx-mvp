import { expect, test, type Page } from "@playwright/test"
import { writeFileSync } from "node:fs"

import { resetFirstTimeE2eDatabase } from "./db-harness"
import { startEmailOnboarding } from "./email-auth-helpers"
import { uploadMarketingImageAndGenerateDraft } from "./marketing-helpers"

const prototypeChromePatterns = [
  /화면\s*구조도/,
  /기능\s*정의서\s*매핑/,
  /step\s*rail/i,
  /prototype\s*frame/i,
  /프로토타입\s*프레임/,
  /단계\s*레일/,
]

test.beforeEach(async () => {
  await resetFirstTimeE2eDatabase()
})

async function expectNoPrototypeChrome(page: Page): Promise<void> {
  for (const pattern of prototypeChromePatterns) {
    await expect(page.getByText(pattern)).toHaveCount(0)
  }
}

async function readOverflowMetrics(page: Page) {
  return page.evaluate(() => {
    const overflowTolerance = 1
    const viewportWidth = window.innerWidth
    const overflowingElements = Array.from(
      document.querySelectorAll<HTMLElement>("body *")
    )
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const className =
          typeof element.className === "string" ? element.className : ""
        const label =
          element.getAttribute("data-testid") ??
          element.getAttribute("aria-label") ??
          element.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ??
          element.tagName.toLowerCase()

        return {
          className,
          label,
          left: Math.floor(rect.left),
          right: Math.ceil(rect.right),
          tag: element.tagName.toLowerCase(),
          width: Math.ceil(rect.width),
        }
      })
      .filter(
        ({ left, right, width }) =>
          width > 0 &&
          (left < -overflowTolerance ||
            right > viewportWidth + overflowTolerance)
      )

    return {
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      innerWidth: viewportWidth,
      overflowingElements,
    }
  })
}

async function completeSetup(page: Page): Promise<void> {
  await startEmailOnboarding(page)
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
  await expect(page.getByText("VERIFICATION_PENDING")).toBeVisible()
  await page.getByRole("button", { name: "매장 홍보 처음 시키러 가기" }).click()
}

test("full unified stub happy path", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await expectNoPrototypeChrome(page)
  await completeSetup(page)
  await expectNoPrototypeChrome(page)
  await expect(page).toHaveURL(/\/app\?nav=photo/)
  await expect(
    page.getByRole("button", { name: "홍보 콘텐츠 넣기" })
  ).toHaveAttribute("aria-current", "page")
  await uploadMarketingImageAndGenerateDraft(page)
  await page.getByRole("button", { name: "제안 없이 진행" }).click()
  await expect(page.getByText("완성된 게시물을 확인해주세요")).toBeVisible()
  await page.getByRole("button", { name: "GBP에 게시하기" }).click()
  await expect(
    page.getByText("Google 비즈니스 프로필 인증이 완료되어야")
  ).toBeVisible()
  writeFileSync(
    ".omo/evidence/task-13-full-happy-path.txt",
    "PASS: demo login -> onboarding extraction -> GBP setup -> app post draft -> publish blocked recovery\n"
  )
})

test("final responsive regression", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.context().clearCookies()
  await page.goto("/")
  await expectNoPrototypeChrome(page)
  await page.screenshot({
    fullPage: true,
    path: ".omo/evidence/design-unification-desktop.png",
  })

  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto("/")
  await expectNoPrototypeChrome(page)
  await page.screenshot({
    fullPage: true,
    path: ".omo/evidence/design-unification-mobile.png",
  })

  const metrics = await readOverflowMetrics(page)
  writeFileSync(
    ".omo/evidence/design-unification-overflow.json",
    JSON.stringify(metrics, null, 2)
  )

  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.innerWidth)
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth)
  expect(metrics.overflowingElements).toEqual([])
})
