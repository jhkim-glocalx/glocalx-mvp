import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"

import { createIntegrationAdapters } from "@/integrations"
import { applyMigrations, openDatabase, seedDemoData } from "@/server/db/sqlite"

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
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
    tempPaths.length = 0
  })

  async function createDatabase() {
    const tempPath = await mkdtemp(join(tmpdir(), "glocalx-store-profile-"))
    tempPaths.push(tempPath)
    const database = openDatabase(join(tempPath, "store.db"))
    applyMigrations(database)
    seedDemoData(database)
    return database
  }

  it("persists the owner-confirmed profile as the store source of truth", async () => {
    // Given
    const database = await createDatabase()
    const adapters = createIntegrationAdapters({ database, env: {} })

    // When
    const result = confirmStoreProfile({
      adapters,
      database,
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
      storeId: "demo-store",
    })

    // Then
    expect(result).toEqual({
      status: "CONFIRMED",
      extractionId: "confirmed-extraction-demo-store",
      message: "매장 정보를 확인했습니다. GBP 세팅을 진행할 수 있습니다.",
    })

    const row = confirmedRowsSchema.parse(
      database
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
    database.close()
  })
})
