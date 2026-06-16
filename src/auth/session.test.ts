import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { applyMigrations, openDatabase, seedDemoData } from "@/server/db/sqlite"
import type { SqliteDatabase } from "@/server/db/sqlite"

import {
  completeStoredSessionOnboarding,
  demoStoreId,
  demoUserId,
  getStoredSessionFromCookieValues,
} from "./session"

const onboardingStatuses = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
] as const

type OnboardingStatus = (typeof onboardingStatuses)[number]

const sessionStatusCases = [
  { expectedComplete: false, status: "NOT_STARTED" },
  { expectedComplete: false, status: "IN_PROGRESS" },
  { expectedComplete: true, status: "COMPLETED" },
] as const satisfies readonly {
  readonly expectedComplete: boolean
  readonly status: OnboardingStatus
}[]

const storeProfileRowSchema = z.object({
  address: z.string(),
  category: z.string(),
  hours: z.string().nullable(),
  name: z.string(),
  onboarding_status: z.enum(onboardingStatuses),
  phone: z.string().nullable(),
})

describe("stored session onboarding status", () => {
  const tempPaths: string[] = []

  afterEach(async () => {
    vi.unstubAllEnvs()
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
    tempPaths.length = 0
  })

  async function createDatabase(): Promise<SqliteDatabase> {
    const tempPath = await mkdtemp(join(tmpdir(), "glocalx-session-"))
    tempPaths.push(tempPath)
    const databasePath = join(tempPath, "session.db")
    vi.stubEnv("GLOCALX_DB_PATH", databasePath)
    const database = openDatabase(databasePath)
    applyMigrations(database)
    seedDemoData(database)
    return database
  }

  function updateDemoStoreStatus(
    database: SqliteDatabase,
    status: OnboardingStatus
  ): void {
    database
      .prepare("UPDATE stores SET onboarding_status = ? WHERE id = ?")
      .run(status, demoStoreId)
  }

  for (const statusCase of sessionStatusCases) {
    it(`resolves onboardingComplete ${String(
      statusCase.expectedComplete
    )} when database status is ${statusCase.status}`, async () => {
      // Given
      const database = await createDatabase()
      updateDemoStoreStatus(database, statusCase.status)

      // When
      const session = getStoredSessionFromCookieValues({
        onboardingComplete: statusCase.expectedComplete ? "false" : "true",
        storeId: demoStoreId,
        userId: demoUserId,
      })

      // Then
      expect(session).toEqual({
        onboardingComplete: statusCase.expectedComplete,
        storeId: demoStoreId,
        userId: demoUserId,
      })
      database.close()
    })
  }

  it("reflects database status changes in fresh session reads", async () => {
    // Given
    const database = await createDatabase()
    updateDemoStoreStatus(database, "NOT_STARTED")

    // When
    const firstSession = getStoredSessionFromCookieValues({
      onboardingComplete: "true",
      storeId: demoStoreId,
      userId: demoUserId,
    })
    updateDemoStoreStatus(database, "COMPLETED")
    const secondSession = getStoredSessionFromCookieValues({
      onboardingComplete: "false",
      storeId: demoStoreId,
      userId: demoUserId,
    })

    // Then
    expect(firstSession?.onboardingComplete).toBe(false)
    expect(secondSession?.onboardingComplete).toBe(true)
    database.close()
  })

  it("marks onboarding complete without changing existing store profile fields", async () => {
    // Given
    const database = await createDatabase()
    database
      .prepare(
        "UPDATE stores SET name = ?, address = ?, phone = ?, category = ?, hours = ?, onboarding_status = ? WHERE id = ?"
      )
      .run(
        "카페 소나무",
        "서울 성동구 왕십리로 88",
        "02-555-0142",
        "스페셜티 카페",
        "08:00 ~ 20:00",
        "IN_PROGRESS",
        demoStoreId
      )

    // When
    const completed = completeStoredSessionOnboarding({
      storeId: demoStoreId,
      userId: demoUserId,
    })

    // Then
    expect(completed).toBe(true)
    const row = storeProfileRowSchema.parse(
      database
        .prepare(
          "SELECT name, address, phone, category, hours, onboarding_status FROM stores WHERE id = ?"
        )
        .get(demoStoreId)
    )
    expect(row).toEqual({
      address: "서울 성동구 왕십리로 88",
      category: "스페셜티 카페",
      hours: "08:00 ~ 20:00",
      name: "카페 소나무",
      onboarding_status: "COMPLETED",
      phone: "02-555-0142",
    })
    database.close()
  })
})
