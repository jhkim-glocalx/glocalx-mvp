import { expect, test } from "@playwright/test"

import { resetE2eDatabase } from "./db-harness"

const demoCookieHeader =
  "glocalx_demo_session=demo-owner; glocalx_demo_store=demo-store"
const testOrigin = `http://127.0.0.1:${process.env["PLAYWRIGHT_PORT"] ?? "3000"}`

test.beforeEach(async () => {
  await resetE2eDatabase()
})

test("Stub GBP setup reaches verification pending and records an audit log", async ({
  request,
}) => {
  const reviewResponse = await request.post("/api/gbp/setup", {
    data: {},
    headers: {
      Cookie: demoCookieHeader,
      Origin: testOrigin,
    },
  })

  expect(reviewResponse.status()).toBe(200)
  const review = await reviewResponse.json()
  expect(review).toMatchObject({
    status: "REGISTRATION_REVIEW_REQUIRED",
  })

  const response = await request.post("/api/gbp/setup", {
    data: { reviewToken: review.reviewToken },
    headers: {
      Cookie: demoCookieHeader,
      Origin: testOrigin,
    },
  })

  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body).toMatchObject({
    status: "VERIFICATION_PENDING",
    auditLogId: "setup-gbp-audit",
    followUpJobId: "setup-gbp-follow-up",
  })
})
