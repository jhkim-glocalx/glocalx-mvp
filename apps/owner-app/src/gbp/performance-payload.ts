import type { AdapterResult, HttpRequestSpec } from "@/integrations/contracts"
import type { GbpPerformanceApiResponse } from "@/integrations/contracts"

import { parseGbpPerformanceResponse } from "./performance-metrics"
import type {
  GbpPerformanceDashboardResult,
  GbpPerformanceFetch,
} from "./performance-dashboard"

export function blocked(
  code: Extract<GbpPerformanceDashboardResult, { status: "BLOCKED" }>["code"],
  message: string
): GbpPerformanceDashboardResult {
  return { code, message, status: "BLOCKED" }
}

function error(
  code: Extract<GbpPerformanceDashboardResult, { status: "ERROR" }>["code"],
  message: string
): GbpPerformanceDashboardResult {
  return { code, message, status: "ERROR" }
}

function isHttpRequestSpec(
  value: GbpPerformanceApiResponse | HttpRequestSpec
): value is HttpRequestSpec {
  return "method" in value && "url" in value && "headers" in value
}

async function readJson(response: Response): Promise<unknown | undefined> {
  try {
    return await response.json()
  } catch (caught) {
    if (caught instanceof SyntaxError) {
      return undefined
    }
    throw caught
  }
}

async function executePerformanceSpec(
  spec: HttpRequestSpec,
  fetchImpl: GbpPerformanceFetch
): Promise<GbpPerformanceApiResponse | GbpPerformanceDashboardResult> {
  let response: Response
  try {
    response = await fetchImpl(spec.url, {
      headers: spec.headers,
      method: spec.method,
      signal: AbortSignal.timeout(8_000),
    })
  } catch (caught) {
    if (caught instanceof Error) {
      return error(
        "GOOGLE_UPSTREAM_UNAVAILABLE",
        "Google Business Profile 성과 API에 연결하지 못했습니다."
      )
    }
    throw caught
  }

  if (response.status === 401 || response.status === 403) {
    return error(
      "GOOGLE_AUTH_REQUIRED",
      "Google Business Profile 성과 권한을 다시 연결해주세요."
    )
  }
  if (response.status === 429) {
    return error(
      "GOOGLE_QUOTA_EXCEEDED",
      "Google Business Profile 성과 조회 한도를 초과했습니다."
    )
  }
  if (!response.ok) {
    return error(
      "GOOGLE_UPSTREAM_ERROR",
      "Google Business Profile 성과 API가 일시적으로 응답하지 않습니다."
    )
  }

  const payload = await readJson(response)
  const parsed = parseGbpPerformanceResponse(payload)
  if (parsed === undefined) {
    return error(
      "GOOGLE_RESPONSE_MALFORMED",
      "Google Business Profile 성과 응답을 읽지 못했습니다."
    )
  }
  return parsed
}

export async function resolvePerformancePayload(
  result: AdapterResult<GbpPerformanceApiResponse | HttpRequestSpec>,
  fetchImpl: GbpPerformanceFetch
): Promise<GbpPerformanceApiResponse | GbpPerformanceDashboardResult> {
  if (result.kind === "blocked_by_credentials") {
    return blocked(
      "GOOGLE_CREDENTIALS_MISSING",
      "Google API 인증 정보가 설정되지 않았습니다."
    )
  }

  if (isHttpRequestSpec(result.value)) {
    return executePerformanceSpec(result.value, fetchImpl)
  }

  return result.value
}
