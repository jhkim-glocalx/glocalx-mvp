import { expect, test } from "@playwright/test"

import {
  adminBaseUrl,
  e2eAdminEmail,
  e2eAdminPassword,
  ownerBaseUrl,
} from "./harness"

const openingMessage = "AI 모드로 문의드려요"
const draftTurnMessage = "홍보물 만드는 걸 도와주세요"
const editedDraftReply = "[검토됨] 홍보물 준비를 함께 도와드릴게요."
const humanTurnMessage = "이번엔 사람이 답해주세요"
const operatorManualReply = "제가 직접 이어서 도와드릴게요"
const demoStoreName = "브런치모먼트 홍대점"

// The Phase 2 acceptance loop (delivery-plan §Phase 2): an operator opts a
// conversation into `ai_draft`, the AI pre-composes a reply the owner never sees
// unsent, the operator reviews/edits/sends it, then hands the conversation back
// to `human` — which suppresses AI for the next owner message. Throughout, the
// owner's transcript reads as one continuous assistant. Stub mode, both apps
// live on one shared database.
test("operator drives an AI draft then hands the conversation back to human", async ({
  browser,
}) => {
  // Owner: an authenticated demo owner opens the widget and sends the first
  // message (a new conversation opens in `human` mode — no AI yet).
  const ownerContext = await browser.newContext({ baseURL: ownerBaseUrl })
  await ownerContext.addCookies([
    { name: "glocalx_demo_session", url: ownerBaseUrl, value: "demo-owner" },
    { name: "glocalx_demo_store", url: ownerBaseUrl, value: "demo-store" },
  ])
  const ownerPage = await ownerContext.newPage()
  await ownerPage.goto(`${ownerBaseUrl}/app`)
  await ownerPage.getByTestId("chat-fab").click()
  const ownerInput = ownerPage.getByRole("textbox", { name: "메시지 입력" })
  const ownerSend = ownerPage.getByRole("button", { name: "보내기" })
  await ownerInput.fill(openingMessage)
  await ownerSend.click()
  await expect(
    ownerPage.locator(".gx-chat-bubble-owner", { hasText: openingMessage })
  ).toBeVisible()

  // Operator: log in, open the inbox, and open the conversation.
  const operatorContext = await browser.newContext({ baseURL: adminBaseUrl })
  const operatorPage = await operatorContext.newPage()
  await operatorPage.goto(`${adminBaseUrl}/login`)
  await operatorPage.getByLabel("이메일").fill(e2eAdminEmail)
  await operatorPage.getByLabel("비밀번호").fill(e2eAdminPassword)
  await operatorPage.getByRole("button", { name: "로그인" }).click()
  await expect(operatorPage).toHaveURL(/\/stores/)
  await operatorPage.goto(`${adminBaseUrl}/inbox`)
  const conversationItem = operatorPage.locator(".ops-inbox-item", {
    hasText: demoStoreName,
  })
  await expect(conversationItem).toBeVisible({ timeout: 10_000 })
  await conversationItem.click()
  await expect(operatorPage.getByText(openingMessage)).toBeVisible()

  // Operator opts the conversation into AI-draft mode.
  const aiDraftButton = operatorPage.getByTestId("mode-ai_draft")
  await aiDraftButton.click()
  await expect(aiDraftButton).toHaveAttribute("aria-pressed", "true")

  // Owner sends again → the AI composes a DRAFT out-of-band. The draft is never
  // owner-visible, so the owner still sees zero assistant replies.
  await ownerInput.fill(draftTurnMessage)
  await ownerSend.click()
  await expect(
    ownerPage.locator(".gx-chat-bubble-owner", { hasText: draftTurnMessage })
  ).toBeVisible()

  // The draft surfaces in the operator console for review (5s detail poll).
  const draftCard = operatorPage.getByTestId("ai-draft")
  await expect(draftCard).toBeVisible({ timeout: 15_000 })
  const draftEditor = draftCard.getByRole("textbox", { name: "AI draft" })
  await expect(draftEditor).not.toHaveValue("")

  // The owner has NOT received any assistant bubble — the draft is invisible
  // until sent (the one-assistant illusion).
  await expect(ownerPage.locator(".gx-chat-bubble-assistant")).toHaveCount(0)

  // Operator edits the draft and sends it; the owner receives exactly the edited
  // text as the single assistant persona.
  await draftEditor.fill(editedDraftReply)
  await draftCard.getByRole("button", { name: "Send draft" }).click()
  await expect(
    ownerPage.locator(".gx-chat-bubble-assistant", {
      hasText: editedDraftReply,
    })
  ).toBeVisible({ timeout: 15_000 })
  await expect(operatorPage.getByTestId("ai-draft")).toBeHidden()

  // Handoff: flip back to human. The next owner message must NOT trigger AI.
  const humanButton = operatorPage.getByTestId("mode-human")
  await humanButton.click()
  await expect(humanButton).toHaveAttribute("aria-pressed", "true")

  await ownerInput.fill(humanTurnMessage)
  await ownerSend.click()
  await expect(
    ownerPage.locator(".gx-chat-bubble-owner", { hasText: humanTurnMessage })
  ).toBeVisible()

  // Give the owner poll + any (suppressed) compose window time to elapse, then
  // assert no new AI draft appeared and the owner still has only the one prior
  // assistant reply — AI was suppressed by the human handoff.
  await operatorPage.waitForTimeout(7000)
  await expect(operatorPage.getByTestId("ai-draft")).toBeHidden()
  await expect(ownerPage.locator(".gx-chat-bubble-assistant")).toHaveCount(1)

  // The operator replies by hand; it reaches the owner as the same assistant.
  await operatorPage
    .getByRole("textbox", { name: "Reply" })
    .fill(operatorManualReply)
  await operatorPage
    .locator(".ops-inbox-composer")
    .getByRole("button", { name: "Send" })
    .click()
  await expect(
    ownerPage.locator(".gx-chat-bubble-assistant", {
      hasText: operatorManualReply,
    })
  ).toBeVisible({ timeout: 15_000 })

  // The owner's transcript is one continuous assistant: two assistant replies
  // (the sent draft + the manual reply), never any AI/operator distinction.
  await expect(ownerPage.locator(".gx-chat-bubble-assistant")).toHaveCount(2)

  await ownerContext.close()
  await operatorContext.close()
})
