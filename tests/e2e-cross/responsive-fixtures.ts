import { expect, type Page } from "@playwright/test"

import { adminBaseUrl, e2eAdminEmail, e2eAdminPassword } from "./harness"

export const responsiveRoutes = [
  {
    path: "/stores",
    name: "stores",
    heading: "매장",
    content: '[data-testid="ops-stores"]',
  },
  {
    path: "/inbox",
    name: "inbox",
    heading: "인박스",
    content: '[aria-label="대화 목록"]',
  },
  {
    path: "/queue",
    name: "queue",
    heading: "대기열",
    content: '[aria-label="캠페인 요청"]',
  },
  { path: "/posts", name: "posts", heading: "게시물", content: "main" },
  {
    path: "/users",
    name: "users",
    heading: "사용자",
    content: '[data-testid="ops-users"]',
  },
  {
    path: "/settings",
    name: "settings",
    heading: "설정",
    content: '[aria-label="조직 게시 자격 증명"]',
  },
] as const

// This is the contract for the shared stub seed. Keeping the assertions next
// to the viewport matrix prevents an empty preview from making visual QA pass.
export const seededStateMatrix = {
  stores: '[data-testid="store-card-demo-store"]',
  inbox: '[aria-label="대화 목록"] .ops-inbox-item',
  queue: '[aria-label="캠페인 요청 보드"] [data-testid^="queue-column-"]',
  posts: "main h1",
  users: '[data-testid="ops-users"] [data-testid^="user-card-"]',
  settings: '[data-testid="metric-response"]',
} as const

export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto(`${adminBaseUrl}/login`)
  await page.getByLabel("이메일").fill(e2eAdminEmail)
  await page.getByLabel("비밀번호").fill(e2eAdminPassword)
  await page.getByRole("button", { name: "로그인" }).click()
  await expect(page).toHaveURL(/\/stores$/)
}

export async function assertSeededRouteState(
  page: Page,
  routeName: keyof typeof seededStateMatrix
): Promise<void> {
  const state = page.locator(seededStateMatrix[routeName])
  await expect(state.first()).toBeVisible()
}

export async function assertPageOverflowContract(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }))
  expect(overflow.bodyScrollWidth).toBe(overflow.viewportWidth)
  expect(overflow.documentScrollWidth).toBe(overflow.viewportWidth)
}
