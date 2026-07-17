import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { demoStoreId } from "@/auth/session"
import { openDatabaseContext, type Queryable } from "@glocalx/db"
import { hasConfiguredPostgresDirectUrl } from "@glocalx/db/postgres/direct-url"

import { createDatabasePostStore } from "./post-store"
import { withRepositoryTestContext } from "./sqlite-characterization-support"

const countSchema = z
  .union([z.number(), z.string(), z.bigint()])
  .transform((value) => Number(value))

const postRowsSchema = z.object({
  attempts: countSchema,
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

  const draft = await store.readDraft("queryable-draft", demoStoreId)
  expect(draft).toBeDefined()
  const reservation = await store.reservePublishAttempt({
    draftId: "queryable-draft",
    idempotencyKey: "queryable-publish-key",
    now: new Date("2026-06-18T00:01:00.000Z"),
    platform: "GBP",
    storeId: demoStoreId,
  })
  expect(reservation.kind).toBe("reserved")
  await store.completePublishAttempt({
    draftId: "queryable-draft",
    externalPostId: "gbp-post-queryable",
    idempotencyKey: "queryable-publish-key",
    platform: "GBP",
    publicUrl: "https://business.google.com/local-post/gbp-post-queryable",
    storeId: demoStoreId,
  })
  const replayedReservation = await store.reservePublishAttempt({
    draftId: "queryable-draft",
    idempotencyKey: "queryable-publish-key",
    now: new Date("2026-06-18T00:02:00.000Z"),
    platform: "GBP",
    storeId: demoStoreId,
  })
  expect(replayedReservation.kind).toBe("replay")
  const replayedAttempt =
    replayedReservation.kind === "replay"
      ? replayedReservation.attempt
      : undefined
  const history = await store.readPublishHistory("queryable-draft", "GBP")
  const row = postRowsSchema.parse(
    await context.queryable.queryOne(
      'SELECT post_drafts.status AS "draftStatus", (SELECT COUNT(*) FROM post_publish_attempts WHERE idempotency_key = ?) AS attempts FROM post_drafts WHERE id = ?',
      ["queryable-publish-key", "queryable-draft"]
    )
  )

  expect(storedPreviewSchema.parse(draft?.preview)).toEqual({
    canPublish: true,
    englishCopy: "English copy",
    koreanCopy: "한국어 카피",
  })
  expect(replayedAttempt).toEqual({
    attemptNumber: 1,
    externalPostId: "gbp-post-queryable",
    platform: "GBP",
    publicUrl: "https://business.google.com/local-post/gbp-post-queryable",
    status: "SUCCEEDED",
  })
  expect(history).toEqual([replayedAttempt])
  expect(row).toEqual({ attempts: 1, draftStatus: "PUBLISHED" })
}

async function createPostgresPostPersistenceFixture(
  queryable: Queryable
): Promise<void> {
  await queryable.execute(
    `CREATE TEMP TABLE post_drafts (
      id text PRIMARY KEY,
      store_id text NOT NULL,
      owner_intent text NOT NULL,
      target_channel text NOT NULL,
      status text NOT NULL,
      korean_copy text NOT NULL,
      english_copy text NOT NULL,
      revision_of_draft_id text,
      marketing_preview_json text,
      created_at text NOT NULL
    )`
  )
  await queryable.execute(
    `CREATE TEMP TABLE post_publish_attempts (
      id text PRIMARY KEY,
      draft_id text NOT NULL,
      idempotency_key text NOT NULL UNIQUE,
      attempt_number integer NOT NULL,
      status text NOT NULL,
      platform text NOT NULL DEFAULT 'GBP',
      external_post_id text,
      gbp_post_id text,
      public_url text,
      error_code text,
      created_at text NOT NULL
    )`
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("post store queryable boundary", () => {
  it("persists drafts and publish attempts through SQLite Queryable", async () => {
    // Given: a migrated SQLite database exposed only through Queryable.
    vi.stubEnv("DATABASE_PROVIDER", "sqlite")
    await withRepositoryTestContext(async ({ queryable }) => {
      // When / Then: post persistence uses the provider-neutral boundary.
      await runPostStorePersistenceScenario({ queryable })
    })
  })

  it("runs Postgres post persistence checks when local Postgres env is configured", async () => {
    // Given: live Postgres integration is intentionally gated by both URLs.
    const missingEnvNames = [
      ...(!process.env["DATABASE_URL"] ? ["DATABASE_URL"] : []),
      ...(hasConfiguredPostgresDirectUrl(process.env)
        ? []
        : [
            "DATABASE_URL_DIRECT or DATABASE_URL_UNPOOLED or POSTGRES_URL_NON_POOLING",
          ]),
    ]
    if (missingEnvNames.length > 0) {
      console.info(`BLOCKED_BY_ENV missing ${missingEnvNames.join(",")}`)
      return
    }

    vi.stubEnv("DATABASE_PROVIDER", "postgres")
    const context = await openDatabaseContext()

    try {
      await context.queryable.transaction(async (transaction) => {
        await createPostgresPostPersistenceFixture(transaction)

        // When / Then: the same repository boundary runs on the Postgres queryable.
        await runPostStorePersistenceScenario({ queryable: transaction })
      })
    } finally {
      await context.close()
    }
  })
})
