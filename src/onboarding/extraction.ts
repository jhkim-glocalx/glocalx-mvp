import { Buffer } from "node:buffer"

import type {
  AdapterBusinessProfileCandidate,
  MissingBusinessField,
} from "@/domain/schemas"
import type {
  HttpRequestSpec,
  IntegrationAdapters,
  NaverSearchResult,
} from "@/integrations/contracts"
import { NaverSearchUnavailableError } from "@/integrations/contracts"
import type { SqliteDatabase } from "@/server/db/sqlite"

import type { RetrievalError } from "./input-normalization"
import { normalizeOnboardingInput } from "./input-normalization"

const manualForm = {
  requiredFields: ["name", "address", "category"],
  promptedFields: ["phone", "hours"],
} as const

const promptedFields = ["phone", "hours"] as const

type ManualForm = typeof manualForm

export type BusinessProfileExtractionResult =
  | {
      readonly status: "CANDIDATES_FOUND"
      readonly normalizedQuery: string
      readonly candidates: readonly AdapterBusinessProfileCandidate[]
      readonly requiresSelection: boolean
      readonly message: string
    }
  | {
      readonly status: "MANUAL_INPUT_REQUIRED"
      readonly normalizedQuery: string
      readonly candidates: readonly []
      readonly manualForm: ManualForm
      readonly message: string
    }
  | {
      readonly status: "NAVER_REQUEST_READY"
      readonly normalizedQuery: string
      readonly request: HttpRequestSpec
    }
  | {
      readonly status: "SEARCH_QUERY_REQUIRED"
      readonly normalizedQuery: ""
      readonly retrievalError: RetrievalError
    }
  | {
      readonly status: "BLOCKED_BY_CREDENTIALS"
      readonly normalizedQuery: string
      readonly missingEnvVars: readonly string[]
      readonly message: string
    }

export type ExtractBusinessProfileOptions = {
  readonly adapters: IntegrationAdapters
  readonly database?: SqliteDatabase
  readonly input: string
  readonly storeId: string
}

export class NaverSearchTimeoutError extends Error {
  readonly name = "NaverSearchTimeoutError"

  constructor(readonly query: string) {
    super(`Naver local search timed out for ${query}`)
  }
}

function isNaverSearchResult(
  value: NaverSearchResult | HttpRequestSpec
): value is NaverSearchResult {
  return "candidates" in value
}

function candidateMissingFields(
  candidate: AdapterBusinessProfileCandidate
): MissingBusinessField[] {
  const fieldSet = new Set<MissingBusinessField>(candidate.missingFields)

  if (candidate.phone === undefined) {
    fieldSet.add("phone")
  }

  if (candidate.hours === undefined) {
    fieldSet.add("hours")
  }

  return promptedFields.filter((field) => fieldSet.has(field))
}

function normalizeCandidate(
  candidate: AdapterBusinessProfileCandidate
): AdapterBusinessProfileCandidate {
  return {
    ...candidate,
    missingFields: candidateMissingFields(candidate),
  }
}

function manualResult(
  normalizedQuery: string,
  message: string
): BusinessProfileExtractionResult {
  return {
    status: "MANUAL_INPUT_REQUIRED",
    normalizedQuery,
    candidates: [],
    manualForm,
    message,
  }
}

function stableExtractionId(storeId: string, normalizedQuery: string): string {
  const encoded = Buffer.from(`${storeId}:${normalizedQuery}`)
    .toString("base64url")
    .slice(0, 32)
  return `manual-extraction-${encoded}`
}

function persistManualInputRequired(
  database: SqliteDatabase | undefined,
  options: ExtractBusinessProfileOptions,
  normalizedQuery: string,
  result: BusinessProfileExtractionResult
): void {
  if (database === undefined || result.status !== "MANUAL_INPUT_REQUIRED") {
    return
  }

  database
    .prepare(
      "INSERT OR REPLACE INTO business_profile_extractions (id, store_id, source, source_input, status, candidate_json, missing_fields_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      stableExtractionId(options.storeId, normalizedQuery),
      options.storeId,
      "MANUAL",
      options.input,
      "MANUAL_INPUT_REQUIRED",
      JSON.stringify([]),
      JSON.stringify(result.manualForm.promptedFields),
      options.adapters.clock.now().toISOString()
    )
}

export async function extractBusinessProfile(
  options: ExtractBusinessProfileOptions
): Promise<BusinessProfileExtractionResult> {
  const normalized = normalizeOnboardingInput(options.input)
  if (normalized.kind === "search_query_required") {
    return {
      status: "SEARCH_QUERY_REQUIRED",
      normalizedQuery: "",
      retrievalError: normalized.retrievalError,
    }
  }

  try {
    const adapterResult = await options.adapters.naverSearch.searchLocal({
      query: normalized.query,
      display: 5,
      rawInput: normalized.rawInput,
    })

    if (adapterResult.kind === "blocked_by_credentials") {
      return {
        status: "BLOCKED_BY_CREDENTIALS",
        normalizedQuery: normalized.query,
        missingEnvVars: adapterResult.missingEnvVars,
        message: "네이버 API 인증 정보가 설정되지 않았습니다.",
      }
    }

    if (!isNaverSearchResult(adapterResult.value)) {
      return {
        status: "NAVER_REQUEST_READY",
        normalizedQuery: normalized.query,
        request: adapterResult.value,
      }
    }

    const candidates = adapterResult.value.candidates.map(normalizeCandidate)
    if (candidates.length === 0) {
      const result = manualResult(
        normalized.query,
        "네이버에서 매장을 찾지 못했습니다. 직접 입력으로 계속할 수 있습니다."
      )
      persistManualInputRequired(
        options.database,
        options,
        normalized.query,
        result
      )
      return result
    }

    return {
      status: "CANDIDATES_FOUND",
      normalizedQuery: normalized.query,
      candidates,
      requiresSelection: candidates.length > 1,
      message:
        candidates.length > 1
          ? "여러 매장이 검색되었습니다. 소유한 매장을 선택해주세요."
          : "네이버에서 매장 정보를 찾았습니다.",
    }
  } catch (error) {
    if (
      error instanceof NaverSearchTimeoutError ||
      error instanceof NaverSearchUnavailableError
    ) {
      const result = manualResult(
        normalized.query,
        "네이버 검색 응답이 지연되고 있습니다. 직접 입력으로 계속할 수 있습니다."
      )
      persistManualInputRequired(
        options.database,
        options,
        normalized.query,
        result
      )
      return result
    }
    throw error
  }
}
