import { expect, test } from "@playwright/test"

import { resetE2eDatabaseWithoutGbpLocation } from "./db-harness"

const demoCookieHeader =
  "glocalx_demo_session=demo-owner; glocalx_demo_store=demo-store"

test.beforeEach(async () => {
  await resetE2eDatabaseWithoutGbpLocation()
})

// Final GBP submission moved to the admin dashboard (the Stores console's
// "제출 대기" section) — this endpoint is now a session-gated no-op that
// never reaches Google, so a direct call cannot create a listing an
// operator never reviewed.
test("owner-app GBP setup no longer reaches Google — it acknowledges review only", async ({
  request,
}) => {
  const response = await request.post("/api/gbp/setup", {
    data: { mode: "stub" },
    headers: { Cookie: demoCookieHeader },
  })

  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body).toEqual({
    status: "PENDING_ADMIN_REVIEW",
    message: "운영자가 확인 후 Google 비즈니스 프로필을 등록해드립니다.",
  })
})
