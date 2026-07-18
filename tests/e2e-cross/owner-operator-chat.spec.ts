import { expect, test } from "@playwright/test"

import {
  adminBaseUrl,
  e2eAdminEmail,
  e2eAdminPassword,
  ownerBaseUrl,
} from "./harness"

const ownerMessage = "GBP 연결이 막혔어요"
const operatorReply = "바로 도와드릴게요"
const demoStoreName = "브런치모먼트 홍대점"

// The Phase 1 acceptance loop (delivery-plan §Phase 1): owner sends from the app
// → the message surfaces in the operator inbox with its section context within
// 5s → the operator's reply reaches the owner's widget within 5s → unread
// clears on read. One shared stub database, both apps live.
test("owner message reaches the operator inbox with context and the reply returns", async ({
  browser,
}) => {
  // Owner: an authenticated demo owner sends from the app dashboard.
  const ownerContext = await browser.newContext({ baseURL: ownerBaseUrl })
  await ownerContext.addCookies([
    { name: "glocalx_demo_session", url: ownerBaseUrl, value: "demo-owner" },
    { name: "glocalx_demo_store", url: ownerBaseUrl, value: "demo-store" },
  ])
  const ownerPage = await ownerContext.newPage()
  await ownerPage.goto(`${ownerBaseUrl}/app`)
  await ownerPage.getByTestId("chat-fab").click()
  await ownerPage
    .getByRole("textbox", { name: "메시지 입력" })
    .fill(ownerMessage)
  await ownerPage.getByRole("button", { name: "보내기" }).click()
  await expect(
    ownerPage.locator(".gx-chat-bubble-owner", { hasText: ownerMessage })
  ).toBeVisible()

  // Operator: log in and open the inbox.
  const operatorContext = await browser.newContext({ baseURL: adminBaseUrl })
  const operatorPage = await operatorContext.newPage()
  await operatorPage.goto(`${adminBaseUrl}/login`)
  await operatorPage.getByLabel("이메일").fill(e2eAdminEmail)
  await operatorPage.getByLabel("비밀번호").fill(e2eAdminPassword)
  await operatorPage.getByRole("button", { name: "로그인" }).click()
  await expect(operatorPage).toHaveURL(/\/stores/)
  await operatorPage.goto(`${adminBaseUrl}/inbox`)

  // The conversation surfaces (server-rendered on load / 5s poll), awaiting a
  // reply — the unread badge is the "awaiting" signal.
  const conversationItem = operatorPage.locator(".ops-inbox-item", {
    hasText: demoStoreName,
  })
  await expect(conversationItem).toBeVisible({ timeout: 10_000 })
  await expect(conversationItem.getByTestId("inbox-unread-badge")).toBeVisible()

  // Opening it shows the owner's message WITH the section it was sent from.
  await conversationItem.click()
  await expect(operatorPage.getByText(ownerMessage)).toBeVisible()
  await expect(operatorPage.getByTestId("msg-context").first()).toContainText(
    "home"
  )

  // The operator replies; it renders as an operator-authored bubble.
  await operatorPage.getByRole("textbox", { name: "Reply" }).fill(operatorReply)
  await operatorPage.getByRole("button", { name: "Send" }).click()
  await expect(
    operatorPage.locator(".ops-msg-admin", { hasText: operatorReply })
  ).toBeVisible()

  // Owner: the reply arrives in the widget as the single assistant persona
  // within a couple of poll cycles.
  await expect(
    ownerPage.locator(".gx-chat-bubble-assistant", { hasText: operatorReply })
  ).toBeVisible({ timeout: 15_000 })

  // Opening the conversation marked the owner message read, so the awaiting
  // badge clears on the next list poll.
  await expect(conversationItem.getByTestId("inbox-unread-badge")).toBeHidden({
    timeout: 10_000,
  })

  await ownerContext.close()
  await operatorContext.close()
})
