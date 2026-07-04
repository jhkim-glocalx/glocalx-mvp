import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { openDatabaseContext } from "@/server/db"
import type { Queryable } from "@/server/db"

import { createDatabaseOnboardingExtractionRepository } from "./onboarding-extraction"

const tempDirectories: string[] = []

const manualExtractionRowSchema = z.object({
  missingFieldsJson: z.string(),
  status: z.string(),
})

function createTempDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "glocalx-extraction-repo-"))
  tempDirectories.push(directory)
  return join(directory, "test.db")
}

async function createExtractionFixture(queryable: Queryable): Promise<void> {
  await queryable.execute(
    "CREATE TEMP TABLE business_profile_extractions (id text PRIMARY KEY, store_id text NOT NULL, source text NOT NULL, source_input text NOT NULL, status text NOT NULL, candidate_json text NOT NULL, missing_fields_json text NOT NULL, created_at text NOT NULL)"
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("database onboarding extraction repository", () => {
  it("persists manual recovery state through the queryable boundary", async () => {
    // Given: a SQLite queryable with the extraction table.
    vi.stubEnv("DATABASE_PROVIDER", "sqlite")
    vi.stubEnv("GLOCALX_DB_PATH", createTempDatabasePath())
    const context = await openDatabaseContext()

    try {
      await context.queryable.transaction(async (transaction) => {
        await createExtractionFixture(transaction)
        const repository =
          createDatabaseOnboardingExtractionRepository(transaction)

        // When: the manual fallback state is upserted for an onboarding query.
        await repository.persistManualInputRequired({
          createdAt: new Date("2026-06-04T00:00:00.000Z"),
          extractionId: "manual-extraction-demo",
          missingFields: ["phone", "hours"],
          sourceInput: "없는가게zzzz",
          storeId: "demo-store",
        })
        const row = manualExtractionRowSchema.parse(
          await transaction.queryOne(
            "SELECT status, missing_fields_json AS missingFieldsJson FROM business_profile_extractions WHERE store_id = ? AND source_input = ?",
            ["demo-store", "없는가게zzzz"]
          )
        )

        // Then: the database row matches the existing manual recovery shape.
        expect(row).toEqual({
          missingFieldsJson: JSON.stringify(["phone", "hours"]),
          status: "MANUAL_INPUT_REQUIRED",
        })
      })
    } finally {
      await context.close()
    }
  })
})
