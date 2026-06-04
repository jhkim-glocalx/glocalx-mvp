import { expect, test } from "@playwright/test"

test("Stub GBP setup reaches verification pending and records an audit log", async ({
  request,
}) => {
  const response = await request.post("/api/gbp/setup", {
    data: { storeId: "demo-store", mode: "stub" },
  })

  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body).toMatchObject({
    status: "VERIFICATION_PENDING",
    auditLogId: "setup-gbp-audit",
    followUpJobId: "setup-gbp-follow-up",
  })
})
