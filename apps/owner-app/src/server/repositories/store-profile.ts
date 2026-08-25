import type { ConfirmedStoreProfile } from "@glocalx/domain"
import type { MissingBusinessField } from "@glocalx/domain"
import {
  confirmedExtractionId,
  type ConfirmStoreProfileResult,
} from "@/onboarding/store-profile"
import type { ConfirmedGbpStoreProfileResult } from "@glocalx/gbp-setup/store-profile"
import { createDatabaseGbpSetupStoreProfileReader } from "@glocalx/gbp-setup/repository/store-profile-store"
import type { Queryable } from "@glocalx/db"

export interface StoreProfileRepository {
  confirmProfile(options: {
    readonly now: Date
    readonly profile: ConfirmedStoreProfile
    readonly storeId: string
  }): Promise<ConfirmStoreProfileResult>
  readConfirmedGbpProfile(
    storeId: string
  ): Promise<ConfirmedGbpStoreProfileResult>
}

function missingFieldsForProfile(
  profile: ConfirmedStoreProfile
): readonly MissingBusinessField[] {
  return profile.hours === undefined ? ["hours"] : []
}

async function upsertConfirmedExtraction(
  queryable: Queryable,
  options: {
    readonly createdAt: string
    readonly extractionId: string
    readonly missingFields: readonly MissingBusinessField[]
    readonly profile: ConfirmedStoreProfile
    readonly storeId: string
  }
): Promise<void> {
  const candidateJson = JSON.stringify(options.profile)
  const missingFieldsJson = JSON.stringify(options.missingFields)
  const updated = await queryable.execute(
    "UPDATE business_profile_extractions SET store_id = ?, source = ?, source_input = ?, status = ?, candidate_json = ?, missing_fields_json = ?, created_at = ? WHERE id = ?",
    [
      options.storeId,
      options.profile.source,
      options.profile.sourceInput,
      "CONFIRMED",
      candidateJson,
      missingFieldsJson,
      options.createdAt,
      options.extractionId,
    ]
  )
  if (updated.changes > 0) {
    return
  }

  await queryable.execute(
    "INSERT INTO business_profile_extractions (id, store_id, source, source_input, status, candidate_json, missing_fields_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      options.extractionId,
      options.storeId,
      options.profile.source,
      options.profile.sourceInput,
      "CONFIRMED",
      candidateJson,
      missingFieldsJson,
      options.createdAt,
    ]
  )
}

export function createDatabaseStoreProfileRepository(
  queryable: Queryable
): StoreProfileRepository {
  const gbpProfileReader = createDatabaseGbpSetupStoreProfileReader(queryable)

  return {
    async confirmProfile(options) {
      const extractionId = confirmedExtractionId(options.storeId)
      const confirmedAt = options.now.toISOString()
      const missingFields = missingFieldsForProfile(options.profile)

      await queryable.execute(
        "UPDATE stores SET name = ?, address = ?, phone = ?, category = ?, hours = ?, onboarding_status = ? WHERE id = ?",
        [
          options.profile.name,
          options.profile.address,
          options.profile.phone,
          options.profile.category,
          options.profile.hours ?? null,
          "IN_PROGRESS",
          options.storeId,
        ]
      )
      await upsertConfirmedExtraction(queryable, {
        createdAt: confirmedAt,
        extractionId,
        missingFields,
        profile: options.profile,
        storeId: options.storeId,
      })

      return {
        status: "CONFIRMED",
        extractionId,
        message: "매장 정보를 확인했습니다. GBP 세팅을 진행할 수 있습니다.",
      }
    },

    readConfirmedGbpProfile(storeId) {
      return gbpProfileReader.readConfirmedGbpProfile(storeId)
    },
  }
}
