import type {
  AdapterBusinessProfileCandidate,
  MissingBusinessField,
} from "@/domain/schemas"
import type { Queryable } from "@glocalx/db"

export interface OnboardingExtractionRepository {
  persistCandidatesFound(options: {
    readonly candidates: readonly AdapterBusinessProfileCandidate[]
    readonly createdAt: Date
    readonly extractionId: string
    readonly sourceInput: string
    readonly storeId: string
  }): Promise<void>
  persistManualInputRequired(options: {
    readonly createdAt: Date
    readonly extractionId: string
    readonly missingFields: readonly MissingBusinessField[]
    readonly sourceInput: string
    readonly storeId: string
  }): Promise<void>
}

export function createDatabaseOnboardingExtractionRepository(
  queryable: Queryable
): OnboardingExtractionRepository {
  return {
    async persistCandidatesFound(options) {
      const firstCandidate = options.candidates[0]
      if (firstCandidate === undefined) {
        return
      }

      const candidateJson = JSON.stringify(firstCandidate)
      const missingFieldsJson = JSON.stringify(firstCandidate.missingFields)
      const createdAt = options.createdAt.toISOString()
      const updated = await queryable.execute(
        "UPDATE business_profile_extractions SET store_id = ?, source = ?, source_input = ?, status = ?, candidate_json = ?, missing_fields_json = ?, created_at = ? WHERE id = ?",
        [
          options.storeId,
          firstCandidate.source,
          options.sourceInput,
          "CANDIDATES_FOUND",
          candidateJson,
          missingFieldsJson,
          createdAt,
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
          firstCandidate.source,
          options.sourceInput,
          "CANDIDATES_FOUND",
          candidateJson,
          missingFieldsJson,
          createdAt,
        ]
      )
    },

    async persistManualInputRequired(options) {
      const candidateJson = JSON.stringify([])
      const missingFieldsJson = JSON.stringify(options.missingFields)
      const createdAt = options.createdAt.toISOString()
      const updated = await queryable.execute(
        "UPDATE business_profile_extractions SET store_id = ?, source = ?, source_input = ?, status = ?, candidate_json = ?, missing_fields_json = ?, created_at = ? WHERE id = ?",
        [
          options.storeId,
          "MANUAL",
          options.sourceInput,
          "MANUAL_INPUT_REQUIRED",
          candidateJson,
          missingFieldsJson,
          createdAt,
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
          "MANUAL",
          options.sourceInput,
          "MANUAL_INPUT_REQUIRED",
          candidateJson,
          missingFieldsJson,
          createdAt,
        ]
      )
    },
  }
}
