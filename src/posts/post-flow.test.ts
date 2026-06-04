import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"

import { createIntegrationAdapters } from "@/integrations"
import { applyMigrations, openDatabase, seedDemoData } from "@/server/db/sqlite"

import { createPostDraft, publishPostDraft, revisePostDraft } from "./post-flow"

const countRowSchema = z.object({
  count: z.number(),
})

describe("post-flow", () => {
  const tempPaths: string[] = []

  afterEach(async () => {
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
    tempPaths.length = 0
  })

  async function createDatabase() {
    const tempPath = await mkdtemp(join(tmpdir(), "glocalx-post-flow-"))
    tempPaths.push(tempPath)
    const database = openDatabase(join(tempPath, "posts.db"))
    applyMigrations(database)
    seedDemoData(database)
    return database
  }

  it("creates a GBP draft preview with Korean and English copy", async () => {
    // Given
    const database = await createDatabase()
    const adapters = createIntegrationAdapters({ database, env: {} })

    // When
    const result = createPostDraft({
      adapters,
      database,
      ownerIntent: "주말 브런치 신메뉴 홍보",
      storeId: "demo-store",
      targetChannel: "GBP",
    })

    // Then
    expect(result).toMatchObject({
      status: "DRAFT_READY",
      preview: {
        canPublish: true,
        koreanCopy:
          "브런치모먼트 홍대점에서 주말 브런치 신메뉴 홍보 소식을 전해드립니다.",
        englishCopy:
          "Sharing this update: 주말 브런치 신메뉴 홍보 Visit 브런치모먼트 홍대점 in 서울 마포구 와우산로 123.",
      },
    })
    database.close()
  })

  it("publishes a draft idempotently with deterministic stub history", async () => {
    // Given
    const database = await createDatabase()
    const adapters = createIntegrationAdapters({ database, env: {} })
    const draft = createPostDraft({
      adapters,
      database,
      ownerIntent: "주말 브런치 신메뉴 홍보",
      storeId: "demo-store",
      targetChannel: "GBP",
    })

    // When
    const firstPublish = publishPostDraft({
      adapters,
      database,
      draftId: draft.draftId,
      idempotencyKey: "publish-weekend-brunch",
      storeId: "demo-store",
    })
    const secondPublish = publishPostDraft({
      adapters,
      database,
      draftId: draft.draftId,
      idempotencyKey: "publish-weekend-brunch",
      storeId: "demo-store",
    })

    // Then
    expect(firstPublish).toEqual({
      status: "PUBLISHED",
      draftId: draft.draftId,
      gbpPostId: "stub-gbp-post",
      publicUrl: "https://business.google.com/local-post/stub-gbp-post",
      attemptNumber: 1,
      history: [
        {
          attemptNumber: 1,
          status: "SUCCEEDED",
          gbpPostId: "stub-gbp-post",
          publicUrl: "https://business.google.com/local-post/stub-gbp-post",
        },
      ],
    })
    expect(secondPublish).toEqual(firstPublish)

    const countRow = countRowSchema.parse(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM post_publish_attempts WHERE idempotency_key = 'publish-weekend-brunch'"
        )
        .get()
    )
    expect(countRow.count).toBe(1)
    database.close()
  })

  it("blocks publish when the GBP location is not verified", async () => {
    // Given
    const database = await createDatabase()
    const adapters = createIntegrationAdapters({ database, env: {} })
    database
      .prepare("UPDATE gbp_locations SET status = ? WHERE id = ?")
      .run("VERIFICATION_PENDING", "demo-gbp-location")
    const draft = createPostDraft({
      adapters,
      database,
      ownerIntent: "주말 브런치 신메뉴 홍보",
      storeId: "demo-store",
      targetChannel: "GBP",
    })

    // When
    const result = publishPostDraft({
      adapters,
      database,
      draftId: draft.draftId,
      idempotencyKey: "blocked-publish",
      storeId: "demo-store",
    })

    // Then
    expect(result).toEqual({
      status: "BLOCKED",
      code: "LOCATION_NOT_VERIFIED",
      message:
        "Google 비즈니스 프로필 인증이 완료되어야 게시글과 리뷰 답글을 라이브로 진행할 수 있습니다.",
    })
    database.close()
  })

  it("surfaces manual publish guidance after three failed attempts", async () => {
    // Given
    const database = await createDatabase()
    const adapters = createIntegrationAdapters({ database, env: {} })
    const draft = createPostDraft({
      adapters,
      database,
      ownerIntent: "주말 브런치 신메뉴 홍보",
      storeId: "demo-store",
      targetChannel: "GBP",
    })
    for (const attemptNumber of [1, 2, 3]) {
      database
        .prepare(
          "INSERT INTO post_publish_attempts (id, draft_id, idempotency_key, attempt_number, status, gbp_post_id, public_url, error_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(
          `failed-attempt-${attemptNumber}`,
          draft.draftId,
          `failed-key-${attemptNumber}`,
          attemptNumber,
          "FAILED",
          null,
          null,
          "STUB_FAILURE",
          "2026-06-04T00:00:00.000Z"
        )
    }

    // When
    const result = publishPostDraft({
      adapters,
      database,
      draftId: draft.draftId,
      idempotencyKey: "fourth-attempt",
      storeId: "demo-store",
    })

    // Then
    expect(result).toEqual({
      status: "MANUAL_PUBLISH_REQUIRED",
      code: "POST_PUBLISH_RETRY_LIMIT",
      message:
        "게시 시도가 3회 실패했습니다. Google Business Profile에서 직접 게시하고 상태를 확인해주세요.",
    })
    database.close()
  })

  it("regenerates edited drafts without deleting original draft history", async () => {
    // Given
    const database = await createDatabase()
    const adapters = createIntegrationAdapters({ database, env: {} })
    const original = createPostDraft({
      adapters,
      database,
      ownerIntent: "주말 브런치 신메뉴 홍보",
      storeId: "demo-store",
      targetChannel: "GBP",
    })

    // When
    const revised = revisePostDraft({
      adapters,
      database,
      originalDraftId: original.draftId,
      ownerIntent: "비 오는 날 따뜻한 라떼 홍보",
      storeId: "demo-store",
      targetChannel: "GBP",
    })

    // Then
    expect(revised.draftId).not.toBe(original.draftId)
    expect(revised.revisionOfDraftId).toBe(original.draftId)
    const countRow = countRowSchema.parse(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM post_drafts WHERE store_id = 'demo-store'"
        )
        .get()
    )
    expect(countRow.count).toBe(3)
    database.close()
  })
})
