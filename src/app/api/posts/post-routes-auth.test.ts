import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { resetDatabaseFile } from "@/server/db/sqlite"

import { POST as createDraft } from "./drafts/route"
import { POST as publishDraft } from "./[draftId]/publish/route"

const demoCookieHeader =
  "glocalx_demo_session=demo-owner; glocalx_demo_store=demo-store"

function createJsonRequest(
  url: string,
  body: Record<string, unknown>,
  cookieHeader?: string
): NextRequest {
  return new NextRequest(url, {
    body: JSON.stringify(body),
    headers: {
      ...(cookieHeader === undefined ? {} : { Cookie: cookieHeader }),
      "Content-Type": "application/json",
    },
    method: "POST",
  })
}

describe("post API route authorization", () => {
  beforeEach(() => {
    resetDatabaseFile()
  })

  afterEach(() => {
    resetDatabaseFile()
  })

  it("requires a valid session before creating a post draft", async () => {
    const response = await createDraft(
      createJsonRequest("http://localhost:3000/api/posts/drafts", {
        ownerIntent: "주말 브런치 신메뉴 홍보",
        storeId: "demo-store",
        targetChannel: "GBP",
      })
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({
      status: "AUTH_REQUIRED",
    })
  })

  it("rejects post draft requests for a store outside the session", async () => {
    const response = await createDraft(
      createJsonRequest(
        "http://localhost:3000/api/posts/drafts",
        {
          ownerIntent: "주말 브런치 신메뉴 홍보",
          storeId: "other-store",
          targetChannel: "GBP",
        },
        demoCookieHeader
      )
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      status: "FORBIDDEN",
    })
  })

  it("requires a valid session before publishing a post draft", async () => {
    const response = await publishDraft(
      createJsonRequest("http://localhost:3000/api/posts/demo-draft/publish", {
        storeId: "demo-store",
      }),
      { params: Promise.resolve({ draftId: "demo-draft" }) }
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({
      status: "AUTH_REQUIRED",
    })
  })

  it("rejects publish requests for a store outside the session", async () => {
    const response = await publishDraft(
      createJsonRequest(
        "http://localhost:3000/api/posts/demo-draft/publish",
        {
          storeId: "other-store",
        },
        demoCookieHeader
      ),
      { params: Promise.resolve({ draftId: "demo-draft" }) }
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      status: "FORBIDDEN",
    })
  })
})
