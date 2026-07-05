import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"

import { createIntegrationAdapters } from "@/integrations"
import type { IntegrationAdapters } from "@/integrations/contracts"
import { createSqliteQueryable } from "@/server/db/sqlite-client"
import {
  applyMigrations,
  openDatabase,
  seedDemoData,
  type SqliteDatabase,
} from "@/server/db/sqlite"
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
        createLocalPost(input) {
          localPostCalls += 1
          return {
            kind: "ok",
            value: {
              body: {
                gbpPostId: "stub-gbp-post",
                publicUrl:
                  "https://business.google.com/local-post/stub-gbp-post",
                summary: input.summary,
              },
              headers: {},
              method: "POST",
              url: "stub://gbp/localPosts",
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
    })
    const secondPublish = await publishPostDraft({
      adapters,
      draftId: draft.draftId,
      idempotencyKey: "publish-weekend-brunch",
      postStore,
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
