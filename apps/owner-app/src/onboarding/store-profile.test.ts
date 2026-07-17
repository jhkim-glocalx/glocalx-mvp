import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { createIntegrationAdapters } from "@glocalx/integrations"
import { openDatabaseContext } from "@glocalx/db"
import { applyMigrations, seedDemoData } from "@glocalx/db/sqlite"
import { createDatabaseStoreProfileRepository } from "@/server/repositories/store-profile"

import { confirmStoreProfile } from "./store-profile"

const confirmedRowsSchema = z.object({
  extractionStatus: z.string(),
  extractionSourceInput: z.string(),
  storeAddress: z.string(),
  storeCategory: z.string(),
  storeHours: z.string(),
  storeName: z.string(),
  storeOnboardingStatus: z.string(),
  storePhone: z.string(),
})

describe("confirmStoreProfile", () => {
  const tempPaths: string[] = []

  afterEach(async () => {
    vi.unstubAllEnvs()
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
    tempPaths.length = 0
  })

  async function createDatabaseContext() {
    const tempPath = await mkdtemp(join(tmpdir(), "glocalx-store-profile-"))
    tempPaths.push(tempPath)
    vi.stubEnv("GLOCALX_DB_PATH", join(tempPath, "store.db"))
    const context = await openDatabaseContext()
    applyMigrations(context.legacySqliteDatabase)
    seedDemoData(context.legacySqliteDatabase)
    return context
  }

  it("persists the owner-confirmed profile as the store source of truth", async () => {
    // Given
    const context = await createDatabaseContext()
    const adapters = createIntegrationAdapters({ env: {} })
    const repository = createDatabaseStoreProfileRepository(context.queryable)

    // When
    const result = await confirmStoreProfile({
      adapters,
      profile: {
        source: "NAVER_LOCAL",
        sourceInput: "https://naver.me/ramenhouse",
        name: "라멘하우스 합정점",
        address: "서울 마포구 양화로 19",
        phone: "02-987-6543",
        category: "라멘",
        hours: "11:00 ~ 22:00",
        naverPlaceUrl: "https://naver.me/ramenhouse",
      },
      repository,
      storeId: "demo-store",
    })

    // Then
    expect(result).toEqual({
      status: "CONFIRMED",
      extractionId: "confirmed-extraction-demo-store",
      message: "매장 정보를 확인했습니다. GBP 세팅을 진행할 수 있습니다.",
    })

    const row = confirmedRowsSchema.parse(
      context.legacySqliteDatabase
        .prepare(
          "SELECT stores.name AS storeName, stores.address AS storeAddress, stores.phone AS storePhone, stores.category AS storeCategory, stores.hours AS storeHours, stores.onboarding_status AS storeOnboardingStatus, business_profile_extractions.status AS extractionStatus, business_profile_extractions.source_input AS extractionSourceInput FROM stores JOIN business_profile_extractions ON business_profile_extractions.store_id = stores.id WHERE stores.id = ? AND business_profile_extractions.id = ?"
        )
        .get("demo-store", "confirmed-extraction-demo-store")
    )
    expect(row).toEqual({
      extractionStatus: "CONFIRMED",
      extractionSourceInput: "https://naver.me/ramenhouse",
      storeAddress: "서울 마포구 양화로 19",
      storeCategory: "라멘",
      storeHours: "11:00 ~ 22:00",
      storeName: "라멘하우스 합정점",
      storeOnboardingStatus: "IN_PROGRESS",
      storePhone: "02-987-6543",
    })
    await context.close()
  })
})
