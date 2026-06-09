import type {
  ConfirmedStoreProfile,
  MissingBusinessField,
} from "@/domain/schemas"
import type { IntegrationAdapters } from "@/integrations/contracts"
import type { SqliteDatabase } from "@/server/db/sqlite"

export type ConfirmStoreProfileOptions = {
  readonly adapters: IntegrationAdapters
  readonly database: SqliteDatabase
  readonly profile: ConfirmedStoreProfile
  readonly storeId: string
}

export type ConfirmStoreProfileResult = {
  readonly status: "CONFIRMED"
  readonly extractionId: string
  readonly message: string
}

export function confirmedExtractionId(storeId: string): string {
  return `confirmed-extraction-${storeId}`
}

function missingFieldsForProfile(
  profile: ConfirmedStoreProfile
): readonly MissingBusinessField[] {
  return profile.hours === undefined ? ["hours"] : []
}

export function confirmStoreProfile(
  options: ConfirmStoreProfileOptions
): ConfirmStoreProfileResult {
  const extractionId = confirmedExtractionId(options.storeId)
  const confirmedAt = options.adapters.clock.now().toISOString()
  const missingFields = missingFieldsForProfile(options.profile)

  options.database
    .prepare(
      "UPDATE stores SET name = ?, address = ?, phone = ?, category = ?, hours = ?, onboarding_status = ? WHERE id = ?"
    )
    .run(
      options.profile.name,
      options.profile.address,
      options.profile.phone,
      options.profile.category,
      options.profile.hours ?? null,
      "IN_PROGRESS",
      options.storeId
    )

  options.database
    .prepare(
      "INSERT OR REPLACE INTO business_profile_extractions (id, store_id, source, source_input, status, candidate_json, missing_fields_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      extractionId,
      options.storeId,
      options.profile.source,
      options.profile.sourceInput,
      "CONFIRMED",
      JSON.stringify(options.profile),
      JSON.stringify(missingFields),
      confirmedAt
    )

  return {
    status: "CONFIRMED",
    extractionId,
    message: "매장 정보를 확인했습니다. GBP 세팅을 진행할 수 있습니다.",
  }
}
