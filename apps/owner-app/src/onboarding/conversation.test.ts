import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import type { AdapterBusinessProfileCandidate } from "@glocalx/domain"
import { createIntegrationAdapters } from "@/integrations"
import { openDatabaseContext } from "@glocalx/db"
import { applyMigrations, seedDemoData } from "@glocalx/db/sqlite"
import { createDatabaseConversationStore } from "@/server/repositories/conversation-store"

import { processOnboardingSlotTurn } from "./conversation"

const tempDirectories: string[] = []
const onboardingTurnSchema = z.object({
  sessionId: z.string(),
})
const candidate: AdapterBusinessProfileCandidate = {
  address: "서울 마포구 와우산로 123",
  candidateId: "naver-chat-candidate",
  category: "브런치 카페",
  missingFields: ["phone", "hours"],
  name: "브런치모먼트 홍대점",
  source: "NAVER_LOCAL",
  sourceInput: "https://naver.me/mybrunchcafe",
}

function createTempDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "glocalx-onboarding-turn-"))
  tempDirectories.push(directory)
  return join(directory, "test.db")
}

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("processOnboardingSlotTurn", () => {
  it("replays duplicate client events through the async conversation store", async () => {
    // Given
    vi.stubEnv("DATABASE_PROVIDER", "sqlite")
    vi.stubEnv("GLOCALX_DB_PATH", createTempDatabasePath())
    const context = await openDatabaseContext()
    applyMigrations(context.legacySqliteDatabase)
    seedDemoData(context.legacySqliteDatabase)
    const conversationStore = createDatabaseConversationStore(context.queryable)

    try {
      // When
      const first = await processOnboardingSlotTurn({
        adapters: createIntegrationAdapters({ env: {} }),
        conversationStore,
        request: {
          candidate,
          clientEventId: "onboarding-use-case-replay",
          currentState: "slot_elicitation",
          ownerMessage: "전화번호는 02-1234-5678이에요.",
          requestedField: "phone",
        },
        storeId: "demo-store",
      })
      const firstSessionId = onboardingTurnSchema.parse(first).sessionId
      const replay = await processOnboardingSlotTurn({
        adapters: createIntegrationAdapters({ env: {} }),
        conversationStore,
        request: {
          candidate,
          clientEventId: "onboarding-use-case-replay",
          currentState: "slot_elicitation",
          ownerMessage: "전화번호는 010-9999-0000이에요.",
          requestedField: "phone",
          sessionId: firstSessionId,
        },
        storeId: "demo-store",
      })

      // Then
      expect(replay).toEqual(first)
    } finally {
      await context.close()
    }
  })
})
