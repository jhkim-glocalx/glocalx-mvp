import { expect, test, type Page } from "@playwright/test"

import { resetE2eDatabase } from "./db-harness"
import { evidencePath } from "./evidence"

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

test.beforeEach(async () => {
  await resetE2eDatabase()
})

test("owner sends a chat message that persists across a reload", async ({
  page,
}) => {
  // Given: an authenticated demo owner on the app surface.
  await addDemoSessionCookies(page)
  await page.goto("/app")

  const fab = page.getByTestId("chat-fab")
  await expect(fab).toBeVisible()

  // When: the owner opens the widget and sends a message.
  await fab.click()
  await expect(page.getByTestId("chat-messages")).toBeVisible()
  const composer = page.getByRole("textbox", { name: "메시지 입력" })
  await composer.fill("GBP 연결이 막혔어요")
  await page.getByRole("button", { name: "보내기" }).click()

  // Then: the send path clears the composer and renders an owner bubble.
  await expect(composer).toHaveValue("")
  const bubble = page.locator(".gx-chat-bubble-owner", {
    hasText: "GBP 연결이 막혔어요",
  })
  await expect(bubble).toBeVisible()
  await page.screenshot({ path: evidencePath("chat-widget-open.png") })

  // And: it survives a reload (persisted, not just optimistic state).
  await page.reload()
  await page.getByTestId("chat-fab").click()
  await expect(page.getByText("GBP 연결이 막혔어요")).toBeVisible()
})

test("chat API rejects unauthenticated sends", async ({ request }) => {
  const response = await request.post("/api/chat/messages", {
    data: {
      body: "hello",
      context: { activityTrail: [], section: "home", stage: null },
    },
  })
  expect(response.status()).toBe(401)
})
