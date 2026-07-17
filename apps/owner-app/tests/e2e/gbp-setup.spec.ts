import { expect, test } from "@playwright/test"

import { resetE2eDatabase } from "./db-harness"

const demoCookieHeader =
  "glocalx_demo_session=demo-owner; glocalx_demo_store=demo-store"

test.beforeEach(async () => {
  await resetE2eDatabase()
})

test("Stub GBP setup reaches verification pending and records an audit log", async ({
  request,
}) => {
  const response = await request.post("/api/gbp/setup", {
    data: { mode: "stub" },
    headers: { Cookie: demoCookieHeader },
  })

  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body).toMatchObject({
    status: "VERIFICATION_PENDING",
    auditLogId: "setup-gbp-audit",
    followUpJobId: "setup-gbp-follow-up",
  })
})
