import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

import {
  adminBaseUrl,
  e2eAdminEmail,
  e2eAdminPassword,
  ownerBaseUrl,
} from "./harness"

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3rGQAAAABJRU5ErkJggg==",
  "base64"
)

const brief = "주말 브런치 신메뉴를 사진과 함께 홍보하고 싶어요"
const finalCopy = "이번 주말, 새로운 브런치 메뉴를 만나보세요. 토·일 오전 10시."
const demoStoreName = "브런치모먼트 홍대점"

// Re-entering the campaigns tab is what refreshes the owner's status list —
// the hook deliberately fetches on nav selection rather than on an interval.
async function refreshOwnerCampaignList(page: Page): Promise<void> {
  await page.getByRole("button", { name: "홍보 콘텐츠 넣기" }).click()
  await page.getByRole("button", { name: "마케팅 소재 요청" }).click()
}

// The Phase 3 acceptance loop (delivery-plan §Phase 3, tasks 3–5): the owner
// uploads and briefs, an operator produces the material in the dashboard queue,
// and the owner gives an explicit go. Stub mode, both apps on one database.
test("owner submits a campaign, an operator produces it, and the owner approves", async ({
  browser,
}) => {
  // Owner: authenticated demo owner submits a photo + brief.
  const ownerContext = await browser.newContext({ baseURL: ownerBaseUrl })
  await ownerContext.addCookies([
    { name: "glocalx_demo_session", url: ownerBaseUrl, value: "demo-owner" },
    { name: "glocalx_demo_store", url: ownerBaseUrl, value: "demo-store" },
  ])
  const ownerPage = await ownerContext.newPage()
  await ownerPage.goto(`${ownerBaseUrl}/app`)
  await ownerPage.getByRole("button", { name: "마케팅 소재 요청" }).click()
  await ownerPage.locator('input[type="file"]').setInputFiles({
    buffer: tinyPng,
    mimeType: "image/png",
    name: "brunch.png",
  })
  await ownerPage
    .getByRole("textbox", { name: "무엇을, 어떻게 홍보하고 싶으신가요" })
    .fill(brief)
  await ownerPage.getByRole("button", { name: "요청 제출" }).click()
  await expect(ownerPage.getByText("요청이 제출되었습니다.")).toBeVisible()
  await expect(ownerPage.getByText("제출됨")).toBeVisible()

  // Operator: log in and find the request waiting in the queue's Submitted column.
  const operatorContext = await browser.newContext({ baseURL: adminBaseUrl })
  const operatorPage = await operatorContext.newPage()
  await operatorPage.goto(`${adminBaseUrl}/login`)
  await operatorPage.getByLabel("이메일").fill(e2eAdminEmail)
  await operatorPage.getByLabel("비밀번호").fill(e2eAdminPassword)
  await operatorPage.getByRole("button", { name: "로그인" }).click()
  await expect(operatorPage).toHaveURL(/\/stores/)
  await operatorPage.goto(`${adminBaseUrl}/queue`)

  const card = operatorPage
    .getByTestId("queue-column-submitted")
    .locator(".ops-queue-card", { hasText: demoStoreName })
  await expect(card).toBeVisible({ timeout: 10_000 })
  await card.click()
  await expect(operatorPage.getByTestId("queue-detail")).toBeVisible()
  await expect(
    operatorPage.getByTestId("queue-detail").locator(".ops-queue-brief-body")
  ).toHaveText(brief)

  // Claim it into production, which reveals the production controls.
  await operatorPage.getByTestId("start-production").click()
  await expect(operatorPage.getByTestId("queue-status")).toHaveText(
    "in_production"
  )

  // The material is incomplete, so the owner hand-off is refused until both a
  // processed asset and the final copy exist.
  await operatorPage.getByTestId("submit-for-review").click()
  await expect(
    operatorPage.getByText(
      "Upload at least one processed asset before sending this to the owner."
    )
  ).toBeVisible()

  await operatorPage.getByTestId("processed-upload").setInputFiles({
    buffer: tinyPng,
    mimeType: "image/png",
    name: "brunch-final.png",
  })
  await expect(operatorPage.getByText("Processed assets (1)")).toBeVisible()

  await operatorPage.getByTestId("final-copy").fill(finalCopy)
  await operatorPage.getByTestId("save-final-copy").click()
  await operatorPage.getByTestId("submit-for-review").click()
  await expect(operatorPage.getByTestId("queue-status")).toHaveText(
    "ready_for_review"
  )

  // Owner: the request now offers a review, showing the operator's final copy.
  await refreshOwnerCampaignList(ownerPage)
  await expect(ownerPage.getByText("검토 대기")).toBeVisible({
    timeout: 10_000,
  })
  await ownerPage.getByRole("button", { name: "소재 확인하기" }).click()
  await expect(ownerPage.getByTestId("campaign-review")).toBeVisible()
  await expect(ownerPage.getByTestId("campaign-review-copy")).toHaveText(
    finalCopy
  )

  // The explicit go: the card closes with a confirmation and the timeline
  // settles on 승인됨 — nothing publishes without this step.
  await ownerPage.getByTestId("campaign-review-go").click()
  await expect(
    ownerPage.getByText("승인했습니다. 게시 준비가 시작되면 알려드릴게요.")
  ).toBeVisible()
  await expect(ownerPage.getByTestId("campaign-review")).toHaveCount(0)
  await expect(ownerPage.getByText("승인됨")).toBeVisible()

  // The operator's board reflects the owner's decision on its next poll.
  const approvedCard = operatorPage
    .getByTestId("queue-column-publishing")
    .locator(".ops-queue-card", { hasText: demoStoreName })
  await expect(approvedCard).toBeVisible({ timeout: 15_000 })

  // Publish panel: the demo store has a verified GBP location and a linked
  // Instagram account, so both channels are offered and pre-selected.
  await approvedCard.click()
  await expect(operatorPage.getByTestId("publish-panel")).toBeVisible()
  await expect(operatorPage.getByTestId("publish-select-gbp")).toBeChecked()
  await expect(
    operatorPage.getByTestId("publish-select-instagram")
  ).toBeChecked()

  await operatorPage.getByTestId("publish-selected").click()
  await expect(operatorPage.getByTestId("queue-status")).toHaveText("published")
  await expect(operatorPage.getByTestId("publish-status-gbp")).toHaveText(
    "published"
  )
  await expect(operatorPage.getByTestId("publish-status-instagram")).toHaveText(
    "published"
  )

  // Owner: the same history, in their own words, on the status timeline.
  await refreshOwnerCampaignList(ownerPage)
  await expect(ownerPage.getByText("게시 완료").first()).toBeVisible({
    timeout: 10_000,
  })
  await expect(
    ownerPage.locator('[data-testid^="campaign-publish-status-"]').first()
  ).toContainText("인스타 게시 완료")
})

// The other half of the go/no-go seam: a change request returns the campaign to
// the operator with the owner's note attached, rather than settling it.
test("owner requests changes and the note reaches the operator queue", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext({ baseURL: ownerBaseUrl })
  await ownerContext.addCookies([
    { name: "glocalx_demo_session", url: ownerBaseUrl, value: "demo-owner" },
    { name: "glocalx_demo_store", url: ownerBaseUrl, value: "demo-store" },
  ])
  const ownerPage = await ownerContext.newPage()
  await ownerPage.goto(`${ownerBaseUrl}/app`)
  await ownerPage.getByRole("button", { name: "마케팅 소재 요청" }).click()
  await ownerPage.locator('input[type="file"]').setInputFiles({
    buffer: tinyPng,
    mimeType: "image/png",
    name: "dinner.png",
  })
  await ownerPage
    .getByRole("textbox", { name: "무엇을, 어떻게 홍보하고 싶으신가요" })
    .fill("저녁 코스 메뉴도 홍보하고 싶어요")
  await ownerPage.getByRole("button", { name: "요청 제출" }).click()
  await expect(ownerPage.getByText("요청이 제출되었습니다.")).toBeVisible()

  const operatorContext = await browser.newContext({ baseURL: adminBaseUrl })
  const operatorPage = await operatorContext.newPage()
  await operatorPage.goto(`${adminBaseUrl}/login`)
  await operatorPage.getByLabel("이메일").fill(e2eAdminEmail)
  await operatorPage.getByLabel("비밀번호").fill(e2eAdminPassword)
  await operatorPage.getByRole("button", { name: "로그인" }).click()
  await operatorPage.goto(`${adminBaseUrl}/queue`)

  const card = operatorPage
    .getByTestId("queue-column-submitted")
    .locator(".ops-queue-card", { hasText: "저녁 코스" })
  await expect(card).toBeVisible({ timeout: 10_000 })
  await card.click()
  await operatorPage.getByTestId("start-production").click()
  await operatorPage.getByTestId("processed-upload").setInputFiles({
    buffer: tinyPng,
    mimeType: "image/png",
    name: "dinner-final.png",
  })
  await expect(operatorPage.getByText("Processed assets (1)")).toBeVisible()
  await operatorPage.getByTestId("final-copy").fill("저녁 코스 메뉴 안내")
  await operatorPage.getByTestId("save-final-copy").click()
  await operatorPage.getByTestId("submit-for-review").click()
  await expect(operatorPage.getByTestId("queue-status")).toHaveText(
    "ready_for_review"
  )

  await refreshOwnerCampaignList(ownerPage)
  await ownerPage.getByRole("button", { name: "소재 확인하기" }).first().click()
  await ownerPage
    .getByRole("textbox", { name: "수정이 필요하면 어떤 부분인지 알려주세요" })
    .fill("사진을 조금 더 밝게 해주세요")
  await ownerPage.getByTestId("campaign-review-changes").click()
  await expect(
    ownerPage.getByText("수정 요청을 전달했습니다. 담당자가 다시 작업합니다.")
  ).toBeVisible()
  await expect(ownerPage.getByText("수정 요청됨")).toBeVisible()

  // The operator sees the campaign back in their working set with the note.
  const returned = operatorPage
    .getByTestId("queue-column-changes_requested")
    .locator(".ops-queue-card", { hasText: "저녁 코스" })
  await expect(returned).toBeVisible({ timeout: 15_000 })
  await returned.click()
  await expect(operatorPage.getByTestId("queue-review-events")).toContainText(
    "사진을 조금 더 밝게 해주세요"
  )
})
