import { expect, test, type Page } from "@playwright/test"

import { resetE2eDatabase } from "./global-setup"

async function addDemoSessionCookies(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: "glocalx_demo_session",
      url: "http://127.0.0.1:3000",
      value: "demo-owner",
    },
    {
      name: "glocalx_demo_store",
      url: "http://127.0.0.1:3000",
      value: "demo-store",
    },
  ])
}

async function readOverflowMetrics(page: Page) {
  return page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
}

test.beforeEach(() => {
  resetE2eDatabase()
})

test("performance route rejects unauthenticated requests", async ({
  request,
}) => {
  // Given: no app session cookies.
  // When: the performance endpoint is requested.
  const response = await request.get("/api/gbp/performance")

  // Then: the request is rejected before any store id is accepted.
  expect(response.status()).toBe(401)
  await expect(response.json()).resolves.toEqual({
    message: "로그인이 필요합니다.",
    status: "UNAUTHENTICATED",
  })
})

test("performance route ignores query store ids and returns demo GBP totals", async ({
  page,
}) => {
  // Given: an authenticated demo owner session.
  await addDemoSessionCookies(page)
  await page.goto("/app")

  // When: the client asks for a different store id in the query string.
  const payload = await page.evaluate(async () => {
    const response = await fetch("/api/gbp/performance?storeId=evil-store")
    return {
      body: await response.json(),
      status: response.status,
    }
  })

  // Then: the endpoint uses the cookie-bound demo store instead.
  expect(payload).toMatchObject({
    body: {
      locationName: "브런치모먼트 홍대점",
      metrics: [
        { key: "impressions", total: 1200 },
        { key: "directions", total: 90 },
        { key: "calls", total: 30 },
        { key: "website", total: 120 },
      ],
      status: "READY",
    },
    status: 200,
  })
})

test("app dashboard shows core GBP stats and keeps posting flow available", async ({
  page,
}) => {
  // Given: an authenticated demo owner on a mobile viewport.
  await page.setViewportSize({ width: 390, height: 900 })
  await addDemoSessionCookies(page)

  // When: the owner opens the app.
  await page.goto("/app")

  // Then: the dashboard-first landing is visible.
  await expect(
    page.getByRole("heading", { name: "성과 대시보드" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "성과 대시보드" })
  ).toHaveAttribute("aria-current", "page")

  // When: the owner opens the reference report and dashboard screens.
  await page.getByRole("button", { name: "성과 리포트" }).click()

  // Then: the report card is visible.
  await expect(page.getByText("주간 성과 리포트 · 5/26~6/1")).toBeVisible()
  await expect(page.getByText("12,480")).toBeVisible()
  await page
    .getByRole("button", { name: "📊 성과 대시보드 자세히 보기" })
    .click()
  await expect(
    page.getByRole("heading", { name: "성과 대시보드" })
  ).toBeVisible()
  await expect(page.getByText("채널별 노출 비중")).toBeVisible()
  const dashboardMetrics = await readOverflowMetrics(page)
  await page.screenshot({
    fullPage: true,
    path: ".omo/evidence/gbp-performance-dashboard-mobile.png",
  })
  expect(dashboardMetrics.documentScrollWidth).toBeLessThanOrEqual(
    dashboardMetrics.innerWidth
  )
  expect(dashboardMetrics.bodyScrollWidth).toBeLessThanOrEqual(
    dashboardMetrics.innerWidth
  )

  // When: the owner switches back to posting.
  await page.getByRole("button", { name: "뒤로" }).click()
  await page.getByRole("button", { name: "다채널 포스팅" }).click()

  // Then: the posting flow remains available.
  await expect(
    page.getByText("이미지와 홍보 의도를 먼저 분석하면")
  ).toBeVisible()
  const metrics = await readOverflowMetrics(page)
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.innerWidth)
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth)
})
