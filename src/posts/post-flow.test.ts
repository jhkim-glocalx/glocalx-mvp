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
const storedMarketingPreviewSchema = z.object({
  platformPreviews: z.array(
    z.object({
      platform: z.enum(["GBP", "INSTAGRAM"]),
      translations: z.array(
        z.object({
          copy: z.string(),
        })
      ),
    })
  ),
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
    const result = await createPostDraft({
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
        englishCopy: "Sharing a fresh local-store update for this weekend.",
      },
    })
    database.close()
  })

  it("creates an image-led marketing draft with analysis, suggestion, and platform previews", async () => {
    // Given
    const database = await createDatabase()
    const adapters = createIntegrationAdapters({ database, env: {} })

    // When
    const result = await createPostDraft({
      adapters,
      database,
      imageAssets: [
        {
          dataUrl: "data:image/png;base64,c3R1Yi1pbWFnZQ==",
          id: "asset-menu",
          mimeType: "image/png",
          name: "menu.png",
          sizeBytes: 10,
        },
      ],
      ownerIntent: "이번 주말 브런치 신메뉴 홍보",
      storeId: "demo-store",
      suggestionMode: "request",
      targetChannel: "GBP",
    })

    // Then
    expect(result.preview.intentAnalysis).toMatchObject({
      objective: "주말 신메뉴 프로모션으로 방문 예약과 저장을 유도",
    })
    expect(result.preview.images?.[0]).toMatchObject({
      assetId: "asset-menu",
      editedLabel: "선명도 + 메뉴 집중",
    })
    expect(result.preview.suggestion).toMatchObject({
      id: "suggest-closeup-weekend-menu",
    })
    expect(result.preview.platformPreviews).toHaveLength(2)
    expect(result.preview.platformPreviews?.[0]).toMatchObject({
      platform: "GBP",
      imageAssetId: "asset-menu",
      translations: [
        {
          copy: "Weekend brunch news from Brunch Moment Hongdae. Visit us in Mapo-gu, Seoul for warm brunch and coffee this weekend.",
          label: "English",
          locale: "en",
        },
        {
          label: "Japanese",
          locale: "ja",
        },
        {
          label: "Chinese",
          locale: "zh",
        },
      ],
    })

    const row = database
      .prepare(
        "SELECT revision_of_draft_id, marketing_preview_json FROM post_drafts WHERE id = ?"
      )
      .get(result.draftId) as
      | { revision_of_draft_id: string | null; marketing_preview_json: string }
      | undefined
    expect(row?.revision_of_draft_id).toBeNull()
    const marketingPreview = storedMarketingPreviewSchema.parse(
      JSON.parse(row?.marketing_preview_json ?? "{}")
    )
    expect(marketingPreview).toMatchObject({
      platformPreviews: [{ platform: "GBP" }, { platform: "INSTAGRAM" }],
    })
    const firstStoredPreview = marketingPreview.platformPreviews[0]
    expect(firstStoredPreview).toBeDefined()
    if (firstStoredPreview !== undefined) {
      const firstStoredTranslation = firstStoredPreview.translations[0]
      expect(firstStoredTranslation).toBeDefined()
      if (firstStoredTranslation !== undefined) {
        expect(firstStoredTranslation.copy).not.toMatch(/\p{Script=Hangul}/u)
      }
    }
    database.close()
  })

  it("publishes a draft idempotently with deterministic stub history", async () => {
    // Given
    const database = await createDatabase()
    const adapters = createIntegrationAdapters({ database, env: {} })
    const draft = await createPostDraft({
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
    const draft = await createPostDraft({
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
    const draft = await createPostDraft({
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
    const original = await createPostDraft({
      adapters,
      database,
      ownerIntent: "주말 브런치 신메뉴 홍보",
      storeId: "demo-store",
      targetChannel: "GBP",
    })

    // When
    const revised = await revisePostDraft({
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
