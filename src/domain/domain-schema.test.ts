import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"

import {
  applyMigrations,
  openDatabase,
  requiredTableNames,
  resolveDefaultDatabasePath,
  seedDemoData,
  tableCountQueries,
} from "@/server/db/sqlite"
import { locationStatusValues } from "./location-status"

const tableNameRowSchema = z.object({
  name: z.string(),
})

const countRowSchema = z.object({
  count: z.number(),
})

describe("domain-schema persistence", () => {
  const tempPaths: string[] = []

  afterEach(async () => {
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
    tempPaths.length = 0
  })

  it("creates every required table and seeds deterministic demo records", async () => {
    const tempPath = await mkdtemp(join(tmpdir(), "glocalx-domain-schema-"))
    tempPaths.push(tempPath)
    const database = openDatabase(join(tempPath, "domain.db"))

    applyMigrations(database)
    seedDemoData(database)

    const tableRows = z
      .array(tableNameRowSchema)
      .parse(
        database
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all()
      )
    const tableNames = tableRows.map((row) => row.name)

    for (const tableName of requiredTableNames) {
      expect(tableNames).toContain(tableName)
    }

    for (const tableName of requiredTableNames) {
      const countRow = countRowSchema.parse(
        database.prepare(tableCountQueries[tableName]).get()
      )
      expect(countRow.count).toBeGreaterThan(0)
    }

    database.close()
  })
})

describe("default SQLite database path", () => {
  it("uses local project storage by default", () => {
    expect(resolveDefaultDatabasePath({})).toBe(".glocalx/dev.db")
  })

  it("uses Vercel writable scratch space when no path is configured", () => {
    expect(resolveDefaultDatabasePath({ VERCEL: "1" })).toContain(
      "glocalx/dev.db"
    )
    expect(resolveDefaultDatabasePath({ VERCEL: "1" })).not.toBe(
      ".glocalx/dev.db"
    )
  })

  it("keeps an explicit database path override", () => {
    expect(
      resolveDefaultDatabasePath({
        GLOCALX_DB_PATH: "/custom/glocalx.db",
        VERCEL: "1",
      })
    ).toBe("/custom/glocalx.db")
  })
})

describe("locationStatusValues", () => {
  it("contains every GBP location setup state required by the plan", () => {
    expect(locationStatusValues).toEqual([
      "DISCOVERED",
      "CLAIM_REQUIRED",
      "CREATE_REQUESTED",
      "VERIFICATION_PENDING",
      "VERIFIED",
      "DUPLICATE",
      "FAILED",
      "MANUAL_FOLLOW_UP",
    ])
  })
})
