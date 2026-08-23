import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

import {
  adminBaseUrl,
  e2eAdminEmail,
  e2eAdminPassword,
  ownerBaseUrl,
} from "./harness"

// Re-entering the store-verification tab is what refreshes the owner's access
// status — the hook fetches on nav selection, not on an interval.
async function refreshOwnerAccess(page: Page): Promise<void> {
  await page.getByRole("button", { name: "홍보 콘텐츠 넣기" }).click()
  await page.getByRole("button", { name: "가게 인증 및 등록" }).click()
}

// Phase 4 acceptance loop (delivery-plan §Phase 4): a store that has connected
// GBP shows the owner a coarse "we're on it" status; an operator drives the org
// manager-access grant hop by hop in the dashboard; and the owner sees it land
// as granted. Stub mode, both apps on one database.
test("an operator drives GBP org access to granted and the owner sees each phase", async ({
  browser,
}) => {
  // Owner: the demo store's access request starts in not_requested, which the
  // owner sees as the coarse "in progress" phase.
  const ownerContext = await browser.newContext({ baseURL: ownerBaseUrl })
  await ownerContext.addCookies([
    { name: "glocalx_demo_session", url: ownerBaseUrl, value: "demo-owner" },
    { name: "glocalx_demo_store", url: ownerBaseUrl, value: "demo-store" },
  ])
  const ownerPage = await ownerContext.newPage()
  await ownerPage.goto(`${ownerBaseUrl}/app`)
  await ownerPage.getByRole("button", { name: "가게 인증 및 등록" }).click()

  const ownerCard = ownerPage.getByTestId("gbp-access-card")
  await expect(ownerCard).toBeVisible({ timeout: 10_000 })
  await expect(ownerCard).toHaveAttribute("data-phase", "in_progress")
  await expect(ownerPage.getByText("매니저 액세스 처리 중이에요")).toBeVisible()

  // Operator: log in (lands on Stores) and find the store awaiting a grant.
  const operatorContext = await browser.newContext({ baseURL: adminBaseUrl })
  const operatorPage = await operatorContext.newPage()
  await operatorPage.goto(`${adminBaseUrl}/login`)
  await operatorPage.getByLabel("이메일").fill(e2eAdminEmail)
  await operatorPage.getByLabel("비밀번호").fill(e2eAdminPassword)
  await operatorPage.getByRole("button", { name: "로그인" }).click()
  await expect(operatorPage).toHaveURL(/\/stores/)

  const stateBadge = operatorPage.getByTestId("store-state-demo-store")
  await expect(stateBadge).toBeVisible({ timeout: 10_000 })
  await expect(stateBadge).toHaveText("요청 없음")

  // Drive the guided flow hop by hop; each state renders on the operator side.
  await operatorPage.getByTestId("store-action-SEND_INVITE-demo-store").click()
  await expect(stateBadge).toHaveText("초대됨")

  await operatorPage.getByTestId("store-action-MARK_PENDING-demo-store").click()
  await expect(stateBadge).toHaveText("대기 중")

  await operatorPage.getByTestId("store-action-GRANT-demo-store").click()
  await expect(stateBadge).toHaveText("권한 부여됨")

  // Owner: re-entering the section shows the grant landed.
  await refreshOwnerAccess(ownerPage)
  await expect(ownerPage.getByTestId("gbp-access-card")).toHaveAttribute(
    "data-phase",
    "granted",
    { timeout: 10_000 }
  )
  await expect(ownerPage.getByText("매니저 액세스가 연결됐어요")).toBeVisible()
})
