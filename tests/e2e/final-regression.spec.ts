import { expect, test, type Page } from "@playwright/test"
import { writeFileSync } from "node:fs"

import { openDatabase } from "../../src/server/db/sqlite"
import { resetE2eDatabase } from "./global-setup"

const prototypeChromePatterns = [
  /화면\s*구조도/,
  /기능\s*정의서\s*매핑/,
  /step\s*rail/i,
  /prototype\s*frame/i,
  /프로토타입\s*프레임/,
  /단계\s*레일/,
]

test.beforeEach(() => {
  resetFirstTimeE2eDatabase()
})

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
  await page.getByRole("button", { name: "시작하기" }).click()
  await page.getByLabel("네이버 정보").fill("https://naver.me/mybrunchcafe")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()
  await expect(page.getByText("브런치모먼트 홍대점")).toBeVisible()
  await page.getByRole("button", { name: "다음: GBP 세팅 확인" }).click()
  await expect(page.getByText("VERIFICATION_PENDING")).toBeVisible()
  await page.getByRole("button", { name: "대시보드로 이동" }).click()
}

test("full unified stub happy path", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await expectNoPrototypeChrome(page)
  await completeSetup(page)
  await expectNoPrototypeChrome(page)
  await page.getByLabel("홍보 의도").fill("주말 브런치 신메뉴 홍보")
  await page.getByRole("button", { name: "GBP 초안 만들기" }).click()
  await expect(
    page.getByText(
      "브런치모먼트 홍대점에서 주말 브런치 신메뉴 홍보 소식을 전해드립니다."
    )
  ).toBeVisible()
  await page.getByRole("button", { name: "GBP 게시하기" }).click()
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
