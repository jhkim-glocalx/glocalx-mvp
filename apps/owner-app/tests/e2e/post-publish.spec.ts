import { expect, test } from "@playwright/test"

import { resetE2eDatabase } from "./db-harness"

test.describe.configure({ mode: "serial" })

test.beforeEach(async () => {
  await resetE2eDatabase()
})

const demoCookieHeader =
  "glocalx_demo_session=demo-owner; glocalx_demo_store=demo-store"

test("Stub post draft creation still works while direct publish is admin-only", async ({
  request,
}) => {
  const draftResponse = await request.post("/api/posts/drafts", {
    data: {
      storeId: "demo-store",
      ownerIntent: "주말 브런치 신메뉴 홍보",
      targetChannel: "GBP",
    },
    headers: { Cookie: demoCookieHeader },
  })

  expect(draftResponse.status()).toBe(200)
  const draftBody = await draftResponse.json()
  expect(draftBody).toMatchObject({
    status: "DRAFT_READY",
    preview: {
      canPublish: true,
      koreanCopy:
        "브런치모먼트 홍대점에서 주말 브런치 신메뉴 홍보 소식을 전해드립니다.",
    },
  })

  const publishResponse = await request.post(
    `/api/posts/${draftBody.draftId}/publish`,
    {
      data: { storeId: "demo-store" },
      headers: { Cookie: demoCookieHeader },
    }
  )

  // Owner self-serve direct publish is paused — the admin Campaigns queue is
  // the only publish path for now, regardless of draft/location state.
  expect(publishResponse.status()).toBe(409)
  const publishBody = await publishResponse.json()
  expect(publishBody).toMatchObject({
    status: "BLOCKED",
    code: "ADMIN_PUBLISH_ONLY",
  })
})
