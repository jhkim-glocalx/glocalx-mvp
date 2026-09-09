import { expect, test } from "@playwright/test"

import {
  adminBaseUrl,
  e2eAdminEmail,
  e2eAdminPassword,
  ownerBaseUrl,
} from "./harness"

const ownerMessage = "매장 검색이 안 돼요"
const operatorReply = "제가 대신 등록해 드릴게요"
// The name registration gives a store before onboarding names it.
const newStoreName = "새 매장"

// An owner who gets stuck mid-onboarding can reach an operator without
// finishing onboarding first: the top-bar 도움 요청 entry opens the same CS
// thread the dashboard FAB does, and the message carries the onboarding stage
// the owner is standing on so the operator sees where they stalled.
test("an owner stuck in onboarding reaches the operator inbox with their stage", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext({ baseURL: ownerBaseUrl })
  const ownerPage = await ownerContext.newPage()
  await ownerPage.goto(`${ownerBaseUrl}/register`)
  await ownerPage.getByRole("textbox", { name: "이름" }).fill("온보딩 사장님")
  await ownerPage
    .getByRole("textbox", { name: "이메일" })
    .fill("onboarding-support@example.com")
  await ownerPage.getByLabel("비밀번호").fill("correct-horse-battery-staple")
  await ownerPage.getByRole("button", { name: "이메일로 회원가입" }).click()
  await expect(ownerPage).toHaveURL(/\/onboarding/)

  // Support is a named top-bar entry here, not the dashboard's corner FAB —
  // onboarding's own composer owns that corner.
  await expect(ownerPage.getByTestId("chat-fab")).toHaveCount(0)
  await ownerPage.getByTestId("onboarding-support-open").click()
  await ownerPage
    .getByRole("textbox", { name: "메시지 입력" })
    .fill(ownerMessage)
  await ownerPage.getByRole("button", { name: "보내기" }).click()
  await expect(
    ownerPage.locator(".gx-chat-bubble-owner", { hasText: ownerMessage })
  ).toBeVisible()

  const operatorContext = await browser.newContext({ baseURL: adminBaseUrl })
  const operatorPage = await operatorContext.newPage()
  await operatorPage.goto(`${adminBaseUrl}/login`)
  await operatorPage.getByLabel("이메일").fill(e2eAdminEmail)
  await operatorPage.getByLabel("비밀번호").fill(e2eAdminPassword)
  await operatorPage.getByRole("button", { name: "로그인" }).click()
  await expect(operatorPage).toHaveURL(/\/stores/)
  await operatorPage.goto(`${adminBaseUrl}/inbox`)

  const conversationItem = operatorPage.locator(".ops-inbox-item", {
    hasText: newStoreName,
  })
  await expect(conversationItem).toBeVisible({ timeout: 10_000 })
  await conversationItem.click()
  await expect(
    operatorPage
      .getByTestId("inbox-detail")
      .locator(".ops-msg-body", { hasText: ownerMessage })
  ).toBeVisible()
  // Section AND stage: the owner never left the first onboarding screen.
  await expect(operatorPage.getByTestId("msg-context").first()).toContainText(
    "온보딩 · 매장 정보 입력"
  )

  await operatorPage.getByRole("textbox", { name: "답장" }).fill(operatorReply)
  await operatorPage.getByRole("button", { name: "전송" }).click()

  await expect(
    ownerPage.locator(".gx-chat-bubble-assistant", { hasText: operatorReply })
  ).toBeVisible({ timeout: 15_000 })
})
