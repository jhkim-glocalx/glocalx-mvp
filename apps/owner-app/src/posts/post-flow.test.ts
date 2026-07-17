import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"

import { createIntegrationAdapters } from "@glocalx/integrations"
import { createSqliteQueryable } from "@glocalx/db/sqlite-client"
import {
  applyMigrations,
  openDatabase,
  seedDemoData,
  type SqliteDatabase,
} from "@glocalx/db/sqlite"
import { createDatabasePostStore } from "@/server/repositories/post-store"

import { createPostDraft, revisePostDraft } from "./post-flow"

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
const draftPreviewRowSchema = z.object({
  marketing_preview_json: z.string(),
  revision_of_draft_id: z.string().nullable(),
})

describe("post-flow drafts", () => {
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

  function createPostStore(database: SqliteDatabase) {
    return createDatabasePostStore(createSqliteQueryable(database))
  }

  it("creates a GBP draft preview with Korean and English copy", async () => {
    // Given
    const database = await createDatabase()
    const adapters = createIntegrationAdapters({ database, env: {} })

    // When
    const result = await createPostDraft({
      adapters,
      ownerIntent: "주말 브런치 신메뉴 홍보",
      postStore: createPostStore(database),
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
      postStore: createPostStore(database),
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

    const row = draftPreviewRowSchema.parse(
      database
        .prepare(
          "SELECT revision_of_draft_id, marketing_preview_json FROM post_drafts WHERE id = ?"
        )
        .get(result.draftId)
    )
    expect(row.revision_of_draft_id).toBeNull()
    const marketingPreview = storedMarketingPreviewSchema.parse(
      JSON.parse(row.marketing_preview_json)
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

  it("regenerates edited drafts without deleting original draft history", async () => {
    // Given
    const database = await createDatabase()
    const adapters = createIntegrationAdapters({ database, env: {} })
    const postStore = createPostStore(database)
    const original = await createPostDraft({
      adapters,
      ownerIntent: "주말 브런치 신메뉴 홍보",
      postStore,
      storeId: "demo-store",
      targetChannel: "GBP",
    })

    // When
    const revised = await revisePostDraft({
      adapters,
      originalDraftId: original.draftId,
      ownerIntent: "비 오는 날 따뜻한 라떼 홍보",
      postStore,
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
