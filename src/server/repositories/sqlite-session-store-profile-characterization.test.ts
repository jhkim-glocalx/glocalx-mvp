import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  completeLegacyStoredSessionOnboarding,
  demoStoreId,
  demoUserId,
  getLegacyStoredSessionFromCookieValues,
} from "@/auth/session"
import { getConfirmedGbpStoreProfile } from "@/gbp/store-profile"
import { confirmStoreProfile } from "@/onboarding/store-profile"
import { createDatabaseStoreProfileRepository } from "@/server/repositories/store-profile"

import { withRepositoryTestContext } from "./sqlite-characterization-support"

const storeProfileRowsSchema = z.object({
  extractionCount: z.number(),
  extractionSourceInput: z.string(),
  storeHours: z.string(),
  storeName: z.string(),
  storeOnboardingStatus: z.string(),
})

describe("SQLite session and store profile characterization", () => {
  it("characterizes session reads, onboarding completion, and profile upserts", async () => {
    await withRepositoryTestContext(
      async ({ adapters, database, queryable }) => {
        const storeProfileRepository =
          createDatabaseStoreProfileRepository(queryable)
        database
          .prepare("UPDATE stores SET onboarding_status = ? WHERE id = ?")
          .run("IN_PROGRESS", demoStoreId)

        const initialSession = getLegacyStoredSessionFromCookieValues({
          onboardingComplete: "true",
          storeId: demoStoreId,
          userId: demoUserId,
        })
        const completed = completeLegacyStoredSessionOnboarding({
          storeId: demoStoreId,
          userId: demoUserId,
        })
        const completedSession = getLegacyStoredSessionFromCookieValues({
          onboardingComplete: "false",
          storeId: demoStoreId,
          userId: demoUserId,
        })
        const missingSession = getLegacyStoredSessionFromCookieValues({
          onboardingComplete: "true",
          storeId: "missing-store",
          userId: demoUserId,
        })

        expect(initialSession).toEqual({
          onboardingComplete: false,
          storeId: demoStoreId,
          userId: demoUserId,
        })
        expect(completed).toBe(true)
        expect(completedSession).toEqual({
          onboardingComplete: true,
          storeId: demoStoreId,
          userId: demoUserId,
        })
        expect(missingSession).toBeUndefined()

        const firstConfirmation = await confirmStoreProfile({
          adapters,
          profile: {
            address: "서울 마포구 양화로 19",
            category: "라멘",
            hours: "11:00 ~ 22:00",
            name: "라멘하우스 합정점",
            naverPlaceUrl: "https://naver.me/ramenhouse",
            phone: "02-987-6543",
            source: "NAVER_LOCAL",
            sourceInput: "https://naver.me/ramenhouse",
          },
          repository: storeProfileRepository,
          storeId: demoStoreId,
        })
        const secondConfirmation = await confirmStoreProfile({
          adapters,
          profile: {
            address: "서울 마포구 양화로 19",
            category: "라멘",
            hours: "10:30 ~ 21:30",
            name: "라멘하우스 합정 리뉴얼",
            phone: "02-987-6543",
            source: "MANUAL",
            sourceInput: "owner-confirmed",
          },
          repository: storeProfileRepository,
          storeId: demoStoreId,
        })
        const row = storeProfileRowsSchema.parse(
          database
            .prepare(
              "SELECT stores.name AS storeName, stores.hours AS storeHours, stores.onboarding_status AS storeOnboardingStatus, business_profile_extractions.source_input AS extractionSourceInput, (SELECT COUNT(*) FROM business_profile_extractions WHERE id = 'confirmed-extraction-demo-store') AS extractionCount FROM stores JOIN business_profile_extractions ON business_profile_extractions.store_id = stores.id WHERE stores.id = ? AND business_profile_extractions.id = ?"
            )
            .get(demoStoreId, "confirmed-extraction-demo-store")
        )

        expect(firstConfirmation.extractionId).toBe(
          "confirmed-extraction-demo-store"
        )
        expect(secondConfirmation).toMatchObject({
          extractionId: "confirmed-extraction-demo-store",
          status: "CONFIRMED",
        })
        expect(row).toEqual({
          extractionCount: 1,
          extractionSourceInput: "owner-confirmed",
          storeHours: "10:30 ~ 21:30",
          storeName: "라멘하우스 합정 리뉴얼",
          storeOnboardingStatus: "IN_PROGRESS",
        })
        expect(getConfirmedGbpStoreProfile(database, demoStoreId)).toEqual({
          kind: "found",
          profile: {
            address: "서울 마포구 양화로 19",
            category: "라멘",
            hours: "10:30 ~ 21:30",
            name: "라멘하우스 합정 리뉴얼",
            phone: "02-987-6543",
            storeId: demoStoreId,
          },
        })
      }
    )
  })
})
