import type { ConfirmedStoreProfile } from "@/domain/schemas"
import type { MissingBusinessField } from "@/domain/schemas"
import {
  confirmedExtractionId,
  type ConfirmStoreProfileResult,
} from "@/onboarding/store-profile"
import type { ConfirmedGbpStoreProfileResult } from "@/gbp/store-profile"
import type { Queryable } from "@glocalx/db"
import { z } from "zod"

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

const confirmedStoreRowSchema = z.object({
  address: z.string(),
  category: z.string(),
  hours: z.string().nullable(),
  id: z.string(),
  name: z.string(),
  phone: z.string(),
})

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

    async readConfirmedGbpProfile(storeId) {
      const row = await queryable.queryOne(
        "SELECT id, name, address, phone, category, hours FROM stores WHERE id = ? AND phone IS NOT NULL AND EXISTS (SELECT 1 FROM business_profile_extractions WHERE store_id = stores.id AND status = 'CONFIRMED')",
        [storeId]
      )
      const parsed = confirmedStoreRowSchema.safeParse(row)
      if (!parsed.success) {
        return { kind: "missing" }
      }

      return {
        kind: "found",
        profile: {
          address: parsed.data.address,
          category: parsed.data.category,
          ...(parsed.data.hours === null ? {} : { hours: parsed.data.hours }),
          name: parsed.data.name,
          phone: parsed.data.phone,
          storeId: parsed.data.id,
        },
      }
    },
  }
}
