import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"

import { createIntegrationAdapters } from "./index"
import { applyMigrations, openDatabase, seedDemoData } from "@/server/db/sqlite"

const countRowSchema = z.object({
  count: z.number(),
})

const stubSearchResultSchema = z.object({
  candidates: z.array(
    z.object({
      name: z.string(),
    })
  ),
})

describe("adapter-selection", () => {
  const tempPaths: string[] = []

  afterEach(async () => {
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
    tempPaths.length = 0
  })

  it("selects stub adapters by default and persists through the shared database", async () => {
    const tempPath = await mkdtemp(join(tmpdir(), "glocalx-adapter-selection-"))
    tempPaths.push(tempPath)
    const database = openDatabase(join(tempPath, "adapter.db"))
    applyMigrations(database)
    seedDemoData(database)

    const adapters = createIntegrationAdapters({ database, env: {} })
    const result = await adapters.naverSearch.searchLocal({
      query: "브런치모먼트",
      display: 5,
    })

    expect(adapters.mode).toBe("stub")
    expect(result.kind).toBe("ok")
    if (result.kind === "ok") {
      const stubSearchResult = stubSearchResultSchema.parse(result.value)
      expect(stubSearchResult.candidates[0]?.name).toBe("브런치모먼트 홍대점")
    }

    const countRow = countRowSchema.parse(
      database
        .prepare("SELECT COUNT(*) AS count FROM business_profile_extractions")
        .get()
    )
    expect(countRow.count).toBe(2)

    database.close()
  })
})
