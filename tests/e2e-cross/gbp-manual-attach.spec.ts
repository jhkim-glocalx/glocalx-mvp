import { expect, test } from "@playwright/test"

import {
  adminBaseUrl,
  e2eAdminEmail,
  e2eAdminPassword,
  ownerBaseUrl,
} from "./harness"

const ownerMessage = "GBP는 그냥 대신 만들어 주시면 안 될까요?"
const newStoreName = "직접연결 테스트 매장"

// The concierge half of GBP setup: the operator built the listing by hand in
// the Google UI and connects it to the owner's store. The owner never leaves
// the chat they asked in — the confirmation lands in that same thread.
test("an operator attaches a hand-built listing and the owner is told in chat", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext({ baseURL: ownerBaseUrl })
  const ownerPage = await ownerContext.newPage()
  await ownerPage.goto(`${ownerBaseUrl}/register`)
  await ownerPage.getByRole("textbox", { name: "이름" }).fill("연결 사장님")
  await ownerPage
    .getByRole("textbox", { name: "이메일" })
    .fill("manual-attach@example.com")
  await ownerPage.getByLabel("비밀번호").fill("correct-horse-battery-staple")
  await ownerPage.getByRole("button", { name: "이메일로 회원가입" }).click()
  await expect(ownerPage).toHaveURL(/\/onboarding/)

  // Confirming the profile is what puts the store in the operator's 제출 대기
  // list — the point at which a listing can be attached to it at all.
  await ownerPage
    .getByRole("textbox", { name: "네이버 정보", exact: true })
    .fill("https://naver.me/mybrunchcafe")
  await ownerPage.getByRole("button", { name: "네이버 정보 제출" }).click()
  await ownerPage
    .getByRole("button", { exact: true, name: "예, 맞아요" })
    .click()
  await ownerPage
    .getByRole("textbox", { name: "네이버 정보", exact: true })
    .fill("평일 9-6이에요")
  await ownerPage.getByRole("button", { name: "네이버 정보 제출" }).click()
  // Renamed off the stub candidate's name: the seeded demo store carries it
  // too, and the other cross specs locate their conversation by store name.
  await ownerPage.getByRole("textbox", { name: "상호" }).fill(newStoreName)
  await ownerPage.getByRole("button", { name: "예, 맞아요" }).click()
  await expect(
    ownerPage.getByText("영업시간까지 확인했어요", { exact: false })
  ).toBeVisible()

  // The owner asks for help and leaves the panel open, waiting.
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

  // The store with no access request row yet is the one awaiting submission —
  // the seeded demo store already has one, so it is never in this list.
  const pendingCard = operatorPage
    .getByTestId("ops-pending-setup-stores")
    .locator("li")
    .first()
  await expect(pendingCard).toBeVisible()
  await pendingCard
    .getByRole("combobox")
    .selectOption("locations/stub-org-owned")
  await pendingCard.getByRole("button", { name: "직접 연결" }).click()

  // Granted, and the store has moved out of 제출 대기 into the tracked list.
  await expect(
    operatorPage
      .locator('[data-testid^="store-state-"]', { hasText: "권한 부여됨" })
      .first()
  ).toBeVisible({ timeout: 10_000 })

  // The owner hears about it in the thread they asked in, not on a screen they
  // would have to go back and check.
  await expect(
    ownerPage.locator(".gx-chat-bubble-assistant", {
      hasText: "구글 비즈니스 프로필 연결을 완료했어요",
    })
  ).toBeVisible({ timeout: 15_000 })
})
