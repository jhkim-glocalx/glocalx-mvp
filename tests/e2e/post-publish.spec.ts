import { expect, test } from "@playwright/test"

import { resetE2eDatabase } from "./global-setup"

test.describe.configure({ mode: "serial" })

test.beforeEach(() => {
  resetE2eDatabase()
})

const demoCookieHeader =
  "glocalx_demo_session=demo-owner; glocalx_demo_store=demo-store"

test("Stub post draft and publish returns deterministic GBP history", async ({
  request,
}) => {
  const draftResponse = await request.post("/api/posts/drafts", {
    data: {
      storeId: "demo-store",
      ownerIntent: "주말 브런치 신메뉴 홍보",
      targetChannel: "GBP",
    },
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
    }
  )

  expect(publishResponse.status()).toBe(200)
  const publishBody = await publishResponse.json()
  expect(publishBody).toMatchObject({
    status: "PUBLISHED",
    gbpPostId: "stub-gbp-post",
    publicUrl: "https://business.google.com/local-post/stub-gbp-post",
    history: [
      {
        attemptNumber: 1,
        status: "SUCCEEDED",
      },
    ],
  })
})

test("Publish is blocked for an unverified GBP location", async ({
  request,
}) => {
  await request.post("/api/gbp/setup", {
    data: { mode: "stub" },
    headers: { Cookie: demoCookieHeader },
  })
  const draftResponse = await request.post("/api/posts/drafts", {
    data: {
      storeId: "demo-store",
      ownerIntent: "주말 브런치 신메뉴 홍보",
      targetChannel: "GBP",
    },
  })
  const draftBody = await draftResponse.json()

  const publishResponse = await request.post(
    `/api/posts/${draftBody.draftId}/publish`,
    {
      data: { storeId: "demo-store" },
    }
  )

  expect(publishResponse.status()).toBe(409)
  const publishBody = await publishResponse.json()
  expect(publishBody).toMatchObject({
    code: "LOCATION_NOT_VERIFIED",
    message:
      "Google 비즈니스 프로필 인증이 완료되어야 게시글과 리뷰 답글을 라이브로 진행할 수 있습니다.",
  })
})
