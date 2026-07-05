import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { demoStoreId } from "@/auth/session"
import { openDatabaseContext, type Queryable } from "@/server/db"
import { applyMigrations, seedDemoData } from "@/server/db/sqlite"

import { createDatabasePostStore } from "./post-store"
import { withRepositoryTestContext } from "./sqlite-characterization-support"

const postRowsSchema = z.object({
  attempts: z.number(),
  draftStatus: z.literal("PUBLISHED"),
})

const storedPreviewSchema = z.object({
  canPublish: z.boolean(),
  englishCopy: z.string(),
  koreanCopy: z.string(),
})

async function runPostStorePersistenceScenario(context: {
  readonly queryable: Queryable
}): Promise<void> {
  const store = createDatabasePostStore(context.queryable)

  await store.upsertDraft({
    draftId: "queryable-draft",
    now: new Date("2026-06-18T00:00:00.000Z"),
    ownerIntent: "queryable persistence brunch update",
    preview: {
      canPublish: true,
      englishCopy: "English copy",
      koreanCopy: "한국어 카피",
    },
    storeId: demoStoreId,
    targetChannel: "GBP",
  })

  const draft = await store.readDraft("queryable-draft")
  await store.recordSuccessfulPublishAttempt({
    attemptNumber: await store.readNextAttemptNumber("queryable-draft"),
    draftId: draft.id,
    gbpPostId: "gbp-post-queryable",
    idempotencyKey: "queryable-publish-key",
    now: new Date("2026-06-18T00:01:00.000Z"),
    publicUrl: "https://business.google.com/local-post/gbp-post-queryable",
  })
  const replayedAttempt = await store.readAttemptByIdempotencyKey(
    "queryable-publish-key"
  )
  const history = await store.readPublishHistory("queryable-draft")
  const row = postRowsSchema.parse(
    await context.queryable.queryOne(
      "SELECT post_drafts.status AS draftStatus, (SELECT COUNT(*) FROM post_publish_attempts WHERE idempotency_key = ?) AS attempts FROM post_drafts WHERE id = ?",
      ["queryable-publish-key", "queryable-draft"]
    )
  )

  expect(storedPreviewSchema.parse(draft.preview)).toEqual({
    canPublish: true,
    englishCopy: "English copy",
    koreanCopy: "한국어 카피",
  })
  expect(replayedAttempt).toEqual({
    attemptNumber: 1,
    gbpPostId: "gbp-post-queryable",
    publicUrl: "https://business.google.com/local-post/gbp-post-queryable",
    status: "SUCCEEDED",
  })
  expect(history).toEqual([replayedAttempt])
  expect(row).toEqual({ attempts: 1, draftStatus: "PUBLISHED" })
}

describe("post store queryable boundary", () => {
  it("persists drafts and publish attempts through SQLite Queryable", async () => {
    // Given: a migrated SQLite database exposed only through Queryable.
    await withRepositoryTestContext(async ({ queryable }) => {
      const context = {
        close: async () => undefined,
        legacySqliteDatabase: undefined,
        queryable,
      }

      // When / Then: post persistence uses the provider-neutral boundary.
      await runPostStorePersistenceScenario(context)
    })
  })

  it("runs Postgres post persistence checks when local Postgres env is configured", async () => {
    // Given: live Postgres integration is intentionally gated by both URLs.
    const missingEnvNames = ["DATABASE_URL", "DATABASE_URL_DIRECT"].filter(
      (name) => !process.env[name]
    )
    if (missingEnvNames.length > 0) {
      console.info(`BLOCKED_BY_ENV missing ${missingEnvNames.join(",")}`)
      return
    }

    vi.stubEnv("DATABASE_PROVIDER", "postgres")
    const context = await openDatabaseContext()

    try {
      applyMigrations(context.legacySqliteDatabase)
      seedDemoData(context.legacySqliteDatabase)

      // When / Then: the same repository boundary runs on the Postgres queryable.
      await runPostStorePersistenceScenario(context)
    } finally {
      await context.close()
    }
  })
})
