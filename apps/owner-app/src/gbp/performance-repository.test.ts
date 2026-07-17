import { describe, expect, it } from "vitest"

import type {
  DatabaseExecutionResult,
  DatabaseRow,
  DatabaseStatementParameters,
  Queryable,
} from "@glocalx/db"
import { loadGbpPerformanceSummaryData } from "./performance-repository"

class PerformanceSummaryQueryable implements Queryable {
  constructor(private readonly draftCount: number | string) {}

  async query(): Promise<readonly DatabaseRow[]> {
    return []
  }

  async queryOne(
    sql: string,
    parameters: DatabaseStatementParameters = []
  ): Promise<DatabaseRow | undefined> {
    expect(parameters).toEqual(["demo-store"])

    if (sql.startsWith("SELECT name, phone, category FROM stores")) {
      return {
        category: "Cafe",
        name: "Demo Cafe",
        phone: "02-1234-5678",
      }
    }
    if (sql.startsWith("SELECT status, google_location_id, updated_at")) {
      return {
        google_location_id: "locations/123",
        status: "VERIFIED",
        updated_at: "2026-06-09T00:00:00.000Z",
      }
    }
    if (sql.includes("AND status = 'PUBLISHED'")) {
      return { count: 1 }
    }
    if (sql.startsWith("SELECT COUNT(*) AS count FROM post_drafts")) {
      return { count: this.draftCount }
    }
    throw new Error(`unexpected query: ${sql}`)
  }

  async execute(): Promise<DatabaseExecutionResult> {
    throw new Error("execute is not used by performance summary reads")
  }

  async transaction(work: (transaction: Queryable) => Promise<void>) {
    await work(this)
  }
}

describe("loadGbpPerformanceSummaryData", () => {
  it("parses Postgres count strings when loading summary data", async () => {
    // Given: Postgres.js returns COUNT(*) rows as strings by default.
    const queryable = new PerformanceSummaryQueryable("2")

    // When: GBP summary data is loaded through the Queryable boundary.
    const summary = await loadGbpPerformanceSummaryData(queryable, "demo-store")

    // Then: numeric count strings are converted to safe numbers.
    expect(summary).toMatchObject({
      draftCount: 2,
      publishedCount: 1,
      storeName: "Demo Cafe",
    })
  })

  it("rejects malformed count strings when loading summary data", async () => {
    // Given: a malformed COUNT(*) value crosses the Queryable boundary.
    const queryable = new PerformanceSummaryQueryable("2.5")

    // When/Then: invalid count strings do not pass as repository data.
    await expect(
      loadGbpPerformanceSummaryData(queryable, "demo-store")
    ).rejects.toThrow()
  })
})
