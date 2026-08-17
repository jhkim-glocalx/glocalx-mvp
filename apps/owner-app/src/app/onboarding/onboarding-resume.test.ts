import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import { demoStoreId } from "@/auth/session"
import { withRepositoryTestContext } from "@/server/repositories/sqlite-characterization-support"
import { createDatabaseGbpAccessStore } from "@glocalx/db/support/gbp-access-store"
import type { Queryable } from "@glocalx/db"

import { resolveOnboardingResumeState } from "./onboarding-resume"

async function clearSeededLocation(queryable: Queryable): Promise<void> {
  // The seeded demo store ships with a listing; these cases are about stores
  // that do not have one yet.
  await queryable.execute("DELETE FROM gbp_locations WHERE store_id = ?", [
    demoStoreId,
  ])
}

describe("onboarding resume state", () => {
  it("resumes an owner whose claim an operator has already confirmed", async () => {
    await withRepositoryTestContext(async ({ queryable }) => {
      // Given the seeded store's attached listing
      const state = await resolveOnboardingResumeState(queryable, demoStoreId)

      // Then
      expect(state).toEqual({ kind: "connected" })
    })
  })

  it("holds an owner on the wait screen while an operator has not ruled", async () => {
    await withRepositoryTestContext(async ({ queryable }) => {
      // Given
      await clearSeededLocation(queryable)
      await createDatabaseGbpAccessStore(queryable).openAdoptionReview({
        id: randomUUID(),
        storeId: demoStoreId,
        gbpLocationRef: "locations/org-owned",
        now: new Date(),
      })

      // When
      const state = await resolveOnboardingResumeState(queryable, demoStoreId)

      // Then
      expect(state).toEqual({ kind: "reviewing" })
    })
  })

  it("sends an owner with no GBP history through the normal chat flow", async () => {
    await withRepositoryTestContext(async ({ queryable }) => {
      // Given
      await clearSeededLocation(queryable)

      // When
      const state = await resolveOnboardingResumeState(queryable, demoStoreId)

      // Then
      expect(state).toEqual({ kind: "none" })
    })
  })

  it("does not congratulate an owner whose listing still needs claiming", async () => {
    await withRepositoryTestContext(async ({ queryable }) => {
      // Given a listing that exists but that the owner must still claim through
      // Google — resuming as "connected" would tell them they are done when the
      // work is still on their plate.
      await clearSeededLocation(queryable)
      await queryable.execute(
        `INSERT INTO gbp_locations (
           id, store_id, gbp_account_id, google_location_id, status,
           request_admin_rights_url, created_at, updated_at
         ) VALUES (?, ?, 'demo-gbp-account', ?, 'CLAIM_REQUIRED', ?, ?, ?)`,
        [
          "claim-required-location",
          demoStoreId,
          "locations/needs-claim",
          "https://business.google.com/claim",
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      )

      // When
      const state = await resolveOnboardingResumeState(queryable, demoStoreId)

      // Then
      expect(state).toEqual({ kind: "none" })
    })
  })
})
