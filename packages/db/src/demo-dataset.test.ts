import { describe, expect, it } from "vitest"

import {
  demoBaseTables,
  demoCohortTables,
  demoTables,
  type DemoRow,
  type DemoTable,
} from "./demo-dataset.ts"

const sqlIdentifierPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/

function rowsFor(
  tables: readonly DemoTable[],
  table: string
): readonly DemoRow[] {
  return tables
    .filter((entry) => entry.table === table)
    .flatMap((entry) => entry.rows)
}

function idsFor(table: string): ReadonlySet<string> {
  return new Set(rowsFor(demoTables, table).map((row) => String(row["id"])))
}

function valuesFor(table: string, column: string): readonly string[] {
  return rowsFor(demoTables, table).map((row) => String(row[column]))
}

describe("demo-dataset shape", () => {
  it("uses only safe SQL identifiers for tables and columns", () => {
    for (const { table, rows } of demoTables) {
      expect(sqlIdentifierPattern.test(table)).toBe(true)
      for (const row of rows) {
        for (const column of Object.keys(row)) {
          expect(sqlIdentifierPattern.test(column)).toBe(true)
        }
      }
    }
  })

  it("gives every row in a table the same columns (bulk insert is column-stable)", () => {
    // Both seeders derive the column list from the first row and reuse it for
    // the whole table, so a row with a different key set would silently drop or
    // misalign a column.
    for (const { table, rows } of demoTables) {
      const [firstRow, ...rest] = rows
      if (firstRow === undefined) {
        continue
      }
      const expectedColumns = Object.keys(firstRow).sort().join(",")
      for (const row of rest) {
        expect(Object.keys(row).sort().join(","), `columns for ${table}`).toBe(
          expectedColumns
        )
      }
    }
  })

  it("has unique primary keys within every table", () => {
    for (const { table, rows } of demoTables) {
      const ids = rows.map((row) => String(row["id"]))
      expect(new Set(ids).size, `duplicate id in ${table}`).toBe(ids.length)
    }
  })
})

describe("demo-dataset referential integrity", () => {
  // Every foreign-key column must point at a primary key seeded in the same
  // dataset — the seed path that runs with foreign keys ON (db:seed, Postgres)
  // would otherwise fail on an orphan child.
  const foreignKeys: ReadonlyArray<{
    readonly childTable: string
    readonly childColumn: string
    readonly parentTable: string
  }> = [
    {
      childTable: "stores",
      childColumn: "owner_user_id",
      parentTable: "users",
    },
    {
      childTable: "business_profile_extractions",
      childColumn: "store_id",
      parentTable: "stores",
    },
    {
      childTable: "oauth_connections",
      childColumn: "store_id",
      parentTable: "stores",
    },
    {
      childTable: "gbp_accounts",
      childColumn: "store_id",
      parentTable: "stores",
    },
    {
      childTable: "gbp_locations",
      childColumn: "store_id",
      parentTable: "stores",
    },
    {
      childTable: "gbp_locations",
      childColumn: "gbp_account_id",
      parentTable: "gbp_accounts",
    },
    {
      childTable: "gbp_access_requests",
      childColumn: "store_id",
      parentTable: "stores",
    },
    {
      childTable: "store_channel_links",
      childColumn: "store_id",
      parentTable: "stores",
    },
    {
      childTable: "campaign_requests",
      childColumn: "store_id",
      parentTable: "stores",
    },
    {
      childTable: "campaign_assets",
      childColumn: "request_id",
      parentTable: "campaign_requests",
    },
    {
      childTable: "campaign_review_events",
      childColumn: "request_id",
      parentTable: "campaign_requests",
    },
    {
      childTable: "publish_jobs",
      childColumn: "request_id",
      parentTable: "campaign_requests",
    },
    {
      childTable: "post_drafts",
      childColumn: "store_id",
      parentTable: "stores",
    },
    {
      childTable: "post_publish_attempts",
      childColumn: "draft_id",
      parentTable: "post_drafts",
    },
    { childTable: "reviews", childColumn: "store_id", parentTable: "stores" },
    {
      childTable: "review_replies",
      childColumn: "review_id",
      parentTable: "reviews",
    },
    {
      childTable: "cs_conversations",
      childColumn: "store_id",
      parentTable: "stores",
    },
    {
      childTable: "cs_messages",
      childColumn: "conversation_id",
      parentTable: "cs_conversations",
    },
    {
      childTable: "conversation_sessions",
      childColumn: "store_id",
      parentTable: "stores",
    },
    {
      childTable: "conversation_messages",
      childColumn: "session_id",
      parentTable: "conversation_sessions",
    },
    {
      childTable: "conversation_slot_values",
      childColumn: "session_id",
      parentTable: "conversation_sessions",
    },
    {
      childTable: "conversation_events",
      childColumn: "session_id",
      parentTable: "conversation_sessions",
    },
    { childTable: "job_runs", childColumn: "store_id", parentTable: "stores" },
    {
      childTable: "audit_logs",
      childColumn: "store_id",
      parentTable: "stores",
    },
  ]

  it.each(foreignKeys)(
    "$childTable.$childColumn references a seeded $parentTable.id",
    ({ childTable, childColumn, parentTable }) => {
      const parentIds = idsFor(parentTable)
      for (const value of valuesFor(childTable, childColumn)) {
        expect(
          parentIds.has(value),
          `${childTable}.${childColumn}=${value}`
        ).toBe(true)
      }
    }
  )
})

describe("demo-dataset tier separation", () => {
  it("keeps only the happy-path demo-store in the base fixture", () => {
    // seedDemoData (the ~40-test fixture) writes the base tier only, so it must
    // stay the single happy-path store with no cohort ids leaking in.
    const baseStores = rowsFor(demoBaseTables, "stores").map((row) =>
      String(row["id"])
    )
    expect(baseStores).toEqual(["demo-store"])

    for (const { rows } of demoBaseTables) {
      for (const row of rows) {
        expect(String(row["id"]).startsWith("demo-store-")).toBe(false)
      }
    }
  })

  it("layers all additional stores in the cohort tier", () => {
    const cohortStores = rowsFor(demoCohortTables, "stores").map((row) =>
      String(row["id"])
    )
    expect(cohortStores).toHaveLength(6)
    expect(cohortStores.every((id) => id.startsWith("demo-store-"))).toBe(true)
  })
})

describe("demo-dataset pipeline-state coverage", () => {
  it("places stores across the onboarding funnel", () => {
    const statuses = new Set(valuesFor("stores", "onboarding_status"))
    expect(statuses).toContain("IN_PROGRESS")
    expect(statuses).toContain("COMPLETED")
  })

  it("covers the GBP-access states the operator console renders", () => {
    const states = new Set(valuesFor("gbp_access_requests", "state"))
    for (const state of ["invited", "pending", "granted", "blocked"]) {
      expect(states, `missing gbp_access state ${state}`).toContain(state)
    }
  })

  it("gives the queue exactly one campaign per triage state", () => {
    const statuses = valuesFor("campaign_requests", "status")
    const expected = [
      "submitted",
      "in_production",
      "ready_for_review",
      "changes_requested",
      "partially_published",
      "published",
    ]
    expect(new Set(statuses)).toEqual(new Set(expected))
    // "exactly one per state" — no duplicate status in the seeded queue.
    expect(statuses).toHaveLength(new Set(statuses).size)
  })

  it("covers the inbox postures: human, ai_draft, and a flagged handoff", () => {
    const modes = new Set(valuesFor("cs_conversations", "mode"))
    expect(modes).toContain("human")
    expect(modes).toContain("ai_draft")

    const flagged = rowsFor(demoTables, "cs_conversations").filter(
      (row) => row["flagged_at"] !== null
    )
    expect(flagged.length).toBeGreaterThanOrEqual(1)

    // An unsent AI draft is what the ai_draft posture demonstrates.
    const draftMessages = rowsFor(demoTables, "cs_messages").filter(
      (row) => row["status"] === "draft"
    )
    expect(draftMessages.length).toBeGreaterThanOrEqual(1)
  })
})
