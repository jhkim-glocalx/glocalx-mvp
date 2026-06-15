import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetDatabaseFile } from "@/server/db/sqlite"

import { POST as createDraft } from "./drafts/route"
import { POST as publishDraft } from "./[draftId]/publish/route"
import { POST as postingDecision } from "./conversation/decision/route"

const demoCookieHeader =
  "glocalx_demo_session=demo-owner; glocalx_demo_store=demo-store"
const tempPaths: string[] = []

async function useTempDatabase(): Promise<void> {
  const tempPath = await mkdtemp(join(tmpdir(), "glocalx-post-routes-"))
  tempPaths.push(tempPath)
  vi.stubEnv("GLOCALX_DB_PATH", join(tempPath, "routes.db"))
  resetDatabaseFile()
}

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
  beforeEach(async () => {
    await useTempDatabase()
  })

  afterEach(async () => {
    resetDatabaseFile()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
    tempPaths.length = 0
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

  it("returns JSON when production image draft generation fails upstream", async () => {
    vi.stubEnv("APP_INTEGRATION_MODE", "production")
    vi.stubEnv("OPENAI_API_KEY", "invalid-openai-key")
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({ error: { message: "upstream failed" } }),
          {
            headers: { "Content-Type": "application/json" },
            status: 500,
          }
        )
    )

    const response = await createDraft(
      createJsonRequest(
        "http://localhost:3000/api/posts/drafts",
        {
          imageAssets: [
            {
              dataUrl:
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3rGQAAAABJRU5ErkJggg==",
              id: "asset-menu",
              mimeType: "image/png",
              name: "menu.png",
              sizeBytes: 68,
            },
          ],
          ownerIntent: "이번 주말 브런치 신메뉴 홍보",
          storeId: "demo-store",
          targetChannel: "GBP",
        },
        demoCookieHeader
      )
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({
      message: "AI 분석을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.",
      status: "POST_DRAFT_GENERATION_FAILED",
    })
  })

  it("returns JSON when production posting decision classification fails upstream", async () => {
    vi.stubEnv("APP_INTEGRATION_MODE", "production")
    vi.stubEnv("OPENAI_API_KEY", "invalid-openai-key")
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({ error: { message: "upstream failed" } }),
          {
            headers: { "Content-Type": "application/json" },
            status: 500,
          }
        )
    )

    const response = await postingDecision(
      createJsonRequest(
        "http://localhost:3000/api/posts/conversation/decision",
        {
          activeSuggestionId: "suggest-closeup-weekend-menu",
          clientEventId: "posting-decision-upstream-failure",
          draftId: "draft-existing",
          draftSummary: "주말 브런치 신메뉴를 알리는 초안",
          ownerIntent: "이번 주말 브런치 신메뉴 홍보",
          ownerMessage: "제안을 반영해서 더 따뜻하게 바꿔줘",
          storeId: "demo-store",
          suggestionMessage:
            "대표 메뉴 사진을 첫 장으로 쓰면 저장 전환이 좋아집니다.",
          suggestionRevisedIntent:
            "이번 주말 브런치 신메뉴 홍보 · 대표 메뉴 첫 장 강조",
        },
        demoCookieHeader
      )
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({
      message: "AI 제안 응답을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.",
      status: "POSTING_CONVERSATION_FAILED",
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
