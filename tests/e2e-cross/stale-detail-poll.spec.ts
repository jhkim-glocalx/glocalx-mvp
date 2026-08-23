import { expect, test } from "@playwright/test"

import {
  adminBaseUrl,
  e2eAdminEmail,
  e2eAdminPassword,
  ownerBaseUrl,
} from "./harness"

// Bodies unique to this spec: the suite runs sequentially against one seeded
// database, so a string another spec also sends would match twice.
const openingMessage = "폴링 순서 확인용 문의드려요"
const draftTurnMessage = "초안을 하나 준비해 주세요"
const editedDraftReply = "[운영자 수정] 초안을 다듬어 보내드립니다."
const demoStoreName = "브런치모먼트 홍대점"

// Regression guard for the operator console's detail poll (inbox-console.tsx).
// The poll used to apply responses in ARRIVAL order, so a first request stalled
// behind a dev-server route compile could land after a newer one and roll state
// back: `pendingDraft` went null, which re-seeded the editor and silently threw
// away the operator's edit — the un-edited AI body then went to the owner. Each
// response now carries a ticket and is dropped if newer state has been applied.
//
// The stall is forced rather than waited for: the first detail response is
// fetched immediately (so it carries a pre-mode-change, pre-draft snapshot) and
// withheld until the operator has edited the draft. Without the guard this
// fails; the natural race is far too rare to test by repetition.
//
// Runs last in the suite (alphabetical, workers: 1) so the conversation state it
// leaves behind cannot reach another spec.
test("a stale detail poll cannot roll back the operator's draft edit", async ({
  browser,
}) => {
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

  const operatorContext = await browser.newContext({ baseURL: adminBaseUrl })
  const operatorPage = await operatorContext.newPage()
  await operatorPage.goto(`${adminBaseUrl}/login`)
  await operatorPage.getByLabel("이메일").fill(e2eAdminEmail)
  await operatorPage.getByLabel("비밀번호").fill(e2eAdminPassword)
  await operatorPage.getByRole("button", { name: "로그인" }).click()
  await expect(operatorPage).toHaveURL(/\/stores/)
  await operatorPage.goto(`${adminBaseUrl}/inbox`)

  // Hold the FIRST detail response open. route.fetch() runs now, so the snapshot
  // is taken before the mode change and before the draft exists; route.fulfill()
  // waits on the gate, delivering that stale snapshot on the test's cue.
  let releaseStaleResponse: () => void = () => {}
  const staleResponseGate = new Promise<void>((resolve) => {
    releaseStaleResponse = resolve
  })
  let markStaleResponseDelivered: () => void = () => {}
  const staleResponseDelivered = new Promise<void>((resolve) => {
    markStaleResponseDelivered = resolve
  })
  let firstDetailResponseHeld = false
  await operatorPage.route(
    "**/api/inbox/conversations/*/messages*",
    async (route) => {
      if (firstDetailResponseHeld) {
        await route.continue()
        return
      }
      firstDetailResponseHeld = true
      const response = await route.fetch()
      const body = await response.text()
      await staleResponseGate
      await route.fulfill({ response, body })
      markStaleResponseDelivered()
    }
  )

  const conversationItem = operatorPage.locator(".ops-inbox-item", {
    hasText: demoStoreName,
  })
  await expect(conversationItem).toBeVisible({ timeout: 10_000 })
  await conversationItem.click()

  const aiDraftButton = operatorPage.getByTestId("mode-ai_draft")
  await aiDraftButton.click()
  await expect(aiDraftButton).toHaveAttribute("aria-pressed", "true")

  await ownerInput.fill(draftTurnMessage)
  await ownerSend.click()

  const draftCard = operatorPage.getByTestId("ai-draft")
  await expect(draftCard).toBeVisible({ timeout: 15_000 })
  const draftEditor = draftCard.getByRole("textbox", { name: "AI 초안" })
  await expect(draftEditor).not.toHaveValue("")
  await draftEditor.fill(editedDraftReply)

  // Deliver the stale snapshot (mode=human, pendingDraft=null) and let React
  // settle. The edit must survive it.
  releaseStaleResponse()
  await staleResponseDelivered
  await expect(draftEditor).toHaveValue(editedDraftReply)
  await expect(aiDraftButton).toHaveAttribute("aria-pressed", "true")

  // And the owner must receive the edited text, not the AI's original body.
  await draftCard.getByRole("button", { name: "초안 전송" }).click()
  await expect(
    ownerPage.locator(".gx-chat-bubble-assistant", {
      hasText: editedDraftReply,
    })
  ).toBeVisible({ timeout: 15_000 })

  await ownerContext.close()
  await operatorContext.close()
})

// Companion guard for the same ticket machinery. Gating on "is this the newest
// ticket issued" rather than on a watermark of what has been applied looks
// equivalent until responses run slower than the 5s poll interval: every
// response is then superseded before it arrives, none is ever applied, and the
// panel freezes for as long as the backend stays slow — turning a slowdown into
// an operator blackout. Every detail response here is delayed past that
// interval, so the transcript must still arrive.
const slowMessage = "느린 응답에서도 보여야 하는 문의"
const slowResponseMs = 6_000

test("detail polls slower than the poll interval still reach the operator", async ({
  browser,
}) => {
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
    .fill(slowMessage)
  await ownerPage.getByRole("button", { name: "보내기" }).click()
  await expect(
    ownerPage.locator(".gx-chat-bubble-owner", { hasText: slowMessage })
  ).toBeVisible()

  const operatorContext = await browser.newContext({ baseURL: adminBaseUrl })
  const operatorPage = await operatorContext.newPage()
  await operatorPage.goto(`${adminBaseUrl}/login`)
  await operatorPage.getByLabel("이메일").fill(e2eAdminEmail)
  await operatorPage.getByLabel("비밀번호").fill(e2eAdminPassword)
  await operatorPage.getByRole("button", { name: "로그인" }).click()
  await expect(operatorPage).toHaveURL(/\/stores/)
  await operatorPage.goto(`${adminBaseUrl}/inbox`)

  // Every detail response lands after the next poll has already been issued.
  await operatorPage.route(
    "**/api/inbox/conversations/*/messages*",
    async (route) => {
      const response = await route.fetch()
      const body = await response.text()
      await new Promise((resolve) => setTimeout(resolve, slowResponseMs))
      await route.fulfill({ response, body })
    }
  )

  const conversationItem = operatorPage.locator(".ops-inbox-item", {
    hasText: demoStoreName,
  })
  await expect(conversationItem).toBeVisible({ timeout: 10_000 })
  await conversationItem.click()

  await expect(
    operatorPage
      .getByTestId("inbox-detail")
      .locator(".ops-msg-body", { hasText: slowMessage })
  ).toBeVisible({ timeout: 25_000 })

  await ownerContext.close()
  await operatorContext.close()
})

// `selectConversation` seeds the panel from the clicked list row so it renders
// immediately, but that row is up to one poll interval old. `setMode` used to
// short-circuit on `conversation?.mode === mode` against that seed, so a list
// claiming the conversation was already in the target mode suppressed the POST
// entirely — the button read as pressed while the server never changed, and the
// owner's next message went un-drafted. The short-circuit now requires a
// confirmed detail read. Ordering the list poll does NOT fix this: even a
// correctly ordered list response is a stale snapshot.
const staleRowMessage = "목록이 오래돼도 모드는 바뀌어야 해요"
const staleRowSentinel = "STALE-LIST-ROW-MARKER"

test("a stale list row cannot suppress a real mode change", async ({
  browser,
}) => {
  // Open a conversation of its own rather than inheriting one from the tests
  // above — this spec must hold up when run with -g.
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
    .fill(staleRowMessage)
  await ownerPage.getByRole("button", { name: "보내기" }).click()
  await expect(
    ownerPage.locator(".gx-chat-bubble-owner", { hasText: staleRowMessage })
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
    hasText: demoStoreName,
  })
  await expect(conversationItem).toBeVisible({ timeout: 10_000 })
  await conversationItem.click()

  // Put the server in `human`, confirmed by a real detail read, so the doctored
  // row below genuinely disagrees with it.
  const humanButton = operatorPage.getByTestId("mode-human")
  await expect(humanButton).toBeVisible({ timeout: 10_000 })
  await humanButton.click()
  await expect(humanButton).toHaveAttribute("aria-pressed", "true")

  // Every later list poll claims `ai_draft`. The sentinel rides along in a field
  // the sidebar renders, so the test can wait for proof that this payload
  // reached React state instead of guessing at the timing. Note the initial list
  // is server-rendered and never passes through here — only client polls do.
  await operatorPage.route("**/api/inbox/conversations", async (route) => {
    const response = await route.fetch()
    const payload = (await response.json()) as {
      conversations: {
        storeName: string
        mode: string
        lastMessageBody: string | null
      }[]
    }
    for (const conversation of payload.conversations) {
      // Only the row under test — the seed carries other cohort stores.
      if (conversation.storeName === demoStoreName) {
        conversation.mode = "ai_draft"
        conversation.lastMessageBody = staleRowSentinel
      }
    }
    await route.fulfill({ response, json: payload })
  })
  await expect(
    operatorPage
      .locator(".ops-inbox-item", { hasText: demoStoreName })
      .locator(".ops-inbox-preview", { hasText: staleRowSentinel })
  ).toBeVisible({ timeout: 15_000 })

  // Hold the detail read that re-selecting triggers: that read is exactly what
  // makes the short-circuit safe, so the window under test is before it lands.
  let releaseDetail: () => void = () => {}
  const detailGate = new Promise<void>((resolve) => {
    releaseDetail = resolve
  })
  let detailHeld = false
  await operatorPage.route(
    "**/api/inbox/conversations/*/messages*",
    async (route) => {
      if (detailHeld) {
        await route.continue()
        return
      }
      detailHeld = true
      const response = await route.fetch()
      const body = await response.text()
      await detailGate
      await route.fulfill({ response, body })
    }
  )

  const modePosts: string[] = []
  operatorPage.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/mode")) {
      modePosts.push(request.url())
    }
  })

  // Re-select: the panel is now seeded from the doctored row, which claims the
  // conversation is already in ai_draft.
  await operatorPage
    .locator(".ops-inbox-item", { hasText: demoStoreName })
    .click()

  const aiDraftButton = operatorPage.getByTestId("mode-ai_draft")
  await aiDraftButton.click()
  await expect
    .poll(() => modePosts.length, { timeout: 10_000 })
    .toBeGreaterThan(0)

  // And the server really did change: the mode survives the held detail
  // response and the authoritative poll that follows it.
  releaseDetail()
  await expect(aiDraftButton).toHaveAttribute("aria-pressed", "true", {
    timeout: 15_000,
  })

  await ownerContext.close()
  await operatorContext.close()
})
