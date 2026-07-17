import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"

import { createIntegrationAdapters } from "@glocalx/integrations"
import type { IntegrationAdapters } from "@glocalx/integrations/contracts"
import { createSqliteQueryable } from "@glocalx/db/sqlite-client"
import {
  applyMigrations,
  openDatabase,
  seedDemoData,
  type SqliteDatabase,
} from "@glocalx/db/sqlite"
import { createDatabasePostStore } from "@/server/repositories/post-store"

import { createPostDraft, publishPostDraft } from "./post-flow"

const countRowSchema = z.object({
  count: z.number(),
})

describe("post-flow publishing", () => {
  const tempPaths: string[] = []

  afterEach(async () => {
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
    tempPaths.length = 0
  })

  async function createDatabase() {
    const tempPath = await mkdtemp(join(tmpdir(), "glocalx-post-publish-"))
    tempPaths.push(tempPath)
    const database = openDatabase(join(tempPath, "posts.db"))
    applyMigrations(database)
    seedDemoData(database)
    return database
  }

  function createPostStore(database: SqliteDatabase) {
    return createDatabasePostStore(createSqliteQueryable(database))
  }

  it("publishes a draft idempotently without replaying local-post side effects", async () => {
    // Given
    const database = await createDatabase()
    const baseAdapters = createIntegrationAdapters({ database, env: {} })
    let localPostCalls = 0
    const adapters = {
      ...baseAdapters,
      gbpLocalPosts: {
        async createLocalPost() {
          localPostCalls += 1
          return {
            kind: "ok",
            value: {
              externalPostId: "stub-gbp-post",
              publicUrl: "https://business.google.com/local-post/stub-gbp-post",
            },
          }
        },
      },
    } satisfies IntegrationAdapters
    const postStore = createPostStore(database)
    const draft = await createPostDraft({
      adapters,
      ownerIntent: "주말 브런치 신메뉴 홍보",
      postStore,
      storeId: "demo-store",
      targetChannel: "GBP",
    })

    // When
    const firstPublish = await publishPostDraft({
      adapters,
      draftId: draft.draftId,
      idempotencyKey: "publish-weekend-brunch",
      postStore,
      storeId: "demo-store",
      targetChannel: "GBP",
    })
    const secondPublish = await publishPostDraft({
      adapters,
      draftId: draft.draftId,
      idempotencyKey: "publish-weekend-brunch",
      postStore,
      storeId: "demo-store",
      targetChannel: "GBP",
    })

    // Then
    expect(firstPublish).toEqual({
      status: "PUBLISHED",
      draftId: draft.draftId,
      externalPostId: "stub-gbp-post",
      platform: "GBP",
      publicUrl: "https://business.google.com/local-post/stub-gbp-post",
      attemptNumber: 1,
      history: [
        {
          attemptNumber: 1,
          status: "SUCCEEDED",
          externalPostId: "stub-gbp-post",
          platform: "GBP",
          publicUrl: "https://business.google.com/local-post/stub-gbp-post",
        },
      ],
    })
    expect(secondPublish).toEqual(firstPublish)
    expect(localPostCalls).toBe(1)

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
    const postStore = createPostStore(database)
    database
      .prepare("UPDATE gbp_locations SET status = ? WHERE id = ?")
      .run("VERIFICATION_PENDING", "demo-gbp-location")
    const draft = await createPostDraft({
      adapters,
      ownerIntent: "주말 브런치 신메뉴 홍보",
      postStore,
      storeId: "demo-store",
      targetChannel: "GBP",
    })

    // When
    const result = await publishPostDraft({
      adapters,
      draftId: draft.draftId,
      idempotencyKey: "blocked-publish",
      postStore,
      storeId: "demo-store",
      targetChannel: "GBP",
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

  it("publishes an Instagram preview without requiring GBP verification", async () => {
    // Given
    const database = await createDatabase()
    const adapters = createIntegrationAdapters({ database, env: {} })
    const postStore = createPostStore(database)
    database
      .prepare("UPDATE gbp_locations SET status = ? WHERE id = ?")
      .run("VERIFICATION_PENDING", "demo-gbp-location")
    const draft = await createPostDraft({
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
      ownerIntent: "주말 브런치 신메뉴 홍보",
      postStore,
      storeId: "demo-store",
      targetChannel: "INSTAGRAM",
    })

    // When
    const result = await publishPostDraft({
      adapters,
      draftId: draft.draftId,
      postStore,
      storeId: "demo-store",
      targetChannel: "INSTAGRAM",
    })

    // Then
    expect(result).toMatchObject({
      status: "PUBLISHED",
      platform: "INSTAGRAM",
      externalPostId: "stub-instagram-media",
      publicUrl: "https://www.instagram.com/p/stub-instagram-media/",
      history: [
        {
          attemptNumber: 1,
          externalPostId: "stub-instagram-media",
          platform: "INSTAGRAM",
          status: "SUCCEEDED",
        },
      ],
    })
    database.close()
  })

  it("does not publish a draft owned by another store", async () => {
    const database = await createDatabase()
    const baseAdapters = createIntegrationAdapters({ database, env: {} })
    let instagramCalls = 0
    const adapters = {
      ...baseAdapters,
      instagramPosts: {
        createPost(input) {
          instagramCalls += 1
          return baseAdapters.instagramPosts.createPost(input)
        },
      },
    } satisfies IntegrationAdapters
    const postStore = createPostStore(database)
    const draft = await createPostDraft({
      adapters,
      ownerIntent: "다른 매장 소유 게시물",
      postStore,
      storeId: "demo-store",
      targetChannel: "INSTAGRAM",
    })
    database
      .prepare(
        "INSERT INTO users (id, email, display_name, role, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(
        "other-owner",
        "other@example.com",
        "Other Owner",
        "OWNER",
        "2026-06-04T00:00:00.000Z"
      )
    database
      .prepare(
        "INSERT INTO stores (id, owner_user_id, name, address, category, onboarding_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        "other-store",
        "other-owner",
        "다른 매장",
        "서울",
        "RESTAURANT",
        "COMPLETED",
        "2026-06-04T00:00:00.000Z"
      )

    const result = await publishPostDraft({
      adapters,
      draftId: draft.draftId,
      postStore,
      storeId: "other-store",
      targetChannel: "INSTAGRAM",
    })

    expect(result).toMatchObject({
      status: "BLOCKED",
      code: "DRAFT_NOT_FOUND",
    })
    expect(instagramCalls).toBe(0)
    database.close()
  })

  it("rejects an idempotency key reused for a different publish target", async () => {
    const database = await createDatabase()
    const baseAdapters = createIntegrationAdapters({ database, env: {} })
    let instagramCalls = 0
    const adapters = {
      ...baseAdapters,
      instagramPosts: {
        createPost(input) {
          instagramCalls += 1
          return baseAdapters.instagramPosts.createPost(input)
        },
      },
    } satisfies IntegrationAdapters
    const postStore = createPostStore(database)
    const firstDraft = await createPostDraft({
      adapters,
      ownerIntent: "첫 번째 게시물",
      postStore,
      storeId: "demo-store",
      targetChannel: "INSTAGRAM",
    })
    const secondDraft = await createPostDraft({
      adapters,
      ownerIntent: "두 번째 게시물",
      postStore,
      storeId: "demo-store",
      targetChannel: "INSTAGRAM",
    })

    await publishPostDraft({
      adapters,
      draftId: firstDraft.draftId,
      idempotencyKey: "shared-owner-key",
      postStore,
      storeId: "demo-store",
      targetChannel: "INSTAGRAM",
    })
    const collision = await publishPostDraft({
      adapters,
      draftId: secondDraft.draftId,
      idempotencyKey: "shared-owner-key",
      postStore,
      storeId: "demo-store",
      targetChannel: "INSTAGRAM",
    })

    expect(collision).toMatchObject({
      status: "BLOCKED",
      code: "IDEMPOTENCY_KEY_CONFLICT",
    })
    expect(instagramCalls).toBe(1)
    database.close()
  })

  it("reserves an idempotency key before concurrent side effects", async () => {
    const database = await createDatabase()
    const baseAdapters = createIntegrationAdapters({ database, env: {} })
    let instagramCalls = 0
    const adapters = {
      ...baseAdapters,
      instagramPosts: {
        createPost(input) {
          instagramCalls += 1
          return baseAdapters.instagramPosts.createPost(input)
        },
      },
    } satisfies IntegrationAdapters
    const postStore = createPostStore(database)
    const draft = await createPostDraft({
      adapters,
      ownerIntent: "동시 게시 방지",
      postStore,
      storeId: "demo-store",
      targetChannel: "INSTAGRAM",
    })

    const results = await Promise.all([
      publishPostDraft({
        adapters,
        draftId: draft.draftId,
        idempotencyKey: "concurrent-key",
        postStore,
        storeId: "demo-store",
        targetChannel: "INSTAGRAM",
      }),
      publishPostDraft({
        adapters,
        draftId: draft.draftId,
        idempotencyKey: "concurrent-key",
        postStore,
        storeId: "demo-store",
        targetChannel: "INSTAGRAM",
      }),
    ])

    expect(instagramCalls).toBe(1)
    expect(results).toHaveLength(2)
    database.close()
  })

  it("records a failed reservation when the provider rejects publishing", async () => {
    const database = await createDatabase()
    const baseAdapters = createIntegrationAdapters({ database, env: {} })
    const adapters = {
      ...baseAdapters,
      instagramPosts: {
        async createPost() {
          throw new Error("provider rejected media")
        },
      },
    } satisfies IntegrationAdapters
    const postStore = createPostStore(database)
    const draft = await createPostDraft({
      adapters,
      ownerIntent: "실패 상태 기록",
      postStore,
      storeId: "demo-store",
      targetChannel: "INSTAGRAM",
    })

    const result = await publishPostDraft({
      adapters,
      draftId: draft.draftId,
      idempotencyKey: "provider-failure",
      postStore,
      storeId: "demo-store",
      targetChannel: "INSTAGRAM",
    })

    expect(result).toMatchObject({ status: "BLOCKED", code: "PUBLISH_FAILED" })
    expect(
      database
        .prepare(
          "SELECT status, error_code AS errorCode FROM post_publish_attempts WHERE idempotency_key = ?"
        )
        .get("provider-failure")
    ).toEqual({ status: "FAILED", errorCode: "PROVIDER_ERROR" })
    database.close()
  })

  it("surfaces manual publish guidance after three failed attempts", async () => {
    // Given
    const database = await createDatabase()
    const adapters = createIntegrationAdapters({ database, env: {} })
    const postStore = createPostStore(database)
    const draft = await createPostDraft({
      adapters,
      ownerIntent: "주말 브런치 신메뉴 홍보",
      postStore,
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
    const result = await publishPostDraft({
      adapters,
      draftId: draft.draftId,
      idempotencyKey: "fourth-attempt",
      postStore,
      storeId: "demo-store",
      targetChannel: "GBP",
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
})
