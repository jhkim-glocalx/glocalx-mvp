import { describe, expect, it } from "vitest"
import { z } from "zod"

import { demoStoreId } from "@/auth/session"
import {
  createConversationSession,
  readConversationDraft,
  recordConversationTurn,
} from "@/conversations/repository"
import { createPostDraft, publishPostDraft } from "@/posts/post-flow"

import { createDatabasePostStore } from "./post-store"
import { withRepositoryTestContext } from "./sqlite-characterization-support"

const draftRowSchema = z.object({
  attempts: z.number(),
  draftStatus: z.literal("PUBLISHED"),
})

describe("SQLite conversation and post characterization", () => {
  it("characterizes conversation turn creation, replay, reads, and slot updates", async () => {
    await withRepositoryTestContext(({ database }) => {
      const session = createConversationSession(database, {
        id: "repository-conversation",
        kind: "onboarding",
        now: new Date("2026-06-14T00:00:00.000Z"),
        state: "slot_elicitation",
        storeId: demoStoreId,
      })
      const firstTurn = recordConversationTurn(database, {
        assistantMessage: "번호를 확인했어요.",
        clientEventId: "repository-event",
        eventId: "repository-turn-1",
        kind: "onboarding",
        nextState: "profile_summary",
        now: new Date("2026-06-14T00:01:00.000Z"),
        ownerMessage: "전화번호는 02-1234-5678이에요.",
        publicResponse: { assistantMessage: "번호를 확인했어요." },
        sessionId: session.id,
        slots: [
          {
            confidence: 0.97,
            key: "phone",
            source: "owner_message",
            value: "02-1234-5678",
          },
        ],
        storeId: demoStoreId,
      })
      const replayedTurn = recordConversationTurn(database, {
        assistantMessage: "저장되면 안 돼요.",
        clientEventId: "repository-event",
        eventId: "repository-turn-2",
        kind: "onboarding",
        nextState: "slot_elicitation",
        now: new Date("2026-06-14T00:02:00.000Z"),
        ownerMessage: "중복 제출",
        publicResponse: { assistantMessage: "저장되면 안 돼요." },
        sessionId: session.id,
        slots: [],
        storeId: demoStoreId,
      })
      const draft = readConversationDraft(database, {
        sessionId: session.id,
        storeId: demoStoreId,
      })

      expect(firstTurn.kind).toBe("created")
      expect(replayedTurn).toEqual({
        kind: "replayed",
        response: { assistantMessage: "번호를 확인했어요." },
      })
      expect(draft?.session.state).toBe("profile_summary")
      expect(draft?.messages).toHaveLength(2)
      expect(draft?.slots).toEqual([
        expect.objectContaining({
          confidence: 0.97,
          key: "phone",
          value: "02-1234-5678",
        }),
      ])
    })
  })

  it("characterizes post draft creation, publish updates, and idempotent replay", async () => {
    await withRepositoryTestContext(
      async ({ adapters, database, queryable }) => {
        const postStore = createDatabasePostStore(queryable)
        const draft = await createPostDraft({
          adapters,
          ownerIntent: "repository characterization brunch update",
          postStore,
          storeId: demoStoreId,
          targetChannel: "GBP",
        })
        const firstPublish = await publishPostDraft({
          adapters,
          draftId: draft.draftId,
          idempotencyKey: "repository-publish-key",
          postStore,
          storeId: demoStoreId,
        })
        const secondPublish = await publishPostDraft({
          adapters,
          draftId: draft.draftId,
          idempotencyKey: "repository-publish-key",
          postStore,
          storeId: demoStoreId,
        })
        const row = draftRowSchema.parse(
          database
            .prepare(
              "SELECT post_drafts.status AS draftStatus, (SELECT COUNT(*) FROM post_publish_attempts WHERE idempotency_key = 'repository-publish-key') AS attempts FROM post_drafts WHERE id = ?"
            )
            .get(draft.draftId)
        )

        expect(draft.status).toBe("DRAFT_READY")
        expect(firstPublish).toEqual({
          attemptNumber: 1,
          draftId: draft.draftId,
          gbpPostId: "stub-gbp-post",
          history: [
            {
              attemptNumber: 1,
              gbpPostId: "stub-gbp-post",
              publicUrl: "https://business.google.com/local-post/stub-gbp-post",
              status: "SUCCEEDED",
            },
          ],
          publicUrl: "https://business.google.com/local-post/stub-gbp-post",
          status: "PUBLISHED",
        })
        expect(secondPublish).toEqual(firstPublish)
        expect(row).toEqual({ attempts: 1, draftStatus: "PUBLISHED" })
      }
    )
  })
})
